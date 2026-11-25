# BedBoard administrator guide

For the person who installs and looks after BedBoard in a hospital: an IT officer, a systems administrator, or a medical superintendent's nominee. You do not need to be a programmer, but you should be comfortable installing software and keeping a computer running.

BedBoard is free software (MIT licence). It runs on a computer inside your hospital. Nothing is sent to the internet.

**Contents:** [What you need](#1-what-you-need) · [Install](#2-install) · [First day](#3-first-day-wards-beds-and-staff) · [Who can do what](#4-who-can-do-what) · [Phones, the TV and Hindi](#5-phones-the-casualty-tv-and-hindi) · [HTTPS](#6-https-optional-but-needed-to-install-the-app-on-phones) · [Settings](#7-settings) · [Backups](#8-backups-read-this) · [Privacy](#9-patient-privacy) · [Reports](#10-reports-and-exports) · [Public page](#11-public-availability-page-optional) · [Updating](#12-updating-bedboard) · [Keeping it running](#13-keeping-it-running) · [Before go-live](#14-checklist-before-go-live) · [Troubleshooting](#15-troubleshooting) · [Reset or remove](#16-reset-or-remove)

---

## 1. What you need

| | |
|---|---|
| **A computer** | Any PC or small server with **2 GB of free memory**, about **10 GB of disk**, running Windows 10/11 (Pro or Home), Ubuntu, or macOS. It must stay switched on and on the hospital network. |
| **Docker** | Docker Desktop (Windows, macOS) or Docker Engine with the Compose plugin (Linux). On Windows, tick "use WSL 2" when Docker asks. |
| **Git** | To download BedBoard and to update it later. |
| **A fixed address** | Give the computer a fixed IP address (for example `192.168.1.10`) in your router, so phones always find it. |
| **Wi-Fi in the wards** | Ward phones use their own browser. If a phone loses signal for a moment, its taps are kept on the phone and sent later (see section 5). |

Staff use the browser on their own phones. Nothing to install on the phones.

## 2. Install

Three steps, in a terminal opened in a folder of your choice.

**Linux, macOS, or Windows with Git Bash:**

```bash
git clone <the BedBoard repository address> bedboard && cd bedboard
sh scripts/init-env.sh
docker compose up -d --build
```

**Windows PowerShell:**

```powershell
git clone <the BedBoard repository address> bedboard; cd bedboard
powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1
docker compose up -d --build
```

The second step creates a file called `.env` with **random passwords** made just for you. BedBoard refuses to start without proper secrets, so there are no default passwords to forget to change.

> **Do this now:** open `.env`, find `BACKUP_PASSPHRASE`, and copy it somewhere safe that is **not this computer** (a password manager, or a sealed note held by the administrator). Your backups are encrypted with it. **If it is lost, the backups cannot be opened by anyone.**

The first build takes a few minutes. When it finishes, open **http://localhost:3001** on that computer.

### The first-run page

On a new install, BedBoard shows a setup page. Enter your hospital's name and create **your own administrator account** (your mobile number is your login). This page works **once**: as soon as the first user exists it closes for good.

Do **not** run `prisma db seed`. That loads a made-up demo hospital with a published password and is only for trying BedBoard on a test computer.

## 3. First day: wards, beds and staff

Log in, then use **Admin**.

1. **Wards**: add each ward with its gender (male, female, or mixed), floor and specialty.
2. **Beds**: pick a ward and bed type, and add many beds at once. *Prefix* "Bed", *from* 1, *to* 30 creates Bed 1 to Bed 30. Running it again is safe: beds that already exist are skipped. Bed types: general, oxygen, ventilator, ICU, cot, isolation.
3. **Staff**: create a login for each person: name, mobile number, a starting password (tell them to keep it private), and a role. **Nurses must be given their wards**: a nurse can only change beds in the wards you tick.

Each person can then open **Profile** to set a 4-digit PIN (used on shared ward phones, see section 5).

If someone leaves, open **Admin → Staff** and press **Deactivate**. It takes effect on their very next tap. Passwords are reset here too, because BedBoard has no email.

## 4. Who can do what

| Role | Can do |
|---|---|
| **Nurse** | Admit, transfer, discharge steps, mark cleaned, block or unblock beds **in her own wards**. Sees patient names only in those wards. |
| **Admission desk** | Find a free bed, reserve it, admit. Sees patient names in every ward. |
| **Doctor** | Plan a discharge and give the discharge order. Sees names in every ward. |
| **Housekeeping** | Sees beds waiting to be cleaned (no patient information) and marks them clean. |
| **Viewer** | Read-only dashboard of **numbers**. Made for the casualty TV. |
| **Administrator** | Setup, reports, CSV exports, audit log, patient privacy tools. Cannot admit or discharge. |

The server checks the role on **every** request. Hiding a button is never the only protection.

## 5. Phones, the casualty TV and Hindi

- **Phones:** open `http://<computer's address>:3001` (for example `http://192.168.1.10:3001`) in Chrome. Add it to the home screen for quick access.
- **Hindi and English:** the switcher is at the top of every screen. The choice is remembered on that phone. *Please have a Hindi-speaking member of staff read `messages/hi.json` once before you go live: it was written without a native-speaker review.*
- **Shared ward phones:** after `IDLE_LOGOUT_MINUTES` (default 15) without a touch the screen is covered. With a PIN set, the person types the PIN to carry on. With no PIN, or after five wrong PINs, they are logged out. This stops a passer-by at an unattended phone. It is not a substitute for the phone's own screen lock.
- **When the signal drops:** taps made on a page that is already open are saved on the phone and sent, in order, when the connection returns. If the bed was changed by someone else meanwhile, the nurse sees **"Bed changed, please refresh"** and that tap is *not* applied. A page that is not already open cannot load without a connection.
- **The casualty TV:** create a staff login with the **Viewer** role. Open the dashboard on the TV's browser, log in, and press **Full screen**. It updates by itself, within a second or two, and shows numbers only.

## 6. HTTPS (optional, but needed to install the app on phones)

Browsers only let a website be **installed as an app** (and run its offline screen) over **HTTPS**. Plain `http://192.168...` works for everything else. If you want the install-as-app feature, or you simply want encrypted traffic, turn on the built-in HTTPS front door:

1. In `.env` add: `SITE_ADDRESS=192.168.1.10` (your computer's address, or a name your network resolves).
2. Run: `docker compose --profile https up -d`
3. Open `https://192.168.1.10`.

On a hospital network with no internet, BedBoard makes its own private certificate. Each phone must trust it **once**, otherwise the browser shows a warning:

- Copy the certificate out: `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./bedboard-root.crt`
- Send `bedboard-root.crt` to the phones and install it (Android: Settings → Security → Encryption & credentials → Install a certificate → CA certificate).

If the server has a real public domain name, delete the `local_certs` line in `Caddyfile` and Caddy will get a free public certificate by itself.

If you put **your own** web server (nginx, IIS, a hospital proxy) in front instead, **switch response buffering off for `/api/stream`**, or the live updates will arrive late. For nginx: `proxy_buffering off;` for that location (BedBoard also sends `X-Accel-Buffering: no`).

## 7. Settings

Settings live in `.env`. After changing one, run `docker compose up -d` to apply it.

| Setting | Default | Meaning |
|---|---|---|
| `RESERVATION_MINUTES` | 30 | A reserved bed is released by itself after this long if nobody is admitted. |
| `DISCHARGE_ALERT_HOURS` | 4 | A discharge order turns red after this many hours. |
| `IDLE_LOGOUT_MINUTES` | 15 | Shared-phone lock. |
| `RETENTION_DAYS` | 365 | Patient names are erased this many days after the patient leaves. |
| `PUBLIC_PAGE_ENABLED` | false | Turns on the public counts page (section 11). |
| `REPO_URL`, `CONTACT_EMAIL` | empty | Shown in the footer of the home page. |
| `SITE_ADDRESS` | localhost | Used by the optional HTTPS front door. |
| `PORT` | 3001 | The web port. |

The hospital's time zone is set to **Asia/Kolkata**. The midnight census, the nightly jobs and the "discharges today" count use it.

## 8. Backups (read this)

BedBoard saves an **encrypted copy of the whole database every night at 02:30** into the `backups` folder next to BedBoard, and keeps the last 14 days.

**A backup that stays on the same computer will not survive that computer failing.** Copy the `backups` folder to somewhere else regularly: another computer, an external drive that you keep in a different room, or a cloud drive. Once a week is a sensible minimum. The files are encrypted, so a lost drive does not expose patient data. Keep a copy of `BACKUP_PASSPHRASE` separately (section 2).

```bash
docker compose exec backup bash /scripts/backup.sh once                         # take one right now
docker compose exec backup bash /scripts/restore.sh /backups/<file> --check     # prove a backup opens
docker compose exec backup bash /scripts/restore.sh /backups/<file>             # restore into a NEW database "bedboard_restore"
```

(On Windows Git Bash put `MSYS_NO_PATHCONV=1` in front of these.)

**Try a restore once a month** on the `--check` setting. A backup you have never opened is a hope, not a backup.

To restore into the live system after a disaster: stop the app (`docker compose stop app worker`), then run the restore command with the database name `bedboard` at the end, then `docker compose start app worker`. Do this only when you mean it: it replaces the live data.

## 9. Patient privacy

- **Who sees names:** the ward's own nurses, the admission desk, doctors and administrators. The dashboard, the TV, reports, CSV files and the public page show **numbers only**.
- **Audit log** (Admin → Audit log): every bed change, login, setup step and export, with who and when. It holds no patient names.
- **Automatic erasure:** `RETENTION_DAYS` after a patient leaves, their name, UHID, phone and ABHA number are erased. Age and sex stay so reports still work. The hospital's own medical record is kept elsewhere for as long as the law requires: BedBoard is not that record.
- **Patient privacy tool** (Admin → Patient privacy): find a patient by UHID or name, **correct** a mistake, or **erase** their details on request (not while they are still admitted). Every use is audit-logged.
- **Patient notice:** Admin → Patient privacy → *Printable patient notice* opens a one-page notice in the language you have chosen. Print it in English and in Hindi for the admission desk. **It is a template, not legal advice**: please have the hospital's legal adviser check it and write the contact person's name and phone on it. The text is in `messages/en.json` and `messages/hi.json` under `notice` if you want to change the wording.
- **Rights under the DPDP Act 2023:** BedBoard helps with notice, correction and erasure. The hospital remains responsible for its own compliance, including who it names as grievance contact.
- **Exports:** the admissions CSV deliberately has **no patient name or phone**. It does contain the UHID so you can look a stay up in your own system. Treat it as confidential.

## 10. Reports and exports

Admin → **Reports**: average occupancy by day and by ward (from the **midnight census** BedBoard saves every night), average length of stay, time from discharge order to patient leaving, discharges per bed, and average cleaning time. Pick a date range (up to a year). **Download admissions (CSV)** and **Download census (CSV)** open in Excel.

A day has no census if BedBoard was switched off at midnight. The report says how many days have data.

**Measure your baseline.** Before you start, write down how long it takes today (a) from the decision to admit to a patient having a bed, and (b) from the discharge order to the bed being free. After a month on BedBoard, compare with *Order to patient left* and the cleaning time on the Reports page. That comparison is the evidence a hospital needs.

## 11. Public availability page (optional)

Set `PUBLIC_PAGE_ENABLED=true`, run `docker compose up -d`, and share `http://<address>:3001/public`. It shows free and total beds by bed type, nothing else (no ward names, no patient information), and is up to a minute old. Off by default.

## 12. Updating BedBoard

1. Take a backup first: `docker compose exec backup bash /scripts/backup.sh once`.
2. `git pull`
3. `docker compose up -d --build`

Database changes are applied automatically when the app starts. If something goes wrong, `git checkout <the previous version>`, run step 3 again, and restore the backup if the data looks wrong.

## 13. Keeping it running

- **Start automatically:** the services restart themselves after a power cut *if Docker starts*. On Windows, set Docker Desktop to start when you sign in, and set the computer to sign in automatically (or run it as a server). On Linux, `sudo systemctl enable docker`.
- **Power settings:** switch off sleep and hibernation on the computer. A sleeping computer is an outage.
- **A small UPS** (battery) on the computer and the Wi-Fi router is worth more than anything else here.
- **Disk space:** look at `docker system df` now and then. Backups are small (a hospital's database is megabytes) but keep an eye on the folder.
- **The computer's clock** must be right. Turn on automatic time.
- **Logs:** `docker compose logs app --tail 100` (also `worker`, `db`, `backup`).
- **Health:** `http://<address>:3001/health` shows whether the app and database are up.

## 14. Checklist before go-live

- [ ] Installed with `init-env`, **not** seeded with demo data.
- [ ] `BACKUP_PASSPHRASE` copied somewhere safe, and a `--check` restore done at least once.
- [ ] The `backups` folder is copied to another machine or drive on a schedule.
- [ ] The computer has a fixed IP, does not sleep, and (ideally) has a UPS.
- [ ] Every staff member has their own login. Nobody shares one.
- [ ] Nurses are assigned to the right wards, and each ward phone opens its own ward.
- [ ] Hindi text read by a Hindi speaker.
- [ ] Patient notice printed and checked by the hospital's legal adviser, with a contact person filled in.
- [ ] Port 3001 (and 443 if you use HTTPS) is reachable **only from the hospital network**. Do not expose BedBoard to the open internet unless you have put HTTPS and a firewall in front of it.
- [ ] A short training session for each role, using a test ward first.
- [ ] See `docs/PILOT_CHECKLIST.md` for the hands-on tests.

## 15. Troubleshooting

| Problem | What to do |
|---|---|
| The app will not start and says `AUTH_SECRET` is missing | Run `sh scripts/init-env.sh` (it only creates `.env` if there is none), or put a random value of 32+ characters in `AUTH_SECRET`. |
| `backup` keeps restarting | `BACKUP_PASSPHRASE` in `.env` is missing, still the sample value, or under 12 characters. |
| Page opens but the numbers never update | The "Live" label shows "Reconnecting". Check Wi-Fi. If you use a proxy, turn buffering off for `/api/stream` (section 6). |
| "Bed changed, please refresh" | Someone else changed that bed first. Refresh, look at the bed, and try again. This is the system protecting you from a double booking. |
| A nurse cannot change a bed | She is not assigned to that ward (Admin → Staff), or the bed is in a state that does not allow that action. |
| Someone is locked out | After 10 wrong passwords a number is locked for 15 minutes. Wait, or reset their password in Admin → Staff. |
| A user forgot their PIN | Admin → Staff → **Reset PIN**, then they set a new one in Profile. |
| The reports have no census | The nightly census has not run yet, or the computer was off at midnight. |
| "Install app" does not appear on phones | The install feature needs HTTPS (section 6). |
| Port 3001 is already used | Change `PORT` in `.env` and run `docker compose up -d`. |

## 16. Reset or remove

- **Stop BedBoard but keep the data:** `docker compose stop`
- **Start again:** `docker compose up -d`
- **Remove everything, including ALL patient data and the database:** `docker compose down -v`. **This cannot be undone**, except from a backup. Take one first.

---

*Known limits:* BedBoard does not connect to a hospital information system (HIS) yet, does not send SMS or email, and offline taps work only on a page that is already open. The Hindi has not had a native-speaker review. See `DECISIONS.md` for every design choice and the reasons behind it.
