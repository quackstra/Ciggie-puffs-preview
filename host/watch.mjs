// The render loop: poll the live market bucket every POLL_MIN minutes; when the (threshold-aligned) bucket
// changes, re-render ONLY the tokens whose reactive dims changed, upload to Spaces, then flip the pointer LAST
// (so the redirect only ever resolves a fully-rendered bucket — zero cold-miss).
//
// INCREMENTAL: content hashing is projected onto each token's reactive dims (reactive.mjs), so a token whose
// reactive dims are unchanged keeps the SAME filename -> its existing GIF is still valid -> no re-render, no
// upload, no copy. We render only tokens whose reactiveDims intersect the dims that actually changed.
// A full render happens on first run or a VERSION bump (tracked in a small state file).
//   node watch.mjs
import { currentBucket, VERSION } from './bucketize.mjs';
import { reactiveDims, changedDims } from './reactive.mjs';
import { renderIdsParallel, workerCount } from './render/pool.mjs';
import { putPointer, storageReady } from './storage.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const POLL_MIN = +(process.env.POLL_MIN || 10);   // the Radix proxy caches ~1h, so 10-min polling is plenty
const SUPPLY = +(process.env.SUPPLY || 10000);
const OUT = new URL('out/', import.meta.url).pathname;
const POINTER_FILE = process.env.POINTER_FILE || `${OUT}ready_bucket`;         // the redirect server reads this
const STATE_FILE = process.env.STATE_FILE || `${dirname(POINTER_FILE)}/render_state.json`;  // last fully-rendered bucket
const S3 = storageReady();        // uploads to DO Spaces if creds are injected, else writes GIFs to out/

const loadState = () => { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; } };
const saveState = (bucketKey) => { try { mkdirSync(dirname(STATE_FILE), { recursive: true }); } catch {} writeFileSync(STATE_FILE, JSON.stringify({ version: VERSION, bucketKey })); };

// ids whose reactive dims intersect the set of dims that changed between prev and the new bucket
function affectedIds(prevKey, bucketKey) {
  const changed = changedDims(prevKey, bucketKey);
  if (!changed.size) return { ids: [], changed };
  const ids = [];
  for (let id = 0; id < SUPPLY; id++) {
    const dims = reactiveDims(id);
    for (const d of changed) { if (dims.has(d)) { ids.push(id); break; } }
  }
  return { ids, changed };
}

let state = loadState();   // { version, bucketKey } of what is fully rendered + live, or null
console.log(`watch: VERSION=${VERSION}, poll ${POLL_MIN}m, supply ${SUPPLY}, storage=${S3 ? 'Spaces ON' : 'OFF (local out/)'}, workers=${workerCount()}, pointer=${POINTER_FILE}`);

// On startup, make the pointer reflect the last fully-rendered bucket for THIS version, so a restart after a
// prime/cutover (or any restart) serves the already-rendered files immediately — zero cold-miss.
if (state && state.version === VERSION) {
  try { mkdirSync(dirname(POINTER_FILE), { recursive: true }); } catch {}
  writeFileSync(POINTER_FILE, state.bucketKey);
  if (S3) { try { await putPointer(state.bucketKey); } catch {} }
  console.log(`  startup: pointer synced to ${state.bucketKey}`);
}
for (;;) {
  try {
    const { repInputs, bucketKey } = await currentBucket();
    const prev = (state && state.version === VERSION) ? state.bucketKey : null;
    if (!prev || bucketKey !== state.bucketKey) {
      let ids, mode;
      if (!prev) { ids = Array.from({ length: SUPPLY }, (_, i) => i); mode = 'FULL (first run / VERSION bump)'; }
      else { const a = affectedIds(prev, bucketKey); ids = a.ids; mode = `INCREMENTAL — dims {${[...a.changed].join(',')}} -> ${ids.length}/${SUPPLY} tokens`; }
      const t0 = Date.now();
      console.log(`[${new Date().toISOString()}] bucket -> ${bucketKey}\n  ${mode}, ${workerCount()} workers`);
      if (ids.length) {
        const m = await renderIdsParallel({
          ids, repInputs, bucketKey,
          onProgress: (d, tot) => { if (d % 500 === 0 || d === tot) console.log(`  ${d}/${tot} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); },
        });
        console.log(`  rendered ${m.rendered} GIFs, ${(m.total_bytes / 1024 / 1024).toFixed(1)} MB`);
      }
      // flip the pointer LAST so the redirect only ever resolves a fully-rendered bucket (unaffected tokens keep
      // their existing files because their projected hash is unchanged):
      try { mkdirSync(dirname(POINTER_FILE), { recursive: true }); } catch {}
      writeFileSync(POINTER_FILE, bucketKey);
      if (S3) await putPointer(bucketKey);
      saveState(bucketKey);
      state = { version: VERSION, bucketKey };
      console.log(`  -> live (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } else {
      console.log(`[${new Date().toISOString()}] no change (${bucketKey.slice(0, 40)}…)`);
    }
  } catch (e) { console.error('watch error:', e.message); }
  await new Promise(r => setTimeout(r, POLL_MIN * 60_000));
}
