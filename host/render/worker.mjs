// One render worker: renders a contiguous slice of ids with its OWN browser, uploads each GIF to Spaces
// (pipelined, so network overlaps CPU). Spawned by render/pool.mjs via child_process.fork — K workers = K
// cores, which parallelizes BOTH the chromium render (~67%) and the node-side gifenc encode (~33%).
// Config via env: SLICE_START, SLICE_COUNT, BUCKET_KEY, REP_INPUTS (json), UPLOAD_CONC. Reports {ok,id,bytes}.
import { makeBrowser, renderGif } from './capture.mjs';
import { hashFor } from '../bucketize.mjs';
import { putGif, storageReady } from '../storage.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const start = +process.env.SLICE_START;
const count = +process.env.SLICE_COUNT;
const bucketKey = process.env.BUCKET_KEY;
const repInputs = JSON.parse(process.env.REP_INPUTS);
const UPLOAD_CONC = +(process.env.UPLOAD_CONC || 6);
const S3 = storageReady();
const OUT = new URL('../out/', import.meta.url).pathname;

const { page, close } = await makeBrowser();

// bounded pool of in-flight uploads so S3 PUTs overlap the next render instead of blocking it
const inflight = new Set();
let failed = null;
function track(pr) {
  const p = pr.then(() => inflight.delete(p)).catch((e) => { inflight.delete(p); failed = failed || e; });
  inflight.add(p);
}
async function gate() { while (inflight.size >= UPLOAD_CONC) await Promise.race(inflight); }

try {
  for (let id = start; id < start + count; id++) {
    if (failed) throw failed;
    const hash = hashFor(id, bucketKey);
    const bytes = await renderGif(page, id, repInputs);
    if (S3) { await gate(); track(putGif(id, hash, Buffer.from(bytes))); }
    else { const dir = `${OUT}${id}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${hash}.gif`, Buffer.from(bytes)); }
    process.send?.({ ok: true, id, bytes: bytes.length });
  }
  while (inflight.size) await Promise.race(inflight);
  if (failed) throw failed;
  await close();
  process.exit(0);
} catch (e) {
  console.error(`worker slice ${start}..${start + count - 1} failed: ${e.message}`);
  try { await close(); } catch {}
  process.exit(1);
}
