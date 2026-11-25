# BedBoard

Free, open-source live bed occupancy and discharge tracker for hospitals. See [Spec.md](Spec.md).

**Status: Phase 3 of 7 (bed state machine, ward map, admit, transfer, discharge, cleaning, reservations).**

BedBoard is free software that each hospital installs and runs for itself.

## Install for your hospital

```bash
cp .env.example .env          # set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), DATABASE_URL
docker compose up -d --build
```

Open http://localhost:3001. On first start you are taken to a setup page where you enter your hospital name and create the first administrator. Then add wards, beds (bulk add, for example "Bed 1 to 30") and staff logins under **Admin**.

The app will not start if `AUTH_SECRET` is missing, shorter than 32 characters, or still the sample value.

## Try the demo instead

Loads a made-up 120-bed hospital. **Do not do this on a real install.**

```bash
docker compose up -d --build
docker compose exec app npx prisma db seed
```

Demo logins (password `bedboard123`): admin 9000000001, nurse 9000000002, desk 9000000003, doctor 9000000004, housekeeping 9000000005, viewer 9000000006.

Health check: http://localhost:3001/health. See [DECISIONS.md](DECISIONS.md) for design choices.

## Tests

```bash
npm test                      # unit tests, no database needed
```

The integration tests (including the "two nurses admit the same bed at once" test) need a throwaway PostgreSQL:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db     # publishes Postgres on 127.0.0.1:5433
docker compose exec db createdb -U bedboard bedboard_test
export TEST_DATABASE_URL=postgresql://bedboard:change-me@localhost:5433/bedboard_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm run test:integration
```

## Develop without Docker

Needs Node 20+ and a PostgreSQL 16 database in `DATABASE_URL`.

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev        # http://localhost:3001
npm run typecheck && npm test
```

MIT licensed.
