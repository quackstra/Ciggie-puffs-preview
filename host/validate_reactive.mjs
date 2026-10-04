// Ground-truth validator for reactive.mjs. For a sample of tokens, render the real GIF at a baseline market
// state and again with each bucket dim perturbed; if the bytes differ, the token EMPIRICALLY reacts to that
// dim. Assert every empirically-reacting dim is in the analytical reactiveDims(id) — i.e. the analytical map
// is a SUPERSET. A violation means incremental render would serve STALE art for that token. Over-approx
// (analytical says reactive but no pixel change) is fine and only reported as a count.
//   node validate_reactive.mjs [sample]   (default 150; samples ids evenly across 0..9999)
import { makeBrowser, renderGif } from './render/capture.mjs';
import { reactiveDims } from './reactive.mjs';

const SAMPLE = +(process.argv[2] || 150);
const SPAN = 10000;
const BASE = { xrd: 0, early: 0, ciggie: 0, oci: 0, xrd_usd: 0.0003, early_usd: 0.000006, ciggie_usd: 0.0000001, oci_usd: 0.0002, network: 400000, acct: 40, nfts: 3 };
// each bucket dim -> how to perturb its underlying render input to a clearly different band
const PERTURB = {
  xrd: g => ({ ...g, xrd: 25 }), early: g => ({ ...g, early: 25 }), ciggie: g => ({ ...g, ciggie: 25 }), oci: g => ({ ...g, oci: 25 }),
  net: g => ({ ...g, network: 3000 }), acct: g => ({ ...g, acct: 0 }), nfts: g => ({ ...g, nfts: 20 }),
};
const DIMS = Object.keys(PERTURB);

const { page, close } = await makeBrowser();
const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

let violations = 0, overApprox = 0, checked = 0;
const step = Math.max(1, Math.floor(SPAN / SAMPLE));
for (let id = 0; id < SPAN; id += step) {
  const base = await renderGif(page, id, BASE);
  const analytical = reactiveDims(id);
  const empirical = new Set();
  for (const dim of DIMS) {
    const g = await renderGif(page, id, PERTURB[dim](BASE));
    if (!eq(base, g)) empirical.add(dim);
  }
  checked++;
  for (const dim of empirical) if (!analytical.has(dim)) {
    violations++;
    console.log(`VIOLATION id=${id}: reacts to '${dim}' but NOT in reactiveDims={${[...analytical].join(',')}}`);
  }
  for (const dim of analytical) if (DIMS.includes(dim) && !empirical.has(dim)) overApprox++;
  if (checked % 25 === 0) console.log(`  ...${checked} checked, ${violations} violations`);
}
await close();
console.log(`\nchecked ${checked} tokens × ${DIMS.length} dims`);
console.log(`VIOLATIONS (empirical reaction NOT covered -> would be STALE): ${violations}`);
console.log(`over-approx (analytical reactive, no pixel change -> harmless extra render): ${overApprox}`);
console.log(violations === 0 ? 'PASS ✅ — reactiveDims is a safe superset on this sample' : 'FAIL ❌ — fix reactive.mjs before deploying');
process.exit(violations === 0 ? 0 : 1);
