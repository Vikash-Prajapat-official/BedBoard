#!/bin/bash
# Nightly encrypted database backup (SPEC section 8: encrypted, kept 14 days).
#   Runs forever inside the `backup` container and dumps once a day.
#   `backup.sh once` takes one backup right now and exits.
# Each file is a pg_dump (custom format) encrypted with AES-256 using BACKUP_PASSPHRASE.
# Without that passphrase the file cannot be read, so keep a copy of it somewhere safe and apart from the server.
set -euo pipefail

PASS="${BACKUP_PASSPHRASE:-}"
case "$PASS" in
  ""|replace-with*|change-me*|changeme*)
    echo "[backup] BACKUP_PASSPHRASE is not set (or is still the sample value). Set a strong one in .env and restart. Not taking backups." >&2
    exit 1 ;;
esac
if [ "${#PASS}" -lt 12 ]; then
  echo "[backup] BACKUP_PASSPHRASE must be at least 12 characters. Not taking backups." >&2
  exit 1
fi

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_AT:-02:30}"   # container time zone (TZ)
DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$DIR"

run_backup() {
  local out="$DIR/bedboard-$(date +%Y%m%d-%H%M%S).dump.enc"
  # Written to .part first so a half-finished file is never mistaken for a backup.
  pg_dump --format=custom --no-owner \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out.part"
  mv "$out.part" "$out"
  find "$DIR" -name 'bedboard-*.dump.enc' -mtime "+$KEEP_DAYS" -delete
  find "$DIR" -name 'bedboard-*.part' -mmin +60 -delete
  echo "[backup] wrote $out ($(du -h "$out" | cut -f1)); kept the last $KEEP_DAYS days"
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit 0
fi

echo "[backup] daily at $AT (${TZ:-UTC}), keeping $KEEP_DAYS days in $DIR"
while true; do
  now=$(date +%s)
  next=$(date -d "today $AT" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow $AT" +%s)
  sleep $((next - now))
  run_backup || echo "[backup] FAILED at $(date -Is)" >&2
done
