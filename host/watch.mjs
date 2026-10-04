// The v1 render loop: poll the live market bucket every POLL_MIN minutes; when the (threshold-aligned) bucket
// changes, render the whole collection at the new state, upload to R2, then flip the KV pointer LAST (so the
// redirect worker only ever points at a fully-rendered bucket — zero cold-miss). Content-addressed, so if the
// bucket hasn't changed the files already exist and nothing re-renders.
//   node watch.mjs            (renders SUPPLY tokens on each change)
import { makeBrowser } from './render/capture.mjs';
import { currentBucket, VERSION } from './bucketize.mjs';
import { renderAll } from './batch.mjs';
import { putGif, putPointer, storageReady } from './storage.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const POLL_MIN = +(process.env.POLL_MIN || 10);   // the Radix proxy caches ~1h, so 10-min polling is plenty
const SUPPLY = +(process.env.SUPPLY || 10000);
const OUT = new URL('out/', import.meta.url).pathname;
const POINTER_FILE = process.env.POINTER_FILE || `${OUT}ready_bucket`;   // the redirect server reads this
const S3 = storageReady();        // uploads to DO Spaces if creds are injected, else writes GIFs to out/

let ready = null;
console.log(`watch: VERSION=${VERSION}, poll ${POLL_MIN}m, supply ${SUPPLY}, storage=${S3 ? 'Spaces ON' : 'OFF (local out/)'}, pointer=${POINTER_FILE}`);
for (;;) {
  try {
    const { repInputs, bucketKey } = await currentBucket();
    if (bucketKey !== ready) {
      console.log(`[${new Date().toISOString()}] bucket -> ${bucketKey}\n  rendering ${SUPPLY}…`);
      const { page, close } = await makeBrowser();
      const t0 = Date.now();
      // render + upload each GIF straight to Spaces (immutable) as it's made — no 10k local files
      const m = await renderAll(page, repInputs, bucketKey, { count: SUPPLY, onGif: S3 ? (id, hash, bytes) => putGif(id, hash, Buffer.from(bytes)) : null });
      await close();
      // flip the pointer LAST so the redirect only ever resolves a fully-rendered bucket (zero cold-miss):
      // write the LOCAL file the redirect server reads, plus a Spaces copy for durability.
      try { mkdirSync(dirname(POINTER_FILE), { recursive: true }); } catch {}
      writeFileSync(POINTER_FILE, bucketKey);
      if (S3) await putPointer(bucketKey);
      ready = bucketKey;
      console.log(`  done: ${m.rendered.length} GIFs, ${(m.total_bytes / 1024 / 1024).toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s -> live`);
    } else {
      console.log(`[${new Date().toISOString()}] no change (${bucketKey.slice(0, 40)}…)`);
    }
  } catch (e) { console.error('watch error:', e.message); }
  await new Promise(r => setTimeout(r, POLL_MIN * 60_000));
}
