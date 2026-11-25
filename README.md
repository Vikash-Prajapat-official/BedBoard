# BedBoard

**Know every free bed, right now.** A free, open-source live bed board for hospitals. Nurses update in two taps on a phone; the whole hospital sees it instantly. A discharge tracker frees beds sooner, and housekeeping sees the beds waiting for them.

Each hospital installs and runs BedBoard for itself, on its own computer and network. No paid service, nothing sent to the internet. English and Hindi. MIT licence.

## Install in three steps

You need a computer with **Docker** (2 GB of memory is enough) on your hospital network.

```bash
git clone <this repository's address> bedboard && cd bedboard
sh scripts/init-env.sh                 # makes .env with random passwords (Windows: see below)
docker compose up -d --build
```

Then open **http://localhost:3001**. On a new install you are taken to a setup page to create your own administrator. Then add wards, beds (for example "Bed 1 to 30") and staff under **Admin**.

**Windows PowerShell:** use `powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1` for the second step.

> **Copy `BACKUP_PASSPHRASE` from `.env` to a safe place that is not this computer.** Backups are encrypted with it. Lose it and they cannot be opened.

The full guide for the person who runs it (phones, the TV, HTTPS, backups, privacy, updating, troubleshooting) is **[ADMIN_GUIDE.md](ADMIN_GUIDE.md)**.

### Just have a look first

To explore with a made-up 120-bed hospital (never on a real install):

```bash
docker compose up -d --build
docker compose exec app npx prisma db seed
```

Demo logins use the password `bedboard123`: administrator `9000000001`, nurse `9000000002`, admission desk `9000000003`, doctor `9000000004`, housekeeping `9000000005`, casualty-TV viewer `9000000006`.

## What it does

| | |
|---|---|
| **Ward map** | Every bed colour-coded, each with an icon and a word: free, reserved, occupied, discharge planned, cleaning, blocked. |
| **Two taps** | Admit, transfer, discharge steps, mark cleaned, block. Enforced by a bed state machine on the server. |
| **No double booking** | Two nurses admitting the same bed at once: exactly one succeeds, the other is told "Bed changed, please refresh". |
| **Dashboard / TV** | Free beds by ward and type, occupancy, discharges today. Live. Numbers only, never names. |
| **Find a bed** | The admission desk filters by bed type, gender and ward, and reserves; unclaimed reservations release themselves. |
| **Discharge tracker** | Order, summary, bill, medicines, patient left, with the time each has waited. Turns red after a set number of hours. |
| **Housekeeping list** | Beds to clean, longest first, one tap to mark clean. |
| **Works on a bad network** | A ward phone that loses signal keeps its taps and sends them in order when it reconnects. |
| **Reports** | Occupancy, length of stay, turnover, cleaning time, CSV export (no patient names). |
| **Privacy** | Names visible only to a ward's staff, the desk, doctors and admins. Audit log. Automatic erasure after a retention period. Correct and erase tools. Printable patient notice. Encrypted nightly backups. |
| **Hindi and English** | Every screen. Installable as a phone app over HTTPS (optional Caddy included). |
| **Public page (optional)** | Counts of free beds by type, no names. Off by default. |

## Documents

| | |
|---|---|
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Installing, running and looking after BedBoard in a hospital |
| [docs/PILOT_CHECKLIST.md](docs/PILOT_CHECKLIST.md) | Hands-on tests to do before showing it to a hospital |
| [docs/patient-notice.md](docs/patient-notice.md) | The patient privacy notice and how to use it |
| [docs/DEPLOY_DEMO.md](docs/DEPLOY_DEMO.md) | Putting a demo (made-up data) on a public link with Vercel and Neon |
| [DECISIONS.md](DECISIONS.md) | Every design choice, and why. Read this to understand the product |
| [Spec.md](Spec.md) | The original specification |

## Tests

```bash
npm test                  # unit tests: the bed state machine (every move, every role, random sequences), roles on every route, reports maths, translations, offline queue
```

Tests that need a real database and a real browser:

```bash
# Database tests: concurrent admits, live updates within 2 seconds, census, reports, retention, erasure
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db     # publishes Postgres on 127.0.0.1:5433
docker compose exec db createdb -U bedboard bedboard_test
export TEST_DATABASE_URL=postgresql://bedboard:<your POSTGRES_PASSWORD>@localhost:5433/bedboard_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm run test:integration

# Browser tests (Playwright), against the running stack
npx playwright install chromium
docker compose exec app npx prisma db seed       # on an empty database
npm run e2e:demo                                  # full journey, offline, Hindi, access rules
# on a brand-new empty database (docker compose down -v, then up):
npm run e2e:fresh                                 # first-run wizard, wards, beds, staff
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of it on every push: lint, type check, unit, database tests, the production image build, both browser suites, and a Lighthouse check of the home page (90+ for accessibility, best practices and SEO; 70+ for performance on the slow CI machine).

## Develop

Needs Node 20+ and a PostgreSQL 16 database in `DATABASE_URL`.

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev          # http://localhost:3001
```

Built with Next.js 15 (App Router) and TypeScript, Tailwind and shadcn/ui-style components, Prisma and PostgreSQL 16, Auth.js, next-intl, Server-Sent Events over Postgres LISTEN/NOTIFY, Serwist and IndexedDB for the app and offline queue, Zod, Vitest, fast-check and Playwright.

## Licence

MIT. See [LICENSE](LICENSE). BedBoard is a tool for running beds, **not a medical record and not medical advice**. The hospital remains responsible for its own clinical records and legal compliance.
