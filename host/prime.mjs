// One-shot: render ALL SUPPLY tokens at the CURRENT market bucket under VERSION, upload to Spaces, and write
// render_state.json — WITHOUT touching the live pointer. Used to pre-render a new VERSION / hashing scheme so
// the cutover (flip VERSION + restart) is instant with ZERO 404 window. The running services are unaffected
// (node doesn't reload files mid-process), so the live site keeps serving the old version while this runs.
//   VERSION=v2 node prime.mjs
import { currentBucket, VERSION } from './bucketize.mjs';
import { renderRangeParallel, workerCount } from './render/pool.mjs';
import { storageReady } from './storage.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SUPPLY = +(process.env.SUPPLY || 10000);
const POINTER_FILE = process.env.POINTER_FILE || '/var/lib/ciggie/ready_bucket';
const STATE_FILE = process.env.STATE_FILE || `${dirname(POINTER_FILE)}/render_state.json`;
const S3 = storageReady();

const { repInputs, bucketKey } = await currentBucket();
console.log(`prime: VERSION=${VERSION}, supply=${SUPPLY}, storage=${S3 ? 'Spaces' : 'local out/'}, workers=${workerCount()}, bucket=${bucketKey}`);
const t0 = Date.now();
const m = await renderRangeParallel({
  start: 0, count: SUPPLY, repInputs, bucketKey,
  onProgress: (d, tot) => { if (d % 500 === 0 || d === tot) console.log(`  ${d}/${tot} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); },
});
try { mkdirSync(dirname(STATE_FILE), { recursive: true }); } catch {}
writeFileSync(STATE_FILE, JSON.stringify({ version: VERSION, bucketKey }));
console.log(`primed ${m.rendered} GIFs under ${VERSION} in ${((Date.now() - t0) / 1000).toFixed(0)}s; state written (${STATE_FILE}).`);
console.log('pointer NOT touched — safe to flip VERSION + restart now for an instant cutover.');
