#!/usr/bin/env bash
# Ciggie Puffs CMS — migrate to v2 (incremental re-render) with ZERO downtime.
# Pulls the new code, PRIMES all tokens under v2 in the background (live site keeps serving v1 the whole time),
# then flips VERSION=v2 + restarts for an instant cutover. Runs detached (systemd-run) so it survives a mobile
# disconnect. Watch it with:  journalctl -u ciggie-migrate -f
#   curl -fsSL <short-url> | bash
set -euo pipefail
[ -d /opt/ciggie-cms ] || { echo "ERROR: /opt/ciggie-cms not found — run the main installer first."; exit 1; }

echo "== Ciggie Puffs — migrate to v2 (incremental) =="
echo "fetching new code…"
rm -rf /tmp/cpp && git clone --depth 1 https://github.com/quackstra/Ciggie-puffs-preview /tmp/cpp
cp -rf /tmp/cpp/host/* /opt/ciggie-cms/
rm -rf /tmp/cpp
cd /opt/ciggie-cms
npm ci --omit=dev >/dev/null 2>&1 || npm install --omit=dev >/dev/null 2>&1 || true

# stop any previous migrate unit, then run prime + cutover detached so it survives disconnect
systemctl reset-failed ciggie-migrate 2>/dev/null || true
systemd-run --unit=ciggie-migrate --collect \
  --property=WorkingDirectory=/opt/ciggie-cms \
  --property=EnvironmentFile=/etc/ciggie/env \
  --setenv=VERSION=v2 \
  /bin/bash -c '
    set -e
    echo "[migrate] priming ALL tokens under v2 (live site still serving v1)…"
    node prime.mjs
    echo "[migrate] prime complete — flipping VERSION=v2 + restarting for instant cutover"
    if grep -q "^VERSION=" /etc/ciggie/env; then sed -i "s/^VERSION=.*/VERSION=v2/" /etc/ciggie/env; else echo "VERSION=v2" >> /etc/ciggie/env; fi
    systemctl restart ciggie-render ciggie-web
    echo "[migrate] cutover complete — now serving v2, incremental re-render active."
  '

echo
echo "== migration started (background unit: ciggie-migrate) =="
echo "The live site keeps serving v1 until the prime finishes, then flips instantly to v2."
echo "Follow progress:   journalctl -u ciggie-migrate -f"
echo "(Prime renders all ${SUPPLY:-10000} tokens — ~75 min on 2 vCPU, faster if resized.)"
