// Batch-render a set of tokens at a given market bucket -> content-addressed GIFs + a manifest.
// Exports renderAll() (reused by watch.mjs); runnable directly for a one-off render.
//   node batch.mjs [count] [startId]      (prototype default: 8 tokens from id 0)
import { makeBrowser, renderGif } from './render/capture.mjs';
import { currentBucket, hashFor, VERSION } from './bucketize.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('out/', import.meta.url).pathname;

// Render ids [start, start+count) at repInputs for this bucket. One browser page, reused. Returns a manifest.
// onGif(id, hash, bytes): called per GIF — e.g. upload to R2. If omitted, writes to out/{id}/{hash}.gif.
export async function renderAll(page, repInputs, bucketKey, { count, start = 0, log = false, onGif = null } = {}) {
  const manifest = { version: VERSION, bucketKey, rendered: [], total_bytes: 0 };
  for (let id = start; id < start + count; id++) {
    const hash = hashFor(id, bucketKey);
    const bytes = await renderGif(page, id, repInputs);
    if (onGif) await onGif(id, hash, bytes);
    else { const dir = `${OUT}${id}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${hash}.gif`, Buffer.from(bytes)); }
    manifest.rendered.push({ id, hash, path: `cdn/${id}/${hash}.gif`, bytes: bytes.length });
    manifest.total_bytes += bytes.length;
    if (log) process.stdout.write(`  #${id} -> ${hash}.gif (${(bytes.length / 1024).toFixed(0)} KB)\n`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 1));
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = +(process.argv[2] ?? 8), start = +(process.argv[3] ?? 0);
  const { repInputs, bucketKey } = await currentBucket();
  console.log(`bucket ${VERSION} | ${bucketKey}`);
  console.log(`rendering ${count} tokens (#${start}..#${start + count - 1}) at ${JSON.stringify(repInputs)}…`);
  const { page, close } = await makeBrowser();
  const t0 = Date.now();
  const m = await renderAll(page, repInputs, bucketKey, { count, start, log: true });
  await close();
  const n = m.rendered.length, ms = Date.now() - t0;
  console.log(`\ndone: ${n} GIFs, ${(m.total_bytes / 1024 / 1024).toFixed(1)} MB, ${ms} ms (${(ms / n).toFixed(0)} ms/token)`);
  console.log(`→ production: watch.mjs uploads to R2 + writes the ready_bucket pointer. bucket="${bucketKey}"`);
}
