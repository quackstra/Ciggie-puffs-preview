// One render worker: renders a set of ids (from SLICE_IDS_FILE) with its OWN browser, uploads each GIF to
// Spaces (pipelined, so network overlaps CPU). Spawned by render/pool.mjs via child_process.fork — K workers
// = K cores, parallelizing both the chromium render (~67%) and the node-side gifenc encode (~33%).
// Config via env: SLICE_IDS_FILE, BUCKET_KEY, REP_INPUTS (json), UPLOAD_CONC. Reports {ok,id,bytes} per GIF.
import { makeBrowser, renderGif } from './capture.mjs';
import { hashFor } from '../bucketize.mjs';
import { putGif, storageReady } from '../storage.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const ids = JSON.parse(readFileSync(process.env.SLICE_IDS_FILE, 'utf8'));
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
  for (const id of ids) {
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
  console.error(`worker failed: ${e.message}`);
  try { await close(); } catch {}
  process.exit(1);
}
