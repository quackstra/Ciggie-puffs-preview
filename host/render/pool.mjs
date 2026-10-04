// Parallel render orchestrator: splits [start, start+count) into K contiguous slices and forks K worker
// processes (render/worker.mjs), each with its own browser. K defaults to CONCURRENCY env or the vCPU count,
// so it auto-scales when the droplet is resized. Resolves when every worker finishes; rejects if any worker
// exits non-zero (so watch.mjs won't flip the pointer onto a partially-rendered bucket).
import { fork } from 'node:child_process';
import os from 'node:os';

export function workerCount() {
  return Math.max(1, +(process.env.CONCURRENCY || 0) || os.cpus().length);
}

export async function renderRangeParallel({ start = 0, count, repInputs, bucketKey, concurrency, onProgress }) {
  const K = Math.max(1, concurrency || workerCount());
  const per = Math.ceil(count / K);
  const workerUrl = new URL('./worker.mjs', import.meta.url);
  let done = 0, bytes = 0;

  const jobs = [];
  for (let k = 0; k < K; k++) {
    const s = start + k * per;
    const c = Math.min(per, start + count - s);
    if (c <= 0) break;
    const child = fork(workerUrl, [], {
      env: { ...process.env, SLICE_START: String(s), SLICE_COUNT: String(c), BUCKET_KEY: bucketKey, REP_INPUTS: JSON.stringify(repInputs) },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    jobs.push(new Promise((resolve, reject) => {
      child.on('message', (m) => { if (m?.ok) { done++; bytes += m.bytes || 0; onProgress?.(done, count, m); } });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`render worker (ids ${s}..${s + c - 1}) exited ${code}`)));
      child.on('error', reject);
    }));
  }
  await Promise.all(jobs);
  return { rendered: done, total_bytes: bytes };
}
