# BedBoard: Live Bed and Discharge Tracker Spec

Nov 24, 2026 · @Vikash

BedBoard is a free, open-source live bed board for hospitals: every ward's beds colour-coded by status, updated by nurses in two taps, with a discharge tracker that frees beds sooner.

## Build it in VS Code with Claude Code

Save this doc as `SPEC.md` in an empty folder, open the folder in VS Code, and paste the master prompt below into Claude Code. Then paste the phase prompts one at a time.

### One-time setup (about 20 minutes, skip what you already did for QueueCare)

1. Install **Node.js 20 LTS** or newer, **Git**, and **Docker Desktop** (on Windows, turn on WSL 2 when Docker asks).
2. Create an empty folder called `bedboard` and open it in VS Code (File > Open Folder).
3. Put this spec in the folder as `SPEC.md`. `Open the Export menu under this doc's title, choose Markdown, then move the downloaded file into the folder and rename it SPEC.md`.
4. Open Claude Code in VS Code (the Claude icon in the sidebar, or Ctrl+Esc / Cmd+Esc).
5. Paste the **master prompt**. Read and approve file edits and commands when asked.
6. After each phase, run `docker compose up -d`, open http://localhost:3001 and click around before pasting the next phase prompt. (Port 3001 so it can run beside QueueCare.)
7. Optional: create an empty GitHub repo and ask Claude Code "push this to my GitHub repo \<url>".

### Master prompt (paste first)

```
You are building BedBoard, a free open-source live bed occupancy and
discharge tracker for Indian hospitals. The complete spec is in SPEC.md
in this folder. Read the whole of SPEC.md before writing any code.

Rules for the whole project:
- Use exactly the tech stack in SPEC.md (Next.js 15 App Router + TypeScript,
  Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Auth.js credentials,
  next-intl with English and Hindi, Server-Sent Events, Zod, Vitest,
  Playwright, Docker Compose). Do not add paid services.
- The bed status state machine in SPEC.md is enforced on the server. Write
  its unit tests before the code.
- Work in the phases in SPEC.md section "Build phases". Do only Phase 1
  now, then stop and tell me how to run and check it.
- Commit to git after each phase with a clear message.
- Every API route checks the user's role on the server.
- Keep a DECISIONS.md file: when the spec is unclear, choose the simplest
  option, write it down, and continue. Ask me only if a choice would change
  what the product does.
- The dashboard and public page show counts only, never patient names.

Start Phase 1 now.
```

### Phase prompts (paste one at a time, after checking the previous phase)

```
Phase 2: Do Phase 2 from SPEC.md (auth, roles, admin setup for wards,
beds with bulk add, users). Add tests for role checks. Stop and tell me
how to check it.
```

```
Phase 3: Do Phase 3 from SPEC.md (bed state machine in src/lib/beds.ts
with unit tests first, ward map, admit, transfer, discharge, cleaning,
block, reservation with auto-release, and the concurrency test).
```

```
Phase 4: Do Phase 4 from SPEC.md (SSE realtime, hospital dashboard, find a
bed screen, discharge tracker, housekeeping list).
```

```
Phase 5: Do Phase 5 from SPEC.md (census snapshots, reports, CSV export,
retention job, encrypted backups, idle logout and PIN, audit log viewer,
offline action queue).
```

```
Phase 6: Do Phase 6 from SPEC.md (landing page at / exactly as specified,
Hindi translations for every screen, PWA, optional public availability page).
```

```
Phase 7: Do Phase 7 from SPEC.md (Playwright end-to-end tests including
offline, GitHub Actions CI, README with 3-command install, ADMIN_GUIDE.md,
seed demo data). Run all tests and fix failures. Then give me a final
checklist of what to test by hand before showing it to a hospital.
```

### If something goes wrong

- Paste the exact error into Claude Code and say "fix this".
- If Docker will not start on Windows, ask: "set up the project to run without Docker using a local PostgreSQL install".
- In a new conversation, say: "Read SPEC.md and DECISIONS.md, check git log, and continue from the next unfinished phase".

## Principles and tech stack

### Principles

- **Free and self-hosted:** MIT licence, one `docker compose up -d`, runs on a 2 GB RAM PC or a free cloud tier. No paid API.
- **Two taps for a nurse:** every common action (admit, discharge, cleaned) must take two taps or fewer on a low-end Android phone.
- **Works on a bad network:** runs on the hospital LAN; ward phones queue actions offline and replay them.
- **Hindi and English from day one.**
- **Privacy by design:** names only visible to the ward, desk and admins; dashboards show counts; audit log; retention job; encrypted backups.
- **Colour is never the only signal:** every status has a colour, an icon and a word.

### Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS + shadcn/ui |
| Realtime | Server-Sent Events, fed by Postgres LISTEN/NOTIFY |
| Backend | Next.js route handlers and server actions; Zod validation |
| Database | PostgreSQL 16 via Prisma ORM |
| Auth | Auth.js credentials (phone + password, bcrypt) + optional 4-digit PIN re-entry |
| i18n | next-intl (en, hi); Inter + Noto Sans Devanagari |
| Offline | Serwist PWA + IndexedDB (idb-keyval) action queue |
| Jobs | node-cron in a small `worker` container (reservation expiry, census, retention) |
| Tests | Vitest, Playwright, fast-check (state machine property tests) |
| Packaging | Dockerfile + docker-compose.yml: app, worker, postgres, backup |
| CI | GitHub Actions: lint, typecheck, test, build image |

### Folder structure

```
bedboard/
  SPEC.md  DECISIONS.md  README.md  ADMIN_GUIDE.md  LICENSE (MIT)
  docker-compose.yml  Dockerfile  .env.example
  prisma/schema.prisma  prisma/seed.ts
  src/app/(marketing)/page.tsx      landing page
  src/app/(app)/dashboard/          hospital dashboard
  src/app/(app)/wards/[id]/         ward map
  src/app/(app)/find-bed/  src/app/(app)/discharges/  src/app/(app)/housekeeping/
  src/app/(app)/reports/  src/app/(app)/admin/
  src/app/public/                   optional public availability
  src/app/api/...
  src/lib/beds.ts                   state machine (pure, unit tested)
  src/lib/auth.ts  src/lib/sse.ts  src/lib/audit.ts  src/lib/offline-queue.ts
  src/worker/index.ts               cron jobs
  messages/en.json  messages/hi.json
  tests/unit  tests/e2e
```

### Environment variables (.env.example)

| Name | Example | Purpose |
| --- | --- | --- |
| DATABASE\_URL | postgresql://bedboard:change-me@db:5432/bedboard | Database |
| AUTH\_SECRET | (random 32 bytes) | Session signing |
| APP\_URL | http://192.168.1.10:3001 | Links |
| PORT | 3001 | Runs beside QueueCare |
| RESERVATION\_MINUTES | 30 | Auto-release of reserved beds |
| DISCHARGE\_ALERT\_HOURS | 4 | Discharge turns red after this |
| IDLE\_LOGOUT\_MINUTES | 15 | Shared ward devices |
| RETENTION\_DAYS | 365 | Patient details anonymised after this |
| PUBLIC\_PAGE\_ENABLED | false | Public counts page |
| BACKUP\_PASSPHRASE | (strong passphrase) | Encrypts backups |

## Product spec

### 1. Problem and evidence

- In most small and mid-size Indian hospitals, bed status lives on a whiteboard or register in each ward. To admit a patient, the casualty doctor or admission clerk phones wards one by one; delays and wrong information leave patients waiting on trolleys or referred elsewhere.
- COVID-19 exposed this at scale: in Mumbai in May 2020, hospitals turned patients away and the city's bed dashboard was criticised because "there is no real-time updation going on", while the internal tracking system was not open to the public ([The Caravan, 31 May 2020](https://caravanmagazine.in/health/mumbai-hospitals-turn-away-covid-suspects)). Cities rushed out public bed dashboards (for example Bengaluru, [Deccan Herald](https://deccanherald.com/india/karnataka/bengaluru/new-dashboard-lets-people-check-bed-status-in-real-time-988196.html)), but most were built for one crisis, not as a tool a single hospital can run.
- Slow discharges block beds: a patient discharged on paper at 11:00 often leaves at 17:00 because the summary, bill and medicines are not tracked. Making these steps visible is the cheapest way to free beds.
- **Pilot baseline to measure:** time from admit decision to bed, and from discharge order to bed free, at the pilot hospital (no reliable national figure exists).

### 2. Users

| Role | What they do |
| --- | --- |
| Ward nurse / sister in-charge (NURSE) | Updates bed status, admits to bed, marks discharge steps, requests cleaning |
| Admission / casualty desk (DESK) | Finds a free bed by ward and type, reserves it, sends the patient up |
| Housekeeping (HOUSEKEEPING) | Sees beds waiting for cleaning, marks clean |
| Doctor (DOCTOR) | Marks discharge planned and discharge order given |
| Admin / medical superintendent (ADMIN) | Setup, hospital-wide dashboard, reports |
| Viewer (VIEWER) | Read-only dashboard, for a casualty TV |

### 3. Features

**MVP**

- Setup: wards (gender MALE, FEMALE or ANY; floor; specialty), bed types (GENERAL, OXYGEN, VENTILATOR, ICU, COT, ISOLATION), beds with labels, bulk add ("Bed 1 to 30").
- Ward map: grid of bed tiles. Status colours with icon and word: FREE green, RESERVED blue, OCCUPIED grey, DISCHARGE\_PLANNED amber, CLEANING purple, BLOCKED red (with reason).
- Two-tap actions on a phone: Admit (patient name, UHID, age, sex, admitting doctor), Transfer, Discharge, Mark cleaned, Block / unblock.
- Discharge checklist per admission: order given, summary ready, bill cleared, medicines given, patient left. Shows time since order; red after DISCHARGE\_ALERT\_HOURS.
- Hospital dashboard: free beds by ward and type, occupancy %, discharges expected today, beds in cleaning; live over SSE.
- Find a bed (desk): filter by bed type, gender, ward; Reserve for RESERVATION\_MINUTES, auto-released.
- Housekeeping list: beds in CLEANING, oldest first.
- Midnight census snapshot; reports for occupancy, average length of stay, bed turnover; CSV export.
- Audit log of every status change.
- Offline: ward phone queues actions and replays them; if the bed changed meanwhile, show "Bed changed, please refresh".

**Later (v2+, do not build now)**

- ABDM Health Facility Registry ID; FHIR Location / Encounter export.
- Webhook so a HIS (for example Bahmni) can push admissions.
- Predicted discharges from length-of-stay history.
- Handover notes between shifts.

### 4. Data model

| Table | Fields |
| --- | --- |
| Hospital | id, name, hfr\_id?, timezone, public\_page\_enabled |
| User | id, name, phone (unique), password\_hash, pin\_hash?, role (ADMIN, NURSE, DESK, DOCTOR, HOUSEKEEPING, VIEWER), active |
| UserWard | user\_id, ward\_id (which wards a nurse can edit) |
| Ward | id, name, gender, floor, specialty, sort\_order, active |
| Bed | id, ward\_id, label, bed\_type, status, status\_reason?, status\_changed\_at, reserved\_until?, reserved\_by?, current\_admission\_id?, version (int, for conflict checks) |
| Patient | id, uhid, name, age, sex, phone?, abha\_number?, anonymised |
| Admission | id, patient\_id, bed\_id, admitting\_doctor, admitted\_at, discharge\_planned\_for?, discharge\_order\_at?, summary\_ready\_at?, bill\_cleared\_at?, meds\_given\_at?, left\_at?, outcome? (DISCHARGED, LAMA, REFERRED, DIED) |
| BedTransfer | id, admission\_id, from\_bed\_id, to\_bed\_id, at, by\_user\_id |
| BedEvent | id, bed\_id, from\_status, to\_status, actor\_user\_id, at, note |
| CensusSnapshot | id, date, ward\_id, bed\_type, total, occupied, free, blocked |
| AuditLog | id, actor\_user\_id?, action, entity, entity\_id, at, ip |

**Bed state machine (enforced on the server, refused otherwise):**

| From | Allowed to | Who |
| --- | --- | --- |
| FREE | RESERVED, OCCUPIED, BLOCKED | DESK, NURSE / NURSE, ADMIN |
| RESERVED | OCCUPIED, FREE (cancel or expiry) | NURSE, DESK, worker |
| OCCUPIED | DISCHARGE\_PLANNED, CLEANING (patient left) | DOCTOR, NURSE |
| DISCHARGE\_PLANNED | OCCUPIED (plan cancelled), CLEANING (patient left) | DOCTOR, NURSE |
| CLEANING | FREE | HOUSEKEEPING, NURSE |
| BLOCKED | FREE | NURSE, ADMIN |

Every change: one transaction that checks `version`, updates Bed (version + 1), writes BedEvent and AuditLog, then `NOTIFY beds`.

### 5. Architecture

One Next.js app plus a small worker container. The app serves all screens and APIs. Bed changes go through `src/lib/beds.ts` only. The worker releases expired reservations every minute, writes census snapshots at 00:00 Asia/Kolkata, and runs the retention job nightly. A single Postgres listener fans out bed events to SSE clients. Ward phones store pending actions in IndexedDB with the bed `version` they saw; on replay the server refuses stale versions with 409 and the UI asks the nurse to refresh.

### 6. Screens

1. Login (phone + password; PIN re-entry after idle).
2. Hospital dashboard: a tile per ward with free / total by bed type, discharges today, cleaning count.
3. Ward map: bed grid; tap a bed for a bottom sheet of allowed actions.
4. Admit form (bottom sheet).
5. Discharge tracker: admissions with an order, checklist progress, sorted by time waiting.
6. Find a bed: filters + Reserve.
7. Housekeeping list.
8. Reports: occupancy, length of stay, turnover, census history, CSV.
9. Admin: wards, beds (bulk add), users and ward access, audit log.
10. Public availability `/public` (only if enabled): counts by bed type, cached 60 s.

### 7. APIs

| Method and path | Purpose | Who |
| --- | --- | --- |
| GET /api/dashboard | Hospital-wide counts | logged in |
| GET /api/wards/:id/beds | Ward map | NURSE, DESK, DOCTOR, ADMIN |
| POST /api/beds/:id/admit | Admit patient | NURSE, DESK |
| POST /api/beds/:id/reserve | Reserve | DESK |
| POST /api/beds/:id/status | Cleaned, block, unblock, cancel reservation (body: to, reason?, version) | per state machine |
| POST /api/admissions/:id/transfer | Move bed | NURSE |
| POST /api/admissions/:id/discharge-step | Mark a checklist step | NURSE, DOCTOR |
| GET /api/beds/search?type&gender&ward | Free beds | DESK |
| GET /api/stream | SSE bed events | logged in |
| GET /api/reports/(occupancy, los, census) | Reports | ADMIN |
| GET /api/export/(admissions, census).csv | CSV | ADMIN |
| GET /api/public/availability | Counts | public, only if enabled |
| GET, POST, PATCH /api/admin/(wards, beds, users) | Setup | ADMIN |

Errors: `{ error: { code, message } }`; 409 for a stale version or bed already taken.

### 8. Security and privacy

- Personal data: patient name, UHID, age, sex, ward, dates. Being in hospital is sensitive, so names are visible only to that ward's staff, the desk and admins.
- DPDP Act 2023: care is the hospital's lawful purpose, but BedBoard still provides a printable patient notice template, correction and erasure tools, and anonymises patients after RETENTION\_DAYS (the hospital's main medical record is kept elsewhere for the legal period).
- Auto logout after IDLE\_LOGOUT\_MINUTES on shared devices, PIN re-entry, bcrypt (cost 12), httpOnly cookies, server role checks, rate limits, security headers, HTTPS via optional Caddy, nightly encrypted backups (14 days).

### 9. Deployment

- Same as QueueCare: Ubuntu or Windows + Docker, 2 GB RAM. `cp .env.example .env`, `docker compose up -d`, `docker compose exec app npx prisma db seed`.
- Can run on the same server as QueueCare (different port and database).
- A TV at casualty opens the dashboard full screen with a VIEWER login.
- Seed: 120-bed demo hospital, 8 wards (General Male, General Female, Paediatrics, Maternity, ICU, HDU, Surgery, Isolation), about 75% occupied, 10 pending discharges.

### 10. Testing and acceptance

- Unit: every legal and illegal state move (table-driven), reservation expiry, census maths, length of stay.
- Property test (fast-check): any random sequence of actions never leaves a bed OCCUPIED without an open admission, or FREE with one.
- Concurrency: two nurses admit to the same free bed at once; exactly one wins, the other gets 409.
- Offline (Playwright, network off): actions queue and replay; stale ones show the refresh message.
- End to end: desk reserves, nurse admits, doctor orders discharge, steps ticked, patient left, housekeeping cleans, dashboard shows FREE within 2 seconds.
- **Done means:** all tests pass in CI, clean-machine install works, every screen works in Hindi, Lighthouse 90+ on the landing page.

### 11. Landing page (at `/`)

- **Hero:** "Know every free bed, right now." Sub: "A free, open-source live bed board for hospitals. Nurses update in two taps; the whole hospital sees it instantly." Buttons: See live demo, Install free. Visual: ward map with coloured bed tiles.
- **The problem:** "Phone calls to every ward. Whiteboards that are hours old. Patients waiting on trolleys." Quote card from the 2020 Mumbai report with source link.
- **How it works:** Nurse taps a bed, Desk sees it, Housekeeping gets the job.
- **Discharge section:** "Discharged at 11, gone at 5?" Show the checklist tracker.
- **Features grid:** ward map, find a bed, discharge tracker, housekeeping queue, reports, optional public availability.
- **Privacy:** "Names stay inside the ward. Public view shows numbers only."
- **Install** (3 commands), **FAQ** (free? internet? works with our HIS? hardware?), **footer** (GitHub, MIT, contact).
- **Design:** deep blue `#1D4ED8`, the six status colours as the visual identity, always with icon and word.

### 12. Build phases

1. Scaffold, Prisma schema from section 4, Docker Compose (app, worker, postgres), seed, health page.
2. Auth, roles, PIN, admin setup (wards, beds with bulk add, users and ward access).
3. State machine in `src/lib/beds.ts` with tests first; ward map; admit, transfer, discharge steps, cleaning, block, reserve; concurrency test.
4. SSE, dashboard, find a bed, discharge tracker, housekeeping list.
5. Worker jobs, reports, CSV, retention, backups, idle logout, audit viewer, offline queue.
6. Landing page, Hindi for every string, PWA, public page.
7. Playwright tests, CI, README, ADMIN\_GUIDE.md, polish.
