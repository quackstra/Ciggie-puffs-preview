// Loom collection engine — deterministic RECIPE resolver.
//
// A collection is defined by a spec (alphabets + grammar + weighted slots + reactive bindings); a token is
// just a SEED. resolve(spec, seed) -> recipe (the concrete, deterministic per-token choices). On-chain you
// store the spec once + a seed per token; the recipe is DERIVED at render time, never stored. evaluate()
// turns a recipe's fx binding + live ledger inputs into a 0..1 drive / -1..1 sentiment for the renderer.
//
// Integer-only hashing (FNV-1a, same as the dashboard), so resolution is identical on-chain and off.

export function h32(s) { let h = 0x811c9dc5; s = '' + s; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/** Weighted deterministic choice from `options` ([name, weight][]) for (seed, group). */
export function weightedPick(prefix, seed, group, options) {
  const total = options.reduce((a, x) => a + x[1], 0);
  let r = h32(prefix + ':' + seed + ':' + group) % total;
  for (const [name, w] of options) { if (r < w) return name; r -= w; }
  return options[options.length - 1][0];
}

/** Resolve a spec + seed into a concrete recipe: { seed, traits, recolor, fx }. Pure + deterministic. */
export function resolve(spec, seed) {
  const P = spec.seedPrefix, pick = (g, o) => weightedPick(P, seed, g, o);

  const traits = {};
  for (const [slot, opts] of Object.entries(spec.slots)) {
    const v = pick(slot, opts);
    const boolTrue = spec.boolSlots && spec.boolSlots[slot];
    traits[slot] = boolTrue !== undefined ? v === boolTrue : v;
  }

  const fx = {};
  for (const [name, def] of Object.entries(spec.fx || {})) {
    fx[name] = {
      input:  pick(name + '_in', spec.inputPools[def.pool]),
      dir:    pick(name + '_dir', spec.fxShared.dir),
      window: pick(name + '_win', spec.fxShared.window),
      sens:   pick(name + '_sens', spec.fxShared.sens),
      signal: def.signal,
    };
  }

  const recolor = {};
  for (const rc of spec.recolor || []) {
    if (traits[rc.slot] === rc.when) recolor[rc.slot] = { op: rc.op, steps: h32(rc.seedKey + seed) % rc.mod };
  }

  return { seed, traits, recolor, fx };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Evaluate one fx binding against live inputs ({pct,price,vol}): -> 0..1 (drive) or -1..1 (sentiment). */
export function evaluate(spec, fxBinding, inputs) {
  const raw = inputs[fxBinding.input], ic = spec.inputs[fxBinding.input];
  if (fxBinding.signal === 'senti') {
    const s = ic.kind === 'signed' ? raw / ic.scale : (raw / ic.scale) * 2 - 1;
    return clamp(fxBinding.dir === 'down' ? -s : s, -1, 1);
  }
  let n;
  if (ic.kind === 'signed') { const s = raw / ic.scale; n = fxBinding.dir === 'up' ? Math.max(0, s) : fxBinding.dir === 'down' ? Math.max(0, -s) : Math.abs(s); }
  else { const x = raw / ic.scale; n = fxBinding.dir === 'down' ? 1 - x : x; }
  const [o, s] = spec.sens[fxBinding.sens];                 // sensitivity curve: remap [o,s] -> [0,1]
  return clamp((n - o) / (s - o), 0, 1);
}
