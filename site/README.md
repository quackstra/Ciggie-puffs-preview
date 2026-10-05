# Ciggie Puffs — site (`ciggiepuffs.xrd.social`)

Public multi-section site for the Ciggie Puffs loom:anim collection. Single-page, hash-routed,
self-contained (the collection engine renders live in the browser from the Radix Gateway).

Sections: **Home/About · Docs · Collection · Demo · Search · Connect (ROLA)**.

- `index.html` — the whole site (forked from the collection `dashboard/` engine + site chrome).
- `layers/ bg/ fx/ talk/` — loom art + talk-model assets (fetched at runtime).
- `resolve.mjs loom.js lzma.mjs ciggie.spec.json` — the render engine + collection spec.
- `nocache_server.py` — local dev server (no-store headers).

Deploy: served statically at `ciggiepuffs.xrd.social` via the droplet's Caddy, path-routed so
`/img/*` + `/health` still go to the CMS redirect service; everything else serves this site.

Status (WIP): Home, Collection, Demo done. Docs, Search, Connect (connect-and-read ROLA) in progress.
