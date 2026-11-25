# Decisions

Where SPEC.md was unclear I chose the simplest option and wrote it here.

## Product direction (from the owner, before Phase 2)

BedBoard is **free open-source software that each hospital installs and runs for itself**, not a portfolio demo. This shapes every later choice: safe defaults, no shared or built-in credentials in a real install, clear errors, and docs written for a hospital IT person. The demo seed is for trying the product only.

## Phase 2

18. **First-run setup wizard (`/setup`).** A new install has no users, so `/login` redirects to `/setup`, where the hospital enters its name and creates the first ADMIN. It only works while there are zero users (checked under a Postgres advisory lock so two requests cannot both win), then redirects to login for good. This is an addition to the spec, needed so a hospital never has to run the demo seed or ship default passwords.
19. **Demo seed vs real install.** The seed (demo logins, `bedboard123`) is only for trying BedBoard. It is skipped if a hospital row exists, so it will not run on top of a real setup. A real hospital should never run it.
20. **Server refuses to start in production with a bad `AUTH_SECRET`** (missing, under 32 characters, or still the `.env.example` sample). Checked at server start (`src/instrumentation.ts`), not at build, so the Docker image still builds without secrets.
21. **Auth.js v5 (`next-auth@beta`), credentials provider, JWT cookie sessions (12 h).** v5 is still tagged beta on npm but is the Auth.js release that supports Next 15 App Router. Login is phone + password. Phone numbers are 10-digit Indian mobiles starting 6-9.
22. **Role is re-read from the database on every API request** (`guard()` in `src/lib/guard.ts`), not trusted from the cookie. Deactivating a user or changing a role takes effect on their next request. Costs one small query per request.
23. **Every API route calls `guard()` first.** A unit test scans `src/app/api` and fails if a route lacks it, except the deliberately public ones (`api/auth`, `api/health`, `api/setup`, `api/public`). Middleware only redirects pages to `/login`; it is not the security boundary.
24. **Login and PIN rate limits are in memory** (10 failed logins per phone and 5 wrong PINs per user per 15 minutes; 20 setup attempts per IP). Fine for a single app container, resets on restart. A limit per phone means someone can lock out a known number for 15 minutes; accepted over IP limits, which are unreliable behind a hospital proxy or shared NAT. Revisit if a hospital runs several app containers.
25. **PIN (Phase 2 = set and verify only).** A user sets a 4-digit PIN on the Profile page (needs their password). `POST /api/me/pin/verify` checks it. The idle lock screen that uses it is Phase 5, as the spec places idle logout there. An admin can reset a PIN.
26. **Passwords:** 8 to 72 characters (bcrypt ignores bytes past 72). The admin sets a starting password; there is no email, so password reset is done by an admin. Hospitals have no shared mail system to rely on.
27. **Admin cannot deactivate or demote themselves**, which also guarantees at least one active admin always exists.
28. **Ward access (`UserWard`) is only stored for NURSE.** Changing a user to another role clears their wards. Helper `canEditWard()` in `src/lib/rbac.ts` is used by Phase 3 ward actions.
29. **Bulk add** `Bed 1 to 30` = prefix + from + to, up to 200 per request. Labels that already exist in the ward are skipped and reported, so re-running is safe. A bed's type can only change while it is FREE or BLOCKED. Beds and wards are never deleted (history and audit rely on them); wards can be deactivated.
30. **Admin API paths:** `GET, POST /api/admin/{wards,beds,users}` and `PATCH /api/admin/{wards,beds,users}/:id`. Passwords and PIN hashes are never returned.
31. **Audit log** now records logins (and failures for known users), setup, and every admin change. The viewer screen is Phase 5.
32. **Security headers** (nosniff, frame deny, referrer, permissions) set in `next.config.ts`. A Content-Security-Policy is deferred to Phase 7 polish because Next.js inline scripts need a nonce setup.
33. **Hindi strings** are still inline English. Extraction to `messages/*.json` happens in Phase 6 as planned.
34. **Dashboard** is a placeholder after login (real one is Phase 4).

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
