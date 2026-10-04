#!/usr/bin/env bash
# Ciggie Puffs CMS — update the runtime code on an already-provisioned droplet (no reinstall).
# Pulls host/ from the repo, copies over /opt/ciggie-cms (never touches /etc/ciggie/env), restarts services.
#   curl -fsSL <short-url> | bash
set -euo pipefail
[ -d /opt/ciggie-cms ] || { echo "ERROR: /opt/ciggie-cms not found — run the main installer first."; exit 1; }

echo "== Ciggie Puffs CMS — update =="
rm -rf /tmp/cpp && git clone --depth 1 https://github.com/quackstra/Ciggie-puffs-preview /tmp/cpp
cp -rf /tmp/cpp/host/* /opt/ciggie-cms/
rm -rf /tmp/cpp
cd /opt/ciggie-cms
# only needed if deps changed; safe + quick otherwise
npm ci --omit=dev >/dev/null 2>&1 || npm install --omit=dev >/dev/null 2>&1 || true

systemctl restart ciggie-web ciggie-render
CORES="$(nproc)"
echo "updated + restarted. render workers = CONCURRENCY env or vCPU count (${CORES} here)."
echo "to use more cores: resize the droplet, then add 'CONCURRENCY=N' to /etc/ciggie/env and restart ciggie-render."
