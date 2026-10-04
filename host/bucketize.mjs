// Read the live MAINNET market state (Gateway-only, keyless), quantize it to the coarse "buckets" the art
// actually distinguishes, and derive a content-hash per token. Same market bucket -> same hash -> same GIF
// (so the CDN caches each file forever and we only render states that actually occur).
//
//   const { inputs, bucketKey } = await currentBucket();
//   const hash = hashFor(id, bucketKey);   // -> /cdn/{id}/{hash}.gif
import { contentHash } from './reactive.mjs';

// env-overridable so server.mjs and bucketize ALWAYS agree on the hash; bump when the renderer/art changes.
export const VERSION = process.env.VERSION || 'v2';
const GW = 'https://mainnet.radixdlt.com';
const XRD = 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd';
const USD = 'component_rdx1czy2naejcqx8gv46zdsex2syuxrs4jnqzug58e66zr8wglxzvu97qr';          // XRD/hUSDC precision pool
const POOLS = {                                                                              // same as dashboard NETS.mainnet
  early:  { a: 'pool_rdx1c5hm2rt67scp22pq6tpkfg6cd22g0wwz88065wsy9gdfnd86sv3t4t', k: 'basic' },
  oci:    { a: 'pool_rdx1ckyg8aujf09uh8qlz6asst75g5w6pl6vu8nl6qrhskawcndyk6585y', k: 'basic' },
  ciggie: { a: 'component_rdx1cryxd9d5q8fj8fh6qq4ayaa5kwd8hzlsk2ymn67p29q77lhudhmruj', k: 'prec' },
};
const post = (p, b) => fetch(GW + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const poolReservePrice = (it) => { const f = (it?.fungible_resources?.items) || []; const amt = a => +((f.find(x => x.resource_address === a) || {}).amount || 0); const x = amt(XRD), o = f.find(y => y.resource_address !== XRD), t = +((o || {}).amount || 0); return t > 0 ? x / t : 0; };
const sqrtP2 = (it) => { const fld = ((it?.details?.state?.fields) || []).find(x => x.field_name === 'price_sqrt'); const s = fld ? +fld.value : 0; return s * s; };

// the live 11 inputs (prices in USD via the XRD/hUSDC anchor + token/XRD pools; network = 24h stateVersion delta)
export async function fetchInputs() {
  const G = { xrd: 0, early: 0, ciggie: 0, oci: 0, xrd_usd: 0, early_usd: 0, ciggie_usd: 0, oci_usd: 0, acct: 30, nfts: 3, network: 400000 };
  try {
    const addrs = [USD, ...Object.values(POOLS).map(p => p.a)];
    const now = await post('/state/entity/details', { addresses: addrs, aggregation_level: 'Global' });
    const ago = new Date(new Date(now.ledger_state.proposer_round_timestamp).getTime() - 864e5).toISOString();
    const old = await post('/state/entity/details', { addresses: addrs, aggregation_level: 'Global', at_ledger_state: { timestamp: ago } });
    const byA = o => Object.fromEntries((o.items || []).map(it => [it.address, it]));
    const N = byA(now), O = byA(old);
    const xun = sqrtP2(N[USD]), xuo = sqrtP2(O[USD]);
    const pct = (n, o) => o > 0 ? clamp(((n - o) / o) * 100, -30, 30) : 0;
    G.xrd_usd = xun; G.xrd = pct(xun, xuo);
    for (const [k, e] of Object.entries(POOLS)) {
      const xn = e.k === 'prec' ? sqrtP2(N[e.a]) : poolReservePrice(N[e.a]);
      const xo = e.k === 'prec' ? sqrtP2(O[e.a]) : poolReservePrice(O[e.a]);
      if (xn > 0) { G[k + '_usd'] = xn * xun; G[k] = pct(xn * xun, xo * xuo); }
    }
    // network 24h throughput
    const head = await post('/stream/transactions', { limit_per_page: 1, order: 'Desc' });
    const ago2 = new Date(new Date(head.ledger_state.proposer_round_timestamp).getTime() - 864e5).toISOString();
    const o2 = await post('/stream/transactions', { limit_per_page: 1, order: 'Asc', from_ledger_state: { timestamp: ago2 } });
    const then = o2.items?.[0]?.state_version; if (then) G.network = Math.min(head.ledger_state.state_version - then, 1e6);
  } catch (e) { /* keep defaults on any failure */ }
  return G;
}

// v1 bucketing — snap to the bands the ART actually distinguishes, keyed to the renderer's OWN thresholds.
// 24h% -> the 6 mood tiers (the renderer's moodFromPct boundaries); render each at its tier's representative
// value. network/acct/nfts -> coarse bands. Price *levels* (*_usd) DON'T change the look, so they're rendered
// at fixed nominals and EXCLUDED from the hash key (keeps the cache from fragmenting on invisible price ticks).
const TIER = pct => pct >= 20 ? 0 : pct >= 6 ? 1 : pct >= -5 ? 2 : pct >= -12 ? 3 : pct >= -22 ? 4 : 5;
const TIER_REP = [25, 12, 0, -8, -17, -26];                 // a canonical % per mood tier (what we actually render)
const PCT = ['xrd', 'early', 'ciggie', 'oci'];
const USD_NOMINAL = { xrd_usd: 0.0003, early_usd: 0.000006, ciggie_usd: 0.0000001, oci_usd: 0.0002 };

// -> { repInputs (deterministic render state for this bucket), bucketKey (hash key, visual fields only) }
export function quantize(G) {
  const rep = { ...USD_NOMINAL }, key = {};
  for (const k of PCT) { const t = TIER(clamp(G[k], -30, 30)); rep[k] = TIER_REP[t]; key[k] = t; }
  const nb = Math.round(Math.log10(Math.max(1, G.network)) * 2) / 2; rep.network = Math.round(Math.pow(10, nb)); key.net = nb;
  const ab = Math.min(120, Math.round(G.acct / 20) * 20); rep.acct = ab; key.acct = ab;
  const nf = Math.min(24, Math.round(G.nfts)); rep.nfts = nf; key.nfts = nf;
  return { repInputs: rep, bucketKey: Object.keys(key).sort().map(k => k + ':' + key[k]).join('|') };
}
// content-addressed per-token: projects the bucket onto the token's reactive dims (see reactive.mjs)
export function hashFor(id, bucketKey) { return contentHash(VERSION, id, bucketKey); }

export async function currentBucket() {
  const inputs = await fetchInputs();
  const { repInputs, bucketKey } = quantize(inputs);
  return { inputs, repInputs, bucketKey };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { inputs, repInputs, bucketKey } = await currentBucket();
  console.log('live inputs :', JSON.stringify(inputs));
  console.log('render state:', JSON.stringify(repInputs));
  console.log('bucketKey   :', bucketKey, `(${bucketKey.length} chars)`);
  console.log('hash(#0)    :', hashFor(0, bucketKey), '-> /cdn/0/' + hashFor(0, bucketKey) + '.gif');
}
