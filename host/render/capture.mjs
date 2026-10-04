// Render ONE Ciggie Puff to an animated GIF, headless, at a given market-input state.
// Reuses the real renderer (cms/render/monkey.html) via Playwright; encodes frames with gifenc (pure JS).
//   import { makeBrowser, renderGif } from './capture.mjs'
//   CLI:  node render/capture.mjs <id> [outfile]
import { chromium } from 'playwright';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { writeFileSync } from 'node:fs';

const PAGE = new URL('monkey.html', import.meta.url).href;   // file:// self-contained harness
export const FRAMES = 20, STEP = 4, DELAY = 66;              // v1: 20 frames, ~15 fps, ~1.3s loop

export async function makeBrowser() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 1 });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__CMS && window.__CMS.ready && window.__talkReady, { timeout: 30000 });
  return { browser, page, close: () => browser.close() };
}

// Render a GIF for one token id at the given inputs (G). Returns Uint8Array (GIF bytes).
export async function renderGif(page, id, inputs) {
  await page.evaluate(([id, inputs]) => window.__CMS.render(id, inputs), [id, inputs]);
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const fr = await page.evaluate((t) => {
      const c = window.__CMS.frame(t);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let bin = ''; const CH = 0x8000; for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, i + CH));
      return { w: c.width, h: c.height, b64: btoa(bin) };
    }, f * STEP);
    frames.push({ w: fr.w, h: fr.h, rgba: new Uint8Array(Buffer.from(fr.b64, 'base64')) });
  }
  const { w, h } = frames[0];
  // ONE global palette across ALL frames (no per-frame flicker, smaller file); <=128 colours — our art uses few.
  const all = new Uint8Array(frames.reduce((n, f) => n + f.rgba.length, 0));
  let o = 0; for (const f of frames) { all.set(f.rgba, o); o += f.rgba.length; }
  const palette = quantize(all, 128);
  const gif = GIFEncoder();
  for (const fr of frames) gif.writeFrame(applyPalette(fr.rgba, palette), w, h, { palette, delay: DELAY });
  gif.finish();
  return gif.bytes();
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const id = +(process.argv[2] ?? 0);
  const out = process.argv[3] || new URL(`../out/${id}.gif`, import.meta.url).pathname;
  // demo market state (bullish-ish). In production these come from cms/bucketize.mjs.
  const inputs = { xrd: 15, early: 12, ciggie: 20, oci: 8, xrd_usd: 0.0004, early_usd: 0.000007, ciggie_usd: 0.0000002, oci_usd: 0.0003, acct: 60, nfts: 6, network: 400000 };
  const t0 = Date.now();
  const { page, close } = await makeBrowser();
  const bytes = await renderGif(page, id, inputs);
  writeFileSync(out, Buffer.from(bytes));
  await close();
  console.log(`rendered #${id} -> ${out} (${(bytes.length / 1024).toFixed(1)} KB, ${FRAMES} frames, ${Date.now() - t0} ms)`);
}
