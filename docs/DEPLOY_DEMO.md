# Public demo on Vercel + Neon (free)

This puts the landing page and a **demo hospital with made-up data** on a public link. It is for showing BedBoard to people. **Never enter real patients here.** A real hospital installs BedBoard on its own computer (see README).

## 1. Database (Neon)

1. Create a free project at https://neon.tech (Postgres 16, region close to you).
2. Copy the **direct** connection string (turn *Connection pooling* **off**). It looks like `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`. BedBoard uses advisory locks and LISTEN/NOTIFY, which do not work through the pooled address.

## 2. Website (Vercel)

1. At https://vercel.com choose **Add New → Project**, import the GitHub repo, keep the framework as Next.js. `vercel.json` already sets the build (it applies database migrations on each deploy).
2. Add these environment variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon direct string from step 1 |
| `AUTH_SECRET` | a random string of 32+ characters (`openssl rand -base64 32`) |
| `APP_URL` | your Vercel address, e.g. `https://bedboard.vercel.app` |
| `PUBLIC_PAGE_ENABLED` | `true` (optional: shows the public counts page) |
| `REPO_URL` | your GitHub repo address (shows a link in the footer) |

3. Deploy.

## 3. Load the demo hospital (once)

From your computer, in the project folder:

```bash
DATABASE_URL="<the Neon direct string>" npx prisma db seed
```

Demo logins use the password `bedboard123`: administrator `9000000001`, nurse `9000000002`, admission desk `9000000003`, doctor `9000000004`, housekeeping `9000000005`, casualty-TV viewer `9000000006`. Anyone can use them, so expect the data to get messy. To reset, empty the database in Neon (delete and recreate the branch) and run the migrations and seed again.

## What differs from a real install

- **No background worker.** Nightly reports, retention erasure and automatic release of unclaimed reservations are done by the worker container, which Vercel does not run.
- **Live updates reconnect.** The live stream is cut after 5 minutes and the browser reconnects by itself. A few seconds of delay is normal on the free plan.
- **No backups** beyond what Neon provides.
- **Login attempt limits** are kept in memory per server instance, so they are weaker here.
