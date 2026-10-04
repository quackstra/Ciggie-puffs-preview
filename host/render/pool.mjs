// Parallel render orchestrator: splits a set of ids into K chunks and forks K worker processes
// (render/worker.mjs), each with its own browser. K defaults to CONCURRENCY env or the vCPU count, so it
// auto-scales when the droplet is resized. Resolves when every worker finishes; rejects if any worker exits
// non-zero (so watch.mjs won't flip the pointer onto a partially-rendered bucket).
import { fork } from 'node:child_process';
import os from 'node:os';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function workerCount() {
  return Math.max(1, +(process.env.CONCURRENCY || 0) || os.cpus().length);
}

/** Render an explicit list of ids across K workers. ids may be any subset (used by incremental re-render). */
export async function renderIdsParallel({ ids, repInputs, bucketKey, concurrency, onProgress }) {
  if (!ids.length) return { rendered: 0, total_bytes: 0 };
  const K = Math.min(Math.max(1, concurrency || workerCount()), ids.length);
  const per = Math.ceil(ids.length / K);
  const dir = mkdtempSync(join(tmpdir(), 'ciggie-render-'));
  const workerUrl = new URL('./worker.mjs', import.meta.url);
  let done = 0, bytes = 0;
  const jobs = [];
  try {
    for (let k = 0; k < K; k++) {
      const chunk = ids.slice(k * per, (k + 1) * per);
      if (!chunk.length) break;
      const idsFile = join(dir, `ids-${k}.json`);
      writeFileSync(idsFile, JSON.stringify(chunk));
      const child = fork(workerUrl, [], {
        env: { ...process.env, SLICE_IDS_FILE: idsFile, BUCKET_KEY: bucketKey, REP_INPUTS: JSON.stringify(repInputs) },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      jobs.push(new Promise((resolve, reject) => {
        child.on('message', (m) => { if (m?.ok) { done++; bytes += m.bytes || 0; onProgress?.(done, ids.length, m); } });
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`render worker ${k} exited ${code}`)));
        child.on('error', reject);
      }));
    }
    await Promise.all(jobs);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
  return { rendered: done, total_bytes: bytes };
}

/** Convenience: render a contiguous range [start, start+count). */
export async function renderRangeParallel({ start = 0, count, ...rest }) {
  const ids = []; for (let i = start; i < start + count; i++) ids.push(i);
  return renderIdsParallel({ ids, ...rest });
}
