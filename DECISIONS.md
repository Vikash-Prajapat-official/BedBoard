# Decisions

Where SPEC.md was unclear I chose the simplest option and wrote it here.

## Phase 1

1. **Spec filename.** The file in the folder is `Spec.md`, not `SPEC.md`. Left as is (Windows is case-insensitive). Rename it before cloning on Linux.
2. **Single hospital per install.** The data model in section 4 has no `hospital_id` on other tables, so one install serves one hospital. The `Hospital` table holds one row.
3. **Tailwind v4 + hand-written shadcn-style components.** Tailwind v4 (CSS-first, `@tailwindcss/postcss`) instead of v3. shadcn/ui components are added by hand in `src/components/ui` (card, badge) with the same API and `components.json`, because the CLI is interactive. More are added as screens need them.
4. **Prisma 6 pinned (`^6`).** Prisma 7 changes client generation and config; 6 is the stable, widely documented choice.
5. **Prisma table names** use the snake_case names from the spec (`@@map`), so SQL and CSV exports match section 4.
6. **`bcryptjs`** (pure JS, cost 12) instead of native `bcrypt`, to avoid native build problems on Windows and Alpine.
7. **Dockerfile** is a single simple image (Node 20 slim, dev dependencies kept) used by both `app` and `worker`. This lets `docker compose exec app npx prisma db seed` work, and the worker run with `tsx`. Image size is not optimised.
8. **Migrations on start.** The `app` command runs `prisma migrate deploy` before `npm start`. The worker waits for the app to be healthy, so the schema exists first.
9. **Compose `POSTGRES_PASSWORD`.** `.env.example` has a `POSTGRES_PASSWORD` (not in the spec table) so the db and `DATABASE_URL` use one password. Compose builds `DATABASE_URL` from it.
10. **Backup service and Caddy** are not in Phase 1 (spec puts backups in Phase 5, HTTPS as optional).
11. **Worker** is a heartbeat only in Phase 1. Real jobs come in Phase 5.
12. **Demo seed** is skipped if a hospital row exists, so re-running never duplicates or deletes data. Demo users share the password `bedboard123` and phones `9000000001` to `9000000006` (admin, nurse, desk, doctor, housekeeping, viewer). Demo only. Change or delete before real use. Patient names in the seed are made up.
13. **Seed mix.** About 75% of beds occupied, 10 of them with a pending discharge order (3 older than 4 hours so they show red), plus a few cleaning, blocked and reserved beds so every status appears.
14. **Health page** (`/health`) shows counts by status only and database connectivity. `GET /api/health` is public and returns no data beyond up or down.
15. **Landing page** at `/` is a placeholder until Phase 6.
16. **Phone-only login number format** is not validated in Phase 1 (no auth yet). It will be 10-digit Indian mobile numbers in Phase 2.
17. **State machine tests.** The "tests first" rule applies to `src/lib/beds.ts`, which is Phase 3. Phase 1 has no state machine code. Vitest is configured and `tests/unit` is ready.
