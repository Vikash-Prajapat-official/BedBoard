#!/bin/bash
# Restore an encrypted backup. By default it restores into a NEW database called bedboard_restore,
# so a mistake can never overwrite the live data. Run it inside the backup container:
#
#   docker compose exec backup bash /scripts/restore.sh /backups/bedboard-20261125-023000.dump.enc
#   docker compose exec backup bash /scripts/restore.sh /backups/<file> bedboard   # replace the live database (stop the app first!)
#
# `restore.sh <file> --check` only proves the file decrypts and is a valid dump.
set -euo pipefail

FILE="${1:?usage: restore.sh <backup file> [database name | --check]}"
TARGET="${2:-bedboard_restore}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE must be set}"

decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE"; }

if [ "$TARGET" = "--check" ]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  # A temp file (not a pipe) so a wrong passphrase gives one clear "bad decrypt" error.
  if ! decrypt > "$tmp"; then
    echo "FAILED: could not decrypt $FILE. Wrong BACKUP_PASSPHRASE, or the file is damaged." >&2
    exit 1
  fi
  pg_restore --list "$tmp" > /dev/null
  echo "OK: $FILE decrypts and is a valid dump"
  exit 0
fi

if [ "$TARGET" != "bedboard" ]; then
  psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET\"" -c "CREATE DATABASE \"$TARGET\""
  decrypt | pg_restore --no-owner --dbname="$TARGET"
else
  echo "Replacing the LIVE database 'bedboard'. Make sure the app and worker are stopped."
  decrypt | pg_restore --no-owner --clean --if-exists --dbname="$TARGET"
fi
echo "Restored $FILE into database '$TARGET'"
