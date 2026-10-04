#!/usr/bin/env bash
# Ciggie Puffs image CMS — one-shot droplet installer (Ubuntu). Run as root:
#   curl -fsSL <short-url> | bash
# Prompts for your DO Spaces key + secret; bakes the rest; installs Node+Playwright+Caddy; starts the services.
set -euo pipefail

echo "== Ciggie Puffs CMS — one-shot setup =="
read -rp  'DO Spaces ACCESS KEY: ' S3_KEY    < /dev/tty
read -rsp 'DO Spaces SECRET:     ' S3_SECRET < /dev/tty; echo
echo "installing (a few minutes)…"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y curl git ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# fetch the runtime from the public repo's host/ dir
rm -rf /tmp/cpp && git clone --depth 1 https://github.com/quackstra/Ciggie-puffs-preview /tmp/cpp
mkdir -p /opt/ciggie-cms /etc/ciggie /var/lib/ciggie
cp -rf /tmp/cpp/host/* /opt/ciggie-cms/ && rm -rf /tmp/cpp
cd /opt/ciggie-cms
npm ci || npm install
npx playwright install --with-deps chromium

# config (Spaces creds from the prompts; everything else baked for this droplet)
cat > /etc/ciggie/env <<EOF
VERSION=v1
CDN_BASE=https://ciggie-puffs-cdn.sfo3.cdn.digitaloceanspaces.com
POINTER_FILE=/var/lib/ciggie/ready_bucket
SUPPLY=5
POLL_MIN=10
PORT=8080
S3_ENDPOINT=https://sfo3.digitaloceanspaces.com
S3_REGION=sfo3
S3_BUCKET=ciggie-puffs-cdn
S3_KEY=${S3_KEY}
S3_SECRET=${S3_SECRET}
EOF
chmod 600 /etc/ciggie/env

# Caddy (auto-TLS for ciggiepuffs.xrd.social -> the redirect service)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -y && apt-get install -y caddy
cp /opt/ciggie-cms/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl restart caddy

# services
cp /opt/ciggie-cms/deploy/ciggie-web.service /opt/ciggie-cms/deploy/ciggie-render.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now ciggie-web ciggie-render

echo
echo "== DONE =="
echo "Services started; the first render (SUPPLY=5) is running now."
echo "Your agent will verify remotely (redirect + the GIF in Spaces), then flip to full supply."
