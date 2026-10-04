#!/usr/bin/env bash
# Ciggie Puffs CMS — install the Spaces credentials (shipped encrypted; unlock with the short code).
# The creds below are AES-256 ciphertext — useless without the unlock code. Validates then restarts.
#   curl -fsSL <short-url> | bash
set -euo pipefail
ENV=/etc/ciggie/env
[ -f "$ENV" ] || { echo "ERROR: $ENV not found — run the main installer first."; exit 1; }

CIPHER='U2FsdGVkX18mq6ubclgrrb7SBlSpzLnd7wn4QTUjGnJd1YTLS31e0PEV+wAurpkL44nwRmAuAmyrV50jLLlT17C/1gPw6WZsHLChR9p0mSYF9aih54lUpPC4bulSUjneiqklIgejrJ45zPvpvmdIvw=='

echo "== Ciggie Puffs — unlock + install Spaces credentials =="
read -rp 'Unlock code: ' P < /dev/tty
P="$(printf '%s' "$P" | tr -d '[:space:]')"

CREDS="$(printf '%s' "$CIPHER" | openssl enc -d -aes-256-cbc -pbkdf2 -a -A -k "$P" 2>/dev/null || true)"
if ! printf '%s' "$CREDS" | grep -q '^S3_KEY='; then
  echo "WRONG CODE ❌ — nothing changed. Re-run and re-enter the code."; exit 1
fi

grep -v -E '^(S3_KEY|S3_SECRET)=' "$ENV" > /tmp/ciggie.env.new
printf '%s\n' "$CREDS" >> /tmp/ciggie.env.new
mv /tmp/ciggie.env.new "$ENV"
chmod 600 "$ENV"
echo "credentials installed. testing upload…"

cd /opt/ciggie-cms
set -a; . "$ENV"; set +a
if node -e "import('./storage.mjs').then(m=>m.putObject('debug/credcheck.txt','ok','text/plain','no-cache')).then(()=>process.exit(0)).catch(e=>{console.error(e.name+': '+e.message);process.exit(1)})"; then
  echo "UPLOAD OK ✅ — restarting the render loop"
  systemctl restart ciggie-render
  echo "DONE. GIFs will start landing in Spaces now."
else
  echo "UPLOAD FAILED ❌ — the key still lacks write access to the Space."
  echo "In DO: Spaces Object Storage -> Access Keys -> give key ...2774W9MWN Read/Write on ciggie-puffs-cdn, then re-run."
fi
