// Per-token reactive dependency analysis — the core of incremental re-render.
//
// A token's art is static(traits) + per-frame effects, each effect driven by ONE fx binding that reads
// G[fx.input] (see render/monkey.html renderFrame). So a token's pixels depend ONLY on the inputs its
// *active* fx bindings read (active = the effect is actually drawn for this token's traits). We map those
// inputs to the bucket dimensions and project the bucketKey onto them: two market buckets that agree on a
// token's reactive dims produce an identical GIF -> identical content hash -> no re-render.
//
// The active-fx conditions below mirror renderFrame EXACTLY (every drive()/senti() call site). Erring toward
// INCLUDING an input is safe (an extra re-render); omitting one the renderer reads would be stale art, so the
// companion validate_reactive.mjs differentially probes the real renderer to prove this map is a superset.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from './resolve.mjs';

const SPEC = JSON.parse(readFileSync(new URL('./ciggie.spec.json', import.meta.url), 'utf8'));

// fx input name (a G key) -> bucketKey dimension. *_usd are fixed nominals (not in the bucket) -> null.
const INPUT_TO_DIM = {
  xrd: 'xrd', early: 'early', ciggie: 'ciggie', oci: 'oci',
  acct: 'acct', nfts: 'nfts', network: 'net',
  xrd_usd: null, early_usd: null, ciggie_usd: null, oci_usd: null,
};

// Which fx bindings' inputs this token's render actually reads, given its traits. Mirrors renderFrame.
function activeInputs(rec) {
  const t = rec.traits, fx = rec.fx, ins = [];
  ins.push(fx.eyes.input);                                   // eyes: always (senti, line 2069)
  ins.push(fx.smoke.input);                                  // smoke: always — every monkey has a cig (2073)
  if (t.bg !== 'none') ins.push(fx.bg.input);                // bg: every bg is reactive (2040)
  if (t.body === 'tiedye' || t.body === 'whiteshirt' || t.body === 'hypersuit') ins.push(fx.body.input);  // 2053/2058/2066
  if (t.body === 'officer' || t.body === 'officer_white') ins.push(fx.rack.input);                         // 2055 (fx.rack)
  if (t.eyewear === 'patch') ins.push(fx.eyewear.input);     // 2071
  if (t.coin === 'coin' || t.coin === 'snow') ins.push(fx.coin.input);                                     // 2076/2077 (INp=_usd)
  if (t.chain === 'clock' || t.chain === 'neon_tube' || t.chain === 'bird' || t.chain === 'bib') ins.push(fx.neck.input); // 2081+
  if (t.chain === 'ticker') ins.push('ciggie');              // 2097: reads G.ciggie directly, not via fx
  if (['sombrero', 'halo_horns', 'satellite', 'tophat', 'crown', 'crown_silver', 'xmas'].includes(t.head)) ins.push(fx.head.input); // 2123+
  if (t.ear && t.ear !== 'none') ins.push(fx.ear.input);     // 2157
  return ins;
}

const _dimCache = new Map();
/** Set of bucket dimensions token `id` reacts to (cached; depends only on the seed, not on inputs). */
export function reactiveDims(id) {
  let d = _dimCache.get(id);
  if (d) return d;
  const rec = resolve(SPEC, id);
  d = new Set();
  for (const inp of activeInputs(rec)) { const dim = INPUT_TO_DIM[inp]; if (dim) d.add(dim); }
  _dimCache.set(id, d);
  return d;
}

const parse = (key) => key ? Object.fromEntries(key.split('|').map(p => { const i = p.indexOf(':'); return [p.slice(0, i), p.slice(i + 1)]; })) : {};

/** Project a full bucketKey onto the dims token `id` reacts to -> the token's content key ('static' if none). */
export function projectKey(id, bucketKey) {
  const dims = reactiveDims(id), m = parse(bucketKey);
  const kept = Object.keys(m).filter(k => dims.has(k)).sort().map(k => k + ':' + m[k]).join('|');
  return kept || 'static';
}

const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
/** Content-addressed GIF hash: identical whenever the token's *reactive* market state is identical. */
export function contentHash(version, id, bucketKey) { return sha16(version + '|' + id + '|' + projectKey(id, bucketKey)); }

/** Bucket dimensions whose quantized value changed between two bucketKeys. */
export function changedDims(prevKey, newKey) {
  const a = parse(prevKey), b = parse(newKey), out = new Set();
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.add(k);
  return out;
}
