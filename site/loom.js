// src/core/loom/varint.ts
function zigzag(n) {
  return (n << 1 ^ n >> 31) >>> 0;
}
function unzigzag(u) {
  return u >>> 1 ^ -(u & 1);
}
var ByteWriter = class {
  buf = [];
  u8(v) {
    this.buf.push(v & 255);
  }
  bytes(a) {
    for (const b of a) this.buf.push(b & 255);
  }
  varint(v) {
    if (v < 0 || !Number.isInteger(v)) throw new Error(`varint expects a non-negative integer, got ${v}`);
    do {
      const b = v & 127;
      v = Math.floor(v / 128);
      this.buf.push(b | (v ? 128 : 0));
    } while (v);
  }
  svarint(v) {
    this.varint(zigzag(v));
  }
  get length() {
    return this.buf.length;
  }
  toBytes() {
    return Uint8Array.from(this.buf);
  }
};
var ByteReader = class {
  constructor(b, i = 0) {
    this.b = b;
    this.i = i;
  }
  b;
  i;
  get done() {
    return this.i >= this.b.length;
  }
  u8() {
    if (this.i >= this.b.length) throw new Error("ByteReader: read past end");
    return this.b[this.i++];
  }
  varint() {
    let shift = 0, val2 = 0, byte;
    do {
      if (this.i >= this.b.length) throw new Error("ByteReader: truncated varint");
      byte = this.b[this.i++];
      val2 += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    return val2;
  }
  svarint() {
    return unzigzag(this.varint());
  }
  bytes(n) {
    if (this.i + n > this.b.length) throw new Error("ByteReader: truncated bytes");
    const s = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return s;
  }
};

// src/core/loom/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var rotr = (x, n) => x >>> n | x << 32 - n;
function sha256(msg) {
  const H = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const total = withOne + (56 - withOne % 64 + 64) % 64 + 8;
  const m = new Uint8Array(total);
  m.set(msg);
  m[msg.length] = 128;
  const hi = Math.floor(bitLen / 2 ** 32), lo = bitLen >>> 0;
  m[total - 8] = hi >>> 24 & 255;
  m[total - 7] = hi >>> 16 & 255;
  m[total - 6] = hi >>> 8 & 255;
  m[total - 5] = hi & 255;
  m[total - 4] = lo >>> 24 & 255;
  m[total - 3] = lo >>> 16 & 255;
  m[total - 2] = lo >>> 8 & 255;
  m[total - 1] = lo & 255;
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = m[off + t * 4] << 24 | m[off + t * 4 + 1] << 16 | m[off + t * 4 + 2] << 8 | m[off + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ w[t - 15] >>> 3;
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ w[t - 2] >>> 10;
      w[t] = w[t - 16] + s0 + w[t - 7] + s1 >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[t] + w[t] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
    H[5] = H[5] + f >>> 0;
    H[6] = H[6] + g >>> 0;
    H[7] = H[7] + h >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = H[i] >>> 24 & 255;
    out[i * 4 + 1] = H[i] >>> 16 & 255;
    out[i * 4 + 2] = H[i] >>> 8 & 255;
    out[i * 4 + 3] = H[i] & 255;
  }
  return out;
}
function sha256hex(msg) {
  return Array.from(sha256(msg), (b) => b.toString(16).padStart(2, "0")).join("");
}

// src/core/loom/feather.ts
function toYCoCg(px) {
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i], G = px[i + 1], B = px[i + 2];
    const Co = R - B;
    const t = B + (Co >> 1);
    const Cg = G - t;
    const Y = t + (Cg >> 1);
    px[i] = Y;
    px[i + 1] = Co;
    px[i + 2] = Cg;
  }
}
function fromYCoCg(px) {
  for (let i = 0; i < px.length; i += 4) {
    const Y = px[i], Co = px[i + 1], Cg = px[i + 2];
    const t = Y - (Cg >> 1);
    const G = Cg + t;
    const B = t - (Co >> 1);
    const R = B + Co;
    px[i] = R;
    px[i + 1] = G;
    px[i + 2] = B;
  }
}
function med(a, b, c) {
  const mx = a >= b ? a : b, mn = a >= b ? b : a;
  return c >= mx ? mn : c <= mn ? mx : a + b - c;
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function predict(a, b, c, x, y, usePaeth) {
  if (x === 0 && y === 0) return 0;
  if (y === 0) return a;
  if (x === 0) return b;
  return usePaeth ? paeth(a, b, c) : med(a, b, c);
}
function encodeIntraPlane(src, w, h, usePaeth, k, out) {
  const step = 2 * k + 1, rec = new Int32Array(w * h), sub = new ByteWriter();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = x > 0 ? rec[y * w + x - 1] : 0, b = y > 0 ? rec[(y - 1) * w + x] : 0, c = x > 0 && y > 0 ? rec[(y - 1) * w + x - 1] : 0;
    const pred = predict(a, b, c, x, y, usePaeth);
    const r = src[y * w + x] - pred;
    const q = k === 0 ? r : Math.round(r / step);
    rec[y * w + x] = pred + q * step;
    sub.svarint(q);
  }
  const blob = sub.toBytes();
  out.varint(blob.length);
  out.bytes(blob);
  return rec;
}
function decodeIntraPlane(rd, w, h, usePaeth, k) {
  const step = 2 * k + 1, blen = rd.varint(), sub = new ByteReader(rd.bytes(blen)), rec = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = x > 0 ? rec[y * w + x - 1] : 0, b = y > 0 ? rec[(y - 1) * w + x] : 0, c = x > 0 && y > 0 ? rec[(y - 1) * w + x - 1] : 0;
    const pred = predict(a, b, c, x, y, usePaeth);
    rec[y * w + x] = pred + sub.svarint() * step;
  }
  return rec;
}
function boxDown(px, w, h, s) {
  const dw = w / s, dh = h / s, d = new Int32Array(dw * dh * 4), half = s * s >> 1;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) for (let ch = 0; ch < 4; ch++) {
    let sum = 0;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) sum += px[((y * s + yy) * w + (x * s + xx)) * 4 + ch];
    d[(y * dw + x) * 4 + ch] = Math.floor((sum + half) / (s * s));
  }
  return { d, w: dw, h: dh };
}
function nnUp(px, w, h, s) {
  const uw = w * s, uh = h * s, u = new Int32Array(uw * uh * 4);
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) for (let ch = 0; ch < 4; ch++)
    u[(y * uw + x) * 4 + ch] = px[(Math.floor(y / s) * w + Math.floor(x / s)) * 4 + ch];
  return u;
}
var clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
function encodeFeather(frames, w, h, opts = {}) {
  const usePaeth = opts.predictor === "paeth", ycocg = opts.colorspace === "ycocg";
  const k = opts.k ?? 0, scale = opts.scale ?? 1, temporal = opts.temporal ?? frames.length > 1;
  if (k > 0 && ycocg) throw new Error("near-lossless requires colorspace=rgb (docs \xA75)");
  if (scale !== 1 && (w % scale || h % scale)) throw new Error("feather scale must divide layer dims");
  const intraK = temporal ? 0 : k;
  const out = new ByteWriter();
  out.u8(0);
  out.u8((ycocg ? 1 : 0) | (usePaeth ? 2 : 0) | (temporal ? 4 : 0));
  out.u8(k);
  out.u8(scale);
  const sw = w / scale, sh = h / scale;
  const small = frames.map((f) => {
    const p = Int32Array.from(f);
    const { d } = scale === 1 ? { d: p } : boxDown(p, w, h, scale);
    if (ycocg) toYCoCg(d);
    return d;
  });
  out.varint(sw);
  out.varint(sh);
  out.varint(4);
  out.varint(frames.length);
  const planeOf = (px, ch) => {
    const o = new Int32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) o[i] = px[i * 4 + ch];
    return o;
  };
  const recPrev = [];
  for (let ch = 0; ch < 4; ch++) recPrev.push(encodeIntraPlane(planeOf(small[0], ch), sw, sh, usePaeth, intraK, out));
  const step = 2 * k + 1;
  for (let fi = 1; fi < frames.length; fi++) {
    for (let ch = 0; ch < 4; ch++) {
      const cur = planeOf(small[fi], ch), rp = recPrev[ch], sub = new ByteWriter();
      for (let i = 0; i < sw * sh; i++) {
        const delta = cur[i] - rp[i];
        const q = k === 0 ? delta : Math.round(delta / step);
        rp[i] = rp[i] + q * step;
        sub.svarint(q);
      }
      const blob = sub.toBytes();
      out.varint(blob.length);
      out.bytes(blob);
    }
  }
  return out.toBytes();
}
function decodeFeather(rd, canvasW, canvasH) {
  rd.u8();
  const flags = rd.u8(), k = rd.u8(), scale = rd.u8();
  const ycocg = (flags & 1) !== 0, usePaeth = (flags & 2) !== 0, temporal = (flags & 4) !== 0;
  const intraK = temporal ? 0 : k;
  const sw = rd.varint(), sh = rd.varint(), nch = rd.varint(), nf = rd.varint();
  if (nch !== 4) throw new Error("feather v0 expects 4 channels");
  const step = 2 * k + 1;
  const rec = [];
  for (let ch = 0; ch < 4; ch++) rec.push(decodeIntraPlane(rd, sw, sh, usePaeth, intraK));
  const frames = [];
  const emit = () => {
    const px = new Int32Array(sw * sh * 4);
    for (let ch = 0; ch < 4; ch++) for (let i = 0; i < sw * sh; i++) px[i * 4 + ch] = rec[ch][i];
    if (ycocg) fromYCoCg(px);
    const up = scale === 1 ? px : nnUp(px, sw, sh, scale);
    const uw = sw * scale, uh = sh * scale, out = new Uint8Array(canvasW * canvasH * 4);
    for (let y = 0; y < Math.min(uh, canvasH); y++) for (let x = 0; x < Math.min(uw, canvasW); x++)
      for (let ch = 0; ch < 4; ch++) out[(y * canvasW + x) * 4 + ch] = clamp(up[(y * uw + x) * 4 + ch]);
    frames.push(out);
  };
  emit();
  for (let fi = 1; fi < nf; fi++) {
    for (let ch = 0; ch < 4; ch++) {
      const blen = rd.varint(), sub = new ByteReader(rd.bytes(blen)), rp = rec[ch];
      for (let i = 0; i < sw * sh; i++) rp[i] = rp[i] + sub.svarint() * step;
    }
    emit();
  }
  return frames;
}

// src/core/loom/indexed.ts
function rleEncode(idx, out) {
  let i = 0;
  while (i < idx.length) {
    const v = idx[i];
    let run = 1;
    while (i + run < idx.length && idx[i + run] === v) run++;
    out.varint(run);
    out.u8(v);
    i += run;
  }
}
function rleDecode(rd, n) {
  const idx = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const run = rd.varint(), v = rd.u8();
    idx.fill(v, i, i + run);
    i += run;
  }
  return idx;
}
function encodeIndexedCellDiff(frames, palette, w, h, ticks) {
  const pc = palette.length / 4;
  if (pc > 256) throw new Error("indexed palette > 256");
  if (w > 256 || h > 256) throw new Error("indexed layer > 256x256");
  const out = new ByteWriter();
  out.varint(pc);
  out.bytes(palette);
  out.varint(w);
  out.varint(h);
  out.varint(frames.length);
  out.u8(0);
  rleEncode(frames[0], out);
  let prev = frames[0];
  for (let f = 0; f < frames.length; f++) {
    out.varint(ticks?.[f] ?? 4);
    out.u8(0);
    const cur = frames[f];
    if (f === 0) {
      out.varint(0);
      continue;
    }
    const segs = [];
    let i = 0;
    while (i < cur.length) {
      if (cur[i] !== prev[i]) {
        const start = i;
        const bytes = [];
        while (i < cur.length && cur[i] !== prev[i]) {
          bytes.push(cur[i]);
          i++;
        }
        segs.push({ off: start, bytes });
      } else i++;
    }
    out.varint(segs.length);
    let last = 0;
    for (const s of segs) {
      out.varint(s.off - last);
      out.varint(s.bytes.length);
      out.bytes(s.bytes);
      last = s.off + s.bytes.length;
    }
    prev = cur;
  }
  return out.toBytes();
}
function encodeIndexedPaletteCycle(keyframe, palette, w, h, frames) {
  const pc = palette.length / 4;
  const out = new ByteWriter();
  out.varint(pc);
  out.bytes(palette);
  out.varint(w);
  out.varint(h);
  out.varint(frames.length);
  out.u8(0);
  rleEncode(keyframe, out);
  for (const fr of frames) {
    out.varint(fr.tick);
    out.u8(1);
    out.u8(fr.lo & 255);
    out.u8(fr.hi & 255);
    out.svarint(fr.rot);
  }
  return out.toBytes();
}
function encodeIndexedPan(tiles, tilemap, tileDim, mapWTiles, mapHTiles, palette, viewportW, viewportH, frames) {
  const pc = palette.length / 4;
  if (viewportW > 256 || viewportH > 256) throw new Error("indexed layer > 256x256");
  if (tilemap.length !== mapWTiles * mapHTiles) throw new Error("tilemap size mismatch");
  const out = new ByteWriter();
  out.varint(pc);
  out.bytes(palette);
  out.varint(viewportW);
  out.varint(viewportH);
  out.varint(frames.length);
  out.u8(1);
  out.varint(tileDim);
  out.varint(mapWTiles);
  out.varint(mapHTiles);
  out.varint(tiles.length);
  for (const t of tiles) {
    if (t.length !== tileDim * tileDim) throw new Error("tile size mismatch");
    out.bytes(t);
  }
  for (const id of tilemap) out.varint(id);
  for (const fr of frames) {
    const combo = fr.lo !== void 0;
    out.varint(fr.tick);
    out.u8(combo ? 3 : 2);
    out.svarint(fr.ox);
    out.svarint(fr.oy);
    if (combo) {
      out.u8((fr.lo ?? 0) & 255);
      out.u8((fr.hi ?? 0) & 255);
      out.svarint(fr.rot ?? 0);
    }
  }
  return out.toBytes();
}
function applyPalette(idx, pal, canvasW, canvasH, w, h) {
  const out = new Uint8Array(canvasW * canvasH * 4);
  for (let y = 0; y < Math.min(h, canvasH); y++) for (let x = 0; x < Math.min(w, canvasW); x++) {
    const ix = idx[y * w + x], o = (y * canvasW + x) * 4;
    if (ix === 0) {
      out[o + 3] = 0;
      continue;
    }
    out[o] = pal[ix * 4];
    out[o + 1] = pal[ix * 4 + 1];
    out[o + 2] = pal[ix * 4 + 2];
    out[o + 3] = pal[ix * 4 + 3];
  }
  return out;
}
function cyclePalette(pal, lo, hi, rot) {
  const span = hi - lo + 1;
  if (span <= 0) return;
  const snap = pal.slice(lo * 4, (hi + 1) * 4);
  for (let e = 0; e < span; e++) {
    const src = ((e - rot) % span + span) % span;
    pal.set(snap.subarray(src * 4, src * 4 + 4), (lo + e) * 4);
  }
}
function decodeIndexed(rd, canvasW, canvasH) {
  const pc = rd.varint();
  const basePal = rd.bytes(pc * 4);
  const w = rd.varint(), h = rd.varint(), nf = rd.varint();
  const hasTileset = rd.u8();
  const pal = Uint8Array.from(basePal);
  const frames = [];
  if (!hasTileset) {
    const idx = rleDecode(rd, w * h);
    for (let f = 0; f < nf; f++) {
      rd.varint();
      const op = rd.u8();
      if (op === 0) {
        const nseg = rd.varint();
        let cursor = 0;
        for (let s = 0; s < nseg; s++) {
          const delta = rd.varint(), len = rd.varint();
          cursor += delta;
          for (let j = 0; j < len; j++) idx[cursor + j] = rd.u8();
          cursor += len;
        }
      } else if (op === 1) {
        cyclePalette(pal, rd.u8(), rd.u8(), rd.svarint());
      } else throw new Error(`indexed op ${op} requires a tileset`);
      frames.push(applyPalette(idx, pal, canvasW, canvasH, w, h));
    }
    return frames;
  }
  const tileDim = rd.varint(), mapW = rd.varint(), mapH = rd.varint(), nTiles = rd.varint();
  const tiles = [];
  for (let t = 0; t < nTiles; t++) tiles.push(Uint8Array.from(rd.bytes(tileDim * tileDim)));
  const tilemap = [];
  for (let i = 0; i < mapW * mapH; i++) tilemap.push(rd.varint());
  const mapPxW = mapW * tileDim, mapPxH = mapH * tileDim;
  for (let f = 0; f < nf; f++) {
    rd.varint();
    const op = rd.u8();
    const ox = rd.svarint(), oy = rd.svarint();
    if (op === 3) cyclePalette(pal, rd.u8(), rd.u8(), rd.svarint());
    else if (op !== 2) throw new Error(`indexed tileset op ${op} invalid`);
    const idx = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = ((x + ox) % mapPxW + mapPxW) % mapPxW, sy = ((y + oy) % mapPxH + mapPxH) % mapPxH;
      const tile = tiles[tilemap[(sy / tileDim | 0) * mapW + (sx / tileDim | 0)]];
      idx[y * w + x] = tile[sy % tileDim * tileDim + sx % tileDim];
    }
    frames.push(applyPalette(idx, pal, canvasW, canvasH, w, h));
  }
  return frames;
}
function rgbaToIndices(frame, palette, w, h) {
  const pc = palette.length / 4, idx = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (frame[p * 4 + 3] === 0) {
      idx[p] = 0;
      continue;
    }
    const r = frame[p * 4], g = frame[p * 4 + 1], b = frame[p * 4 + 2];
    let best = 1, bd = Infinity;
    for (let c = 1; c < pc; c++) {
      const dr = r - palette[c * 4], dg = g - palette[c * 4 + 1], db = b - palette[c * 4 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    idx[p] = best;
  }
  return idx;
}

// src/core/loom/document.ts
var MAGIC = Uint8Array.from([76, 79, 79, 77]);
var BLEND_ID = { normal: 0, multiply: 1, replace: 2 };
var BLEND_NAME = ["normal", "multiply", "replace"];
var CAPS = { canvas: 1024, frames: 256, layers: 32 };
function encodeDocument(doc) {
  if (doc.canvasW > CAPS.canvas || doc.canvasH > CAPS.canvas) throw new Error("canvas > 1024");
  if (doc.nFrames > CAPS.frames) throw new Error("n_frames > 256");
  if (doc.layers.length > CAPS.layers) throw new Error("n_layers > 32");
  const out = new ByteWriter();
  out.bytes(MAGIC);
  out.u8(0);
  out.u8(doc.includeHash ? 1 : 0);
  out.varint(doc.canvasW);
  out.varint(doc.canvasH);
  out.varint(doc.nFrames);
  out.varint(doc.layers.length);
  for (const L of doc.layers) {
    const mode = L.mode === "feather" ? 1 : 0;
    const flags = mode | (L.visible === false ? 0 : 1) << 2 | BLEND_ID[L.blend ?? "normal"] << 3;
    out.u8(flags);
    out.varint(L.body.length);
    out.bytes(L.body);
  }
  if (doc.includeHash) {
    const { hash } = renderDocument(out.toBytes());
    out.bytes(hash);
  }
  return out.toBytes();
}
function renderDocument(bytes) {
  const rd = new ByteReader(bytes);
  for (let i = 0; i < 4; i++) if (rd.u8() !== MAGIC[i]) throw new Error("bad magic");
  const version = rd.u8();
  if (version !== 0) throw new Error(`unsupported loom version ${version}`);
  const docFlags = rd.u8();
  const canvasW = rd.varint(), canvasH = rd.varint(), nFrames = rd.varint(), nLayers = rd.varint();
  const composited = Array.from({ length: nFrames }, () => new Uint8Array(canvasW * canvasH * 4));
  for (let li = 0; li < nLayers; li++) {
    const flags = rd.u8(), bodyLen = rd.varint(), body = rd.bytes(bodyLen);
    const mode = flags & 3, visible = flags >> 2 & 1, blend = BLEND_NAME[flags >> 3 & 3] ?? "normal";
    const sub = new ByteReader(body);
    const layerFrames = mode === 1 ? decodeFeather(sub, canvasW, canvasH) : decodeIndexed(sub, canvasW, canvasH);
    if (!visible) continue;
    for (let f = 0; f < nFrames; f++) over(composited[f], layerFrames[f % layerFrames.length], blend);
  }
  const cat = new Uint8Array(nFrames * canvasW * canvasH * 4);
  for (let f = 0; f < nFrames; f++) cat.set(composited[f], f * canvasW * canvasH * 4);
  const hash = sha256(cat), hashHex = sha256hex(cat);
  const res = { canvasW, canvasH, nFrames, frames: composited, hash, hashHex };
  if (docFlags & 1) {
    const stored = bytes.subarray(bytes.length - 32);
    res.storedHash = Array.from(stored, (b) => b.toString(16).padStart(2, "0")).join("");
    res.hashOk = res.storedHash === hashHex;
  }
  return res;
}
function over(dst, src, blend) {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3];
    if (sa === 0) continue;
    if (blend === "replace" || sa === 255 && blend === "normal") {
      dst[i] = src[i];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i + 2];
      dst[i + 3] = sa;
      continue;
    }
    const da = dst[i + 3];
    const iaa = Math.floor((da * (255 - sa) + 127) / 255);
    const outA = sa + iaa;
    for (let c = 0; c < 3; c++) {
      const d = dst[i + c];
      const s = blend === "multiply" ? Math.floor((src[i + c] * d + 127) / 255) : src[i + c];
      dst[i + c] = outA === 0 ? 0 : Math.floor((s * sa + d * iaa + (outA >> 1)) / outA);
    }
    dst[i + 3] = outA;
  }
}
function loomHashHex(bytes) {
  return renderDocument(bytes).hashHex;
}

// src/core/loom/collection.ts
var HUE_STEPS = 16;
var COS = Array.from({ length: HUE_STEPS }, (_, i) => Math.round(Math.cos(i * 2 * Math.PI / HUE_STEPS) * 256));
var SIN = Array.from({ length: HUE_STEPS }, (_, i) => Math.round(Math.sin(i * 2 * Math.PI / HUE_STEPS) * 256));
var clamp2 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
function recolor(pal, op, steps, delta) {
  const out = Uint8Array.from(pal), c = COS[(steps % HUE_STEPS + HUE_STEPS) % HUE_STEPS], s = SIN[(steps % HUE_STEPS + HUE_STEPS) % HUE_STEPS];
  for (let i = 0; i < pal.length; i += 4) {
    if (pal[i + 3] === 0) continue;
    const R = pal[i], G = pal[i + 1], B = pal[i + 2];
    const Co = R - B, t = B + (Co >> 1), Cg = G - t, Y = t + (Cg >> 1);
    let Y2 = Y, Co2 = Co, Cg2 = Cg;
    if (op === "hue") {
      Co2 = Co * c - Cg * s >> 8;
      Cg2 = Co * s + Cg * c >> 8;
    } else Y2 = Y + delta;
    const t2 = Y2 - (Cg2 >> 1), G2 = Cg2 + t2, B2 = t2 - (Co2 >> 1), R2 = B2 + Co2;
    out[i] = clamp2(R2);
    out[i + 1] = clamp2(G2);
    out[i + 2] = clamp2(B2);
    out[i + 3] = pal[i + 3];
  }
  return out;
}
function resolvePalette(graph, name, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(name)) throw new Error(`palette-graph cycle at "${name}"`);
  const node = graph[name];
  if (!node) throw new Error(`palette node "${name}" not found`);
  seen.add(name);
  if (node.kind === "abs") {
    const pal = new Uint8Array(node.entries.length * 4);
    node.entries.forEach((e, i) => pal.set(e, i * 4));
    return pal;
  }
  const parent = resolvePalette(graph, node.parent, seen);
  if (node.kind === "inherit") {
    const pal = Uint8Array.from(parent);
    for (const [ix, rgba] of Object.entries(node.patch ?? {})) pal.set(rgba, Number(ix) * 4);
    return pal;
  }
  return recolor(parent, node.op, node.steps ?? 0, node.delta ?? 0);
}

// src/core/loom/conditional.ts
function keyOf(c) {
  if (c.arg === void 0) return c.input;
  const a = c.arg;
  if ("token_id" in a) return `${c.input}:token:${String(a["token_id"])}`;
  if ("trait" in a) return `${c.input}:trait:${String(a["trait"])}`;
  return `${c.input}:${JSON.stringify(a)}`;
}
var val = (inputs, key) => inputs.now[key] ?? 0;
function compare(a, op, b) {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
}
function plainBand(value, edges) {
  let i = 0;
  while (i < edges.length && value >= edges[i]) i++;
  return Math.max(0, Math.min(i - 1, edges.length - 1));
}
function bandWithHysteresis(value, prev, edges, margin) {
  if (margin > 0 && prev !== void 0) {
    const nearEdge = edges.some((e) => Math.abs(value - e) < margin);
    if (nearEdge) return plainBand(prev, edges);
  }
  return plainBand(value, edges);
}
function evalCond(c, inputs) {
  if ("all" in c && c.all) return { fired: c.all.every((s) => evalCond(s, inputs).fired) };
  if ("any" in c && c.any) return { fired: c.any.some((s) => evalCond(s, inputs).fired) };
  if ("not" in c && c.not) return { fired: !evalCond(c.not, inputs).fired };
  if ("band" in c) {
    const bc = c, key = keyOf(bc);
    return { fired: true, band: bandWithHysteresis(val(inputs, key), inputs.prev?.[key], bc.band, bc.margin ?? 0) };
  }
  if ("in" in c) {
    const sc = c;
    return { fired: sc.in.includes(val(inputs, keyOf(sc))) };
  }
  const cc = c;
  return { fired: compare(val(inputs, keyOf(cc)), cc.op, cc.value) };
}
function resolveEffect(eff, band) {
  if (eff.if_band !== void 0 && eff.if_band !== band) return null;
  const out = { layer: eff.layer, effect: eff.effect };
  if (eff.by_band) {
    if (band === void 0 || band >= eff.by_band.length) return null;
    out.to = eff.by_band[band];
  } else if (eff.to !== void 0) out.to = eff.to;
  else if (eff.mul !== void 0) out.mul = eff.mul;
  else if (eff.cycle_mul !== void 0) out.cycle_mul = eff.cycle_mul;
  return out;
}
function evaluate(spec, _tokenId, inputs) {
  const byTarget = /* @__PURE__ */ new Map();
  for (const rule of spec.rules ?? []) {
    const r = evalCond(rule.when, inputs);
    if (!r.fired) continue;
    for (const eff of rule.then) {
      const res = resolveEffect(eff, r.band);
      if (res) byTarget.set(`${res.layer}:${res.effect}`, res);
    }
  }
  return [...byTarget.values()];
}
export {
  ByteReader,
  ByteWriter,
  MAGIC,
  bandWithHysteresis,
  decodeFeather,
  decodeIndexed,
  encodeDocument,
  encodeFeather,
  encodeIndexedCellDiff,
  encodeIndexedPaletteCycle,
  encodeIndexedPan,
  evaluate,
  keyOf,
  loomHashHex,
  plainBand,
  renderDocument,
  resolvePalette,
  rgbaToIndices,
  sha256,
  sha256hex,
  unzigzag,
  zigzag
};
