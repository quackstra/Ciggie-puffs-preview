# Ciggie Puffs — on-ledger preview

A bare-bones, fully static page that renders the **Ciggie Puffs** NFT collection by reading it **straight from the Radix ledger** (stokenet). No build, no backend, no inlined art.

- The art + the "Talking Loom" text model + the collection spec (~900 KB) are read live from the collection component's on-ledger `KeyValueStore` (the sealed bundle), reassembled in the browser, and decoded with the integer-deterministic **loom** codec.
- Each monkey is rendered deterministically from its on-ledger NFT id (the render seed); names come from on-ledger NFT data.
- Reads via the public Radix Gateway (`stokenet.radixdlt.com`) — keyless, no secrets.

Collection (stokenet):
- component `component_tdx_2_1cr79kf7pycgx8efwjmdw7uc4xxsvqqpx63fcvtp25c2k3yc84sdscs`
- NFT resource `resource_tdx_2_1nfm5fsfgpqv3m2n42etwemaef3yuseuqsq9ha5nfzh0rfy2adqwuyv`

Open `index.html` (or the GitHub Pages site) — it fetches the collection and renders.
