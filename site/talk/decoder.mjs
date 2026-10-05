// Talking-Loom reference decoder. Reads the binary .loomtalk and, from (nftId, price%), assembles a
// deterministic, closed-output line: template skeleton + {GEN:n} trigram walk over CLEAN adjacencies
// (candidates forming a banned trigram in the DENY set are skipped). SplitMix64 streams per spec.
// NOTE: demo seeds streams from an FNV hash of inputs; the full spec uses Blake2b frame_hash over ledger state.
const MASK=(1n<<64n)-1n;
function splitmix64(seed){ let s=seed&MASK; return ()=>{ s=(s+0x9E3779B97F4A7C15n)&MASK; let z=s;
  z=((z^(z>>30n))*0xBF58476D1CE4E5B9n)&MASK; z=((z^(z>>27n))*0x94D049BB133111EBn)&MASK; return (z^(z>>31n))&MASK; }; }
function fnv64(str){ let h=0xcbf29ce484222325n; for(let i=0;i<str.length;i++){ h^=BigInt(str.charCodeAt(i)); h=(h*0x100000001b3n)&MASK; } return h; }
function wpick(next, weights){ let total=0; for(const w of weights) total+=w; let r=Number(next()%BigInt(total));
  for(let i=0;i<weights.length;i++){ if(r<weights[i]) return i; r-=weights[i]; } return weights.length-1; }

export function parse(bytes){
  const b=new Uint8Array(bytes); let p=0;
  const u8=()=>b[p++], u16=()=>{const v=b[p]|(b[p+1]<<8);p+=2;return v;}, u32=()=>{const v=b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]*16777216);p+=4;return v;};
  const uv=()=>{let x=0,s=0,c;do{c=b[p++];x|=(c&0x7f)<<s;s+=7;}while(c&0x80);return x>>>0;};
  if(String.fromCharCode(b[0],b[1],b[2],b[3])!=='LMTK') throw new Error('bad magic');
  p=4; const ver=u16(), nsec=u8(); const T={};
  for(let i=0;i<nsec;i++){ const id=u8(),off=u32(),len=u32(); T[id]={off,len}; }
  const rStr=()=>{const n=uv();let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(b[p++]);return s;};
  const rIds=()=>{const n=uv();const a=[];for(let i=0;i<n;i++)a.push(uv());return a;};
  p=T[1].off; const nd=uv(); const dict=[]; for(let i=0;i<nd;i++) dict.push(rStr());
  p=T[2].off; const nm=uv(); const moods=[]; for(let i=0;i<nm;i++) moods.push(rIds());
  p=T[3].off; const ndir=uv(); const dirs=[]; for(let i=0;i<ndir;i++) dirs.push(rIds());
  p=T[4].off; const names=rIds();
  p=T[5].off; const nt=uv(); const templates=[];
  for(let i=0;i<nt;i++){ const gate=u8(), w=uv(), nb=uv(), body=[];
    for(let k=0;k<nb;k++){ const t=uv(); if(t<4) body.push({slot:t}); else if(t===4){ body.push({gen:uv()}); } else body.push({word:t-5}); }
    templates.push({gate,w,body}); }
  // NGRAM (grouped by w1; candidates delta-coded w3 + 1-byte weight)
  const rCands=()=>{ const nc=uv(),list=[]; let prev=0; for(let k=0;k<nc;k++){ prev+=uv(); const w=b[p++]; list.push({w3:prev,w}); } return list; };
  p=T[6].off; const tri=new Map(); const bi=new Map();
  const nw1=uv(); for(let i=0;i<nw1;i++){ const a=uv(), nrows=uv(); for(let r=0;r<nrows;r++){ const bb=uv(); tri.set(a+','+bb, rCands()); } }
  const nbi=uv(); for(let i=0;i<nbi;i++){ const b2=uv(); bi.set(b2, rCands()); }
  const uni=rCands();
  // DENY
  p=T[7].off; const deny=new Set(); const ndny=uv(); for(let i=0;i<ndny;i++){ const a=uv(),bb=uv(),c=uv(); deny.add(a+','+bb+','+c); }
  // 4-GRAM (context = last 3 words): grouped by w1 -> rows (w2,w3,cands)
  const four=new Map();
  if(T[8]){ p=T[8].off; const nw1f=uv(); for(let i=0;i<nw1f;i++){ const a=uv(), nrows=uv(); for(let r=0;r<nrows;r++){ const bb=uv(), cc=uv(); four.set(a+','+bb+','+cc, rCands()); } } }
  // 5-GRAM (context = last 4 words): grouped by w1 -> rows (w2,w3,w4,cands)
  const five=new Map();
  if(T[9]){ p=T[9].off; const nw1g=uv(); for(let i=0;i<nw1g;i++){ const a=uv(), nrows=uv(); for(let r=0;r<nrows;r++){ const bb=uv(), cc=uv(), dd=uv(); five.set(a+','+bb+','+cc+','+dd, rCands()); } } }
  // REVERSE-ENDING model: §10 bigram (penult -> enders), §11 trigram ((w-3,w-2) -> enders). Sets of ender word-ids.
  const revbi=new Map(), revtri=new Map();
  const rEnders=()=>{ const nc=uv(); const s=new Set(); let prev=0; for(let k=0;k<nc;k++){ prev+=uv(); s.add(prev); } return s; };
  if(T[10]){ p=T[10].off; const n=uv(); for(let i=0;i<n;i++){ const pw=uv(); revbi.set(pw, rEnders()); } }
  if(T[11]){ p=T[11].off; const nw1=uv(); for(let i=0;i<nw1;i++){ const a=uv(), nrows=uv(); for(let r=0;r<nrows;r++){ const bb=uv(); revtri.set(a+','+bb, rEnders()); } } }
  const sId=dict.indexOf('<s>'), eId=dict.indexOf('</s>');
  // words that can naturally END a sentence (END appears among their continuations) -> wind GEN spans down cleanly
  const endable=new Set(); for(const [w2,cands] of bi){ for(const c of cands){ if(c.w3===eId){ endable.add(w2); break; } } }
  return {ver,dict,moods,dirs,names,templates,tri,bi,uni,four,five,deny,sId,eId,endable,revbi,revtri};
}

const TRAIL=new Set(['and','or','but','the','a','an','my','your','our','of','to','on','in','at','is','are','was','for','so','that','this','with','as','we','i','it','its','just','still','because','while','like','than','then','when','into','from','up','down']);
export function moodFromPct(pct){ return pct>=20?0 : pct>=6?1 : pct>=-5?2 : pct>=-12?3 : pct>=-22?4 : 5; }
export function dirFromPct(pct){ return pct>2?0 : pct<-2?1 : 2; }

export function decode(doc, nftId, pct){
  const moodId=moodFromPct(pct), dirId=dirFromPct(pct), absPct=Math.abs(Math.trunc(pct));
  const stream=(label,extra='')=>splitmix64(fnv64(`LOOMTALK/${label}:${nftId}:${moodId}:${extra}`));
  const cands=doc.templates.filter(t=>(t.gate>>moodId)&1);
  const t=cands[wpick(stream('tpl'), cands.map(c=>c.w))];
  const out=[]; let si=0, c0=doc.sId, ca=doc.sId, cb=doc.sId, cc=doc.sId;   // 4-word context for the 5-gram walk
  const pushW=(id)=>{ if(id!==doc.sId&&id!==doc.eId) out.push(doc.dict[id]); c0=ca; ca=cb; cb=cc; cc=id; };
  for(const tok of t.body){
    if(tok.word!==undefined){ pushW(tok.word); continue; }
    if(tok.gen!==undefined){
      const gs=stream('gen',String(si++));
      for(let i=0;i<tok.gen;i++){
        let list=doc.five.get(c0+','+ca+','+cb+','+cc)||doc.four.get(ca+','+cb+','+cc)||doc.tri.get(cb+','+cc)||doc.bi.get(cc)||doc.uni;   // 5 -> 4 -> 3 -> 2 -> 1 backoff
        list=list.filter(c=>!doc.deny.has(cb+','+cc+','+c.w3));   // only clean adjacencies (trigram-level DENY)
        if(!list.length) break;
        if(i===tok.gen-1){   // final token: complete the longest REAL corpus ending — 3-word (revtri) -> 2-word (revbi) -> 1-word (endable)
          const rT=doc.revtri&&doc.revtri.get(cb+','+cc), rB=doc.revbi&&doc.revbi.get(cc);
          let term = rT ? list.filter(c=>rT.has(c.w3)) : [];
          if(!term.length && rB) term = list.filter(c=>rB.has(c.w3));
          if(!term.length) term = list.filter(c=>c.w3===doc.eId||doc.endable.has(c.w3));
          if(term.length) list=term; }
        const pick=list[wpick(gs, list.map(c=>c.w))];            // WEIGHTED -> fluent; multi-feed input entropy keeps uniqueness high
        if(pick.w3===doc.eId) break;                             // END stops the span
        pushW(pick.w3);
      }
      continue;
    }
    const s=stream('slot',String(si++));
    if(tok.slot===0){ const ws=doc.moods[moodId]; pushW(ws[wpick(s, ws.map(()=>1))]); }
    else if(tok.slot===1){ const ws=doc.dirs[dirId]; pushW(ws[wpick(s, ws.map(()=>1))]); }
    else if(tok.slot===2){ pushW(doc.names[Number(stream('name')()%BigInt(doc.names.length))]); }
    else if(tok.slot===3){ out.push(String(absPct)); c0=ca; ca=cb; cb=cc; cc=doc.sId; }
  }
  while(out.length>3 && TRAIL.has(out[out.length-1])) out.pop();   // trim dangling trailing connectives
  return out.join(' ');
}

// ---- CLI self-test (node only) ----
if(typeof process!=='undefined' && process.argv && import.meta.url===`file://${process.argv[1]}`){
  const { readFileSync }=await import('node:fs'); const { gunzipSync }=await import('node:zlib');
  const { decompressLZMA }=await import('/home/quackstra/ciggie-puffs/dashboard/lzma.mjs');
  let raw=new Uint8Array(readFileSync('/home/quackstra/ciggie-puffs/talkingloom/ciggie.loomtalk'));
  if(raw[0]===0x1f&&raw[1]===0x8b) raw=gunzipSync(raw);
  else if(raw.length>13&&raw[0]!==0x1f&&raw[5]===0xFF&&raw[12]===0xFF) raw=decompressLZMA(raw);
  const doc=parse(raw);
  const dictSet=new Set(doc.dict);
  console.log(`parsed: ${doc.dict.length} words, ${doc.templates.length} templates, ${doc.tri.size} trigram ctx`);
  console.log('\n-- #7 across moods --');
  for(const pct of [28,10,0,-8,-18,-30]) console.log(`pct ${String(pct).padStart(3)} -> "${decode(doc,7,pct)}"`);
  console.log('\n-- 8 different monkeys, bullish (+12) --');
  for(const id of [0,1,2,3,4,5,6,7]) console.log(`#${id} -> "${decode(doc,id,12)}"`);
  // WORST CASE: all 10k at the same mood (seed-only entropy)
  const same=new Set(); for(let id=0;id<10000;id++) same.add(decode(doc,id,12));
  // REALISTIC: each monkey reads a different blend of signals -> a per-token effective market reading (spread
  // across the mood range), as the final collection will (XRD/EARLY/CIGGIE/network/account/OCI).
  const real=new Set(); let open=0;
  for(let id=0;id<10000;id++){ const pct=Number(fnv64('mkt:'+id)%61n)-30; const line=decode(doc,id,pct); real.add(line);
    for(const w of line.split(' ')) if(!dictSet.has(w)&&!/^\d+$/.test(w)) open++; }
  const det=decode(doc,4242,-15)===decode(doc,4242,-15);
  console.log(`\nWEIGHTED pick:`);
  console.log(`  worst case (all same mood)      : ${same.size} / 10000 unique`);
  console.log(`  realistic (per-token mood spread): ${real.size} / 10000 unique | deterministic ${det} | non-dict tokens ${open}`);
}
