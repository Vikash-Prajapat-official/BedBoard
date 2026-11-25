#!/bin/sh
# Creates .env from .env.example with fresh random secrets, so a new install never runs on
# "change-me" passwords. Safe to run twice: it will not overwrite an existing .env.
#   sh scripts/init-env.sh
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists, so I left it alone."
  exit 0
fi
[ -f .env.example ] || { echo "Run this from the BedBoard folder (.env.example not found)." >&2; exit 1; }

# Letters and digits only, so the values are safe inside the sed commands and in URLs.
rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"
  else
    head -c 256 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"
  fi
}

DB_PASSWORD=$(rand 28)
AUTH_SECRET=$(rand 48)
BACKUP_PASSPHRASE=$(rand 32)

sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASSWORD|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://bedboard:$DB_PASSWORD@db:5432/bedboard|" \
  -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" \
  -e "s|^BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$BACKUP_PASSPHRASE|" \
  .env.example > .env
chmod 600 .env 2>/dev/null || true

cat <<EOF
Created .env with random passwords.

  IMPORTANT: your encrypted backups can only be opened with BACKUP_PASSPHRASE.
  Copy it from .env to a safe place that is NOT this computer (a password manager,
  or a sealed note kept by the hospital administrator). Lose it and the backups are useless.

Next:  docker compose up -d --build
Then open http://localhost:3001 and create your administrator.
EOF
