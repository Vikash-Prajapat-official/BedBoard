import cron from "node-cron";
import { db } from "../lib/db";
import { releaseExpiredReservations } from "../lib/bed-service";
import { takeCensus } from "../lib/census";
import { anonymiseExpiredPatients } from "../lib/retention";
import { getEnv } from "../lib/env";

// Reservation expiry runs every minute (Phase 3). Census snapshots and the
// retention job are added in Phase 5 (see SPEC.md section 5).
async function expireReservations() {
  try {
    const n = await releaseExpiredReservations();
    if (n > 0) console.log(`[worker] released ${n} expired reservation(s)`);
  } catch (err) {
    console.error("[worker] reservation expiry failed", err);
  }
}

async function heartbeat() {
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(`[worker] heartbeat ok ${new Date().toISOString()}`);
  } catch (err) {
    console.error("[worker] database unreachable", err);
  }
}

async function runCensus(timeZone: string) {
  try {
    const c = await takeCensus(new Date(), timeZone);
    console.log(`[worker] census ${c.date}: ${c.rows} ward/type rows`);
  } catch (err) {
    console.error("[worker] census failed", err);
  }
}

async function runRetention(days: number) {
  try {
    const n = await anonymiseExpiredPatients(new Date(), days);
    console.log(`[worker] retention: ${n} patient(s) anonymised (older than ${days} days)`);
  } catch (err) {
    console.error("[worker] retention failed", err);
  }
}

async function main() {
  // Jobs run on the hospital's clock (default Asia/Kolkata), not the server's.
  const hospital = await db.hospital.findFirst({ select: { timezone: true } }).catch(() => null);
  const timeZone = hospital?.timezone ?? "Asia/Kolkata";
  const retentionDays = getEnv().RETENTION_DAYS;

  cron.schedule("* * * * *", () => {
    void heartbeat();
    void expireReservations();
  });
  cron.schedule("0 0 * * *", () => void runCensus(timeZone), { timezone: timeZone }); // midnight census
  cron.schedule("30 2 * * *", () => void runRetention(retentionDays), { timezone: timeZone }); // nightly retention
  console.log(`[worker] jobs scheduled in ${timeZone}: census 00:00, retention 02:30 (${retentionDays} days)`);
}
void main();
console.log("[worker] started");
void heartbeat();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
