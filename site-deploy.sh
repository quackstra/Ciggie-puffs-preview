#!/usr/bin/env bash
# Deploy the Ciggie Puffs site to ciggiepuffs.xrd.social on the droplet, path-routed so the CMS keeps working:
#   /img/*  + /health   -> the CMS redirect service (localhost:8080)   [wallets fetch key_image_url here]
#   everything else      -> the static site (/opt/ciggie-site)
# Safe: backs up the current Caddyfile and validates the new one before reloading (invalid -> CMS stays up).
#   curl -fsSL <short-url> | bash
set -euo pipefail
[ -f /etc/caddy/Caddyfile ] || { echo "ERROR: Caddy not installed / no Caddyfile — run the CMS installer first."; exit 1; }

echo "== Ciggie Puffs site deploy =="
rm -rf /tmp/cps && git clone --depth 1 https://github.com/quackstra/Ciggie-puffs-preview /tmp/cps
[ -d /tmp/cps/site ] || { echo "ERROR: site/ not found in repo."; exit 1; }
rm -rf /opt/ciggie-site && mkdir -p /opt/ciggie-site && cp -a /tmp/cps/site/. /opt/ciggie-site/
rm -rf /tmp/cps
echo "site files -> /opt/ciggie-site ($(du -sh /opt/ciggie-site | cut -f1))"

cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s 2>/dev/null || echo bak)" 2>/dev/null || cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
cat > /etc/caddy/Caddyfile <<'CADDY'
ciggiepuffs.xrd.social {
	encode zstd gzip
	@cms path /img/* /health
	handle @cms {
		reverse_proxy localhost:8080
	}
	handle {
		root * /opt/ciggie-site
		try_files {path} /index.html
		file_server
	}
}
CADDY

if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
	systemctl reload caddy || systemctl restart caddy
	echo "== DONE =="
	echo "https://ciggiepuffs.xrd.social -> the site;  /img/{id}.png + /health -> the CMS (unchanged)."
else
	echo "!! New Caddyfile FAILED validation — restoring the previous config (CMS stays up)."
	cp -a "$(ls -t /etc/caddy/Caddyfile.bak* | head -1)" /etc/caddy/Caddyfile
	caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy || true
	exit 1
fi
