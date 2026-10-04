// The redirect service (runs on the Droplet, behind Caddy TLS at ciggiepuffs.xrd.social).
// GET /img/{id}.png  ->  302  ->  {CDN_BASE}/cdn/{id}/{hash}.gif   where hash = contentHash(VERSION,id,bucketKey)
// projected onto the token's reactive dims (reactive.mjs) — so unaffected tokens keep their existing file.
// Reads the current bucketKey from a LOCAL pointer file that watch.mjs writes (same box — instant, no network).
// Hash MUST match bucketize.mjs hashFor() — both go through reactive.contentHash().
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { contentHash } from './reactive.mjs';

const VERSION = process.env.VERSION || 'v2';
const CDN_BASE = process.env.CDN_BASE || 'https://cdn.ciggiepuffs.xrd.social';
const POINTER_FILE = process.env.POINTER_FILE || '/var/lib/ciggie/ready_bucket';
const PORT = +(process.env.PORT || 8080);

createServer((req, res) => {
  const path = (req.url || '').split('?')[0];
  if (path === '/health') { res.writeHead(200); return res.end('ok'); }
  const m = path.match(/^\/img\/(\d+)\.png$/) || path.match(/^\/ciggie-puffs\/(\d+)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = m[1];
  let bucketKey = '';
  try { bucketKey = readFileSync(POINTER_FILE, 'utf8').trim(); } catch { /* not rendered yet */ }
  const target = bucketKey
    ? `${CDN_BASE}/cdn/${id}/${contentHash(VERSION, id, bucketKey)}.gif`
    : `${CDN_BASE}/cdn/${id}/placeholder.gif`;
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-cache, must-revalidate' });
  res.end();
}).listen(PORT, () => console.log(`ciggie redirect on :${PORT} (VERSION=${VERSION}, CDN_BASE=${CDN_BASE})`));
