// Minimal LZMA (.lzma "alone" / LZMA1) decompressor — pure, dependency-free, integer-only.
// Decodes the on-ledger art+text artifacts (lzma.FORMAT_ALONE). Browsers' DecompressionStream is gzip/deflate
// only, so this bridges xz-class compression to the client. Validated byte-exact against Python's lzma module.
// Header (13B): props(1) + dictSize(4 LE) + uncompressedSize(8 LE). Then the range-coded LZMA1 stream.

const kTop = 1 << 24, kNumBitModelTotalBits = 11, kBitModelTotal = 1 << 11, kNumMoveBits = 5;

export function decompressLZMA(input) {
  const inp = input instanceof Uint8Array ? input : new Uint8Array(input);
  // ---- header ----
  let props = inp[0];
  const lc = props % 9; props = (props / 9) | 0; const lp = props % 5, pb = (props / 5) | 0;
  let unknown = true; for (let i = 0; i < 8; i++) if (inp[5 + i] !== 0xFF) unknown = false;
  let outSize = 0; if (!unknown) for (let i = 0; i < 8; i++) outSize += inp[5 + i] * Math.pow(2, 8 * i);
  let out = new Uint8Array(unknown ? Math.max(1 << 16, inp.length * 6) : outSize); let outPos = 0;
  const ensure = (n) => { if (outPos + n > out.length) { const bigger = new Uint8Array(Math.max(out.length * 2, outPos + n)); bigger.set(out); out = bigger; } };

  // ---- range decoder ----
  let pos = 13;                                   // first code byte (byte 13 is the ignored 0)
  let code = 0, range = 0xFFFFFFFF;
  pos++;                                           // skip the mandatory 0 byte
  for (let i = 0; i < 4; i++) code = ((code << 8) | inp[pos++]) >>> 0;

  const normalize = () => { if (range < kTop) { range = (range << 8) >>> 0; code = ((code << 8) | (inp[pos++] | 0)) >>> 0; } };
  const decodeBit = (probs, i) => {
    const bound = (range >>> kNumBitModelTotalBits) * probs[i];
    let bit;
    if ((code >>> 0) < bound) { range = bound; probs[i] += (kBitModelTotal - probs[i]) >>> kNumMoveBits; bit = 0; }
    else { range = (range - bound) >>> 0; code = (code - bound) >>> 0; probs[i] -= probs[i] >>> kNumMoveBits; bit = 1; }
    normalize(); return bit;
  };
  const decodeDirect = (numBits) => {
    let res = 0;
    do {
      range = range >>> 1; code = (code - range) >>> 0;
      const t = 0 - (code >>> 31);                // 0xFFFFFFFF if underflow else 0
      code = (code + (range & t)) >>> 0;
      normalize();
      res = ((res << 1) + (t + 1)) >>> 0;
    } while (--numBits);
    return res >>> 0;
  };
  const bitTree = (probs, off, numBits) => { let m = 1; for (let i = 0; i < numBits; i++) m = (m << 1) + decodeBit(probs, off + m); return m - (1 << numBits); };
  const bitTreeRev = (probs, off, numBits) => { let m = 1, sym = 0; for (let i = 0; i < numBits; i++) { const b = decodeBit(probs, off + m); m = (m << 1) + b; sym |= b << i; } return sym; };

  // ---- probability models ----
  const mk = (n) => { const a = new Uint16Array(n); a.fill(kBitModelTotal >> 1); return a; };
  const NUM_STATES = 12;
  const IsMatch = mk(NUM_STATES << 4), IsRep = mk(NUM_STATES), IsRepG0 = mk(NUM_STATES), IsRepG1 = mk(NUM_STATES),
        IsRepG2 = mk(NUM_STATES), IsRep0Long = mk(NUM_STATES << 4);
  const PosSlot = mk(4 << 6), SpecPos = mk(115), Align = mk(16);
  const litProbs = mk(0x300 << (lc + lp));
  // length coders: choice, choice2, low[16][8], mid[16][8], high[256]
  const mkLen = () => ({ choice: mk(2), low: mk(16 << 3), mid: mk(16 << 3), high: mk(256) });
  const lenDec = mkLen(), repLenDec = mkLen();
  const decodeLen = (L, posState) => {
    if (decodeBit(L.choice, 0) === 0) return bitTree(L.low, posState << 3, 3);
    if (decodeBit(L.choice, 1) === 0) return 8 + bitTree(L.mid, posState << 3, 3);
    return 16 + bitTree(L.high, 0, 8);
  };

  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;

  while (true) {
    if (!unknown && outPos >= outSize) break;
    if (pos > inp.length + 16) break;               // safety: corrupt/truncated input
    const posState = outPos & pbMask;
    if (decodeBit(IsMatch, (state << 4) + posState) === 0) {
      // literal
      const prevByte = outPos > 0 ? out[outPos - 1] : 0;
      const litState = ((outPos & lpMask) << lc) + (prevByte >>> (8 - lc));
      const off = 0x300 * litState;
      let sym = 1;
      if (state >= 7) {
        let matchByte = out[outPos - rep0 - 1];
        do {
          const matchBit = (matchByte >>> 7) & 1; matchByte = (matchByte << 1) & 0xFF;
          const bit = decodeBit(litProbs, off + ((1 + matchBit) << 8) + sym);
          sym = (sym << 1) | bit;
          if (matchBit !== bit) { while (sym < 0x100) sym = (sym << 1) | decodeBit(litProbs, off + sym); break; }
        } while (sym < 0x100);
      } else {
        while (sym < 0x100) sym = (sym << 1) | decodeBit(litProbs, off + sym);
      }
      ensure(1); out[outPos++] = sym & 0xFF;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    // match
    let len;
    if (decodeBit(IsRep, state) === 1) {
      // rep match
      if (decodeBit(IsRepG0, state) === 0) {
        if (decodeBit(IsRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11;
          ensure(1); out[outPos] = out[outPos - rep0 - 1]; outPos++;
          continue;
        }
      } else {
        let dist;
        if (decodeBit(IsRepG1, state) === 0) dist = rep1;
        else { if (decodeBit(IsRepG2, state) === 0) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
        rep1 = rep0; rep0 = dist;
      }
      len = decodeLen(repLenDec, posState) + 2;
      state = state < 7 ? 8 : 11;
    } else {
      // new match
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = decodeLen(lenDec, posState);
      state = state < 7 ? 7 : 10;
      const lenState = len < 4 ? len : 3;
      const posSlot = bitTree(PosSlot, lenState << 6, 6);
      if (posSlot < 4) rep0 = posSlot;
      else {
        const numDirect = (posSlot >>> 1) - 1;
        rep0 = (2 | (posSlot & 1)) << numDirect;
        if (posSlot < 14) rep0 += bitTreeRev(SpecPos, rep0 - posSlot - 1, numDirect);
        else { rep0 = (rep0 + (decodeDirect(numDirect - 4) << 4)) >>> 0; rep0 += bitTreeRev(Align, 0, 4); }
      }
      if (rep0 === 0xFFFFFFFF) break;               // end marker
      len += 2;
    }
    // copy match
    ensure(len);
    for (let i = 0; i < len; i++) { out[outPos] = out[outPos - rep0 - 1]; outPos++; }
  }
  return out.subarray(0, outPos);
}
