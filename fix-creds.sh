#!/usr/bin/env bash
# Ciggie Puffs CMS — replace the DO Spaces credentials, validate an upload, restart the render loop.
# Fixes the common case where the secret was truncated / picked up whitespace during a mobile paste.
#   curl -fsSL <short-url> | bash
set -euo pipefail
ENV=/etc/ciggie/env
[ -f "$ENV" ] || { echo "ERROR: $ENV not found — run the main installer first."; exit 1; }

echo "== Ciggie Puffs — fix Spaces credentials =="
read -rp  'DO Spaces ACCESS KEY: ' K < /dev/tty
read -rsp 'DO Spaces SECRET:     ' S < /dev/tty; echo
# strip any stray whitespace / newlines a mobile paste can add
K="$(printf '%s' "$K" | tr -d '[:space:]')"
S="$(printf '%s' "$S" | tr -d '[:space:]')"
echo "key length: ${#K} (expect 20), secret length: ${#S} (expect 43)"

# rebuild env safely (no sed delimiter traps with +/= in the secret)
grep -v -E '^(S3_KEY|S3_SECRET)=' "$ENV" > /tmp/ciggie.env.new
printf 'S3_KEY=%s\nS3_SECRET=%s\n' "$K" "$S" >> /tmp/ciggie.env.new
mv /tmp/ciggie.env.new "$ENV"
chmod 600 "$ENV"

echo "testing upload with the new credentials…"
cd /opt/ciggie-cms
set -a; . "$ENV"; set +a
if node -e "import('./storage.mjs').then(m=>m.putObject('debug/credcheck.txt','ok','text/plain','no-cache')).then(()=>process.exit(0)).catch(e=>{console.error(e.name+': '+e.message);process.exit(1)})"; then
  echo "UPLOAD OK ✅ — restarting the render loop"
  systemctl restart ciggie-render
  echo "DONE. GIFs will start landing in Spaces now."
else
  echo "UPLOAD STILL FAILING ❌ — the access key and secret don't match."
  echo "In DO: Spaces Object Storage -> Access Keys -> regenerate (or create) the key, copy BOTH the"
  echo "new access key AND the fresh secret, then re-run this command and paste them."
fi
