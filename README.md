# BedBoard

Free, open-source live bed occupancy and discharge tracker for hospitals. See [Spec.md](Spec.md).

**Status: Phase 1 of 7 (scaffold, schema, Docker, seed, health page).**

## Run it

```bash
cp .env.example .env          # then edit the passwords
docker compose up -d --build
docker compose exec app npx prisma db seed
```

Open http://localhost:3001 and http://localhost:3001/health.

Demo logins are created by the seed (login arrives in Phase 2); see [DECISIONS.md](DECISIONS.md).

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
