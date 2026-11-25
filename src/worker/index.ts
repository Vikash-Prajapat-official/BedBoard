import cron from "node-cron";
import { db } from "../lib/db";
import { releaseExpiredReservations } from "../lib/bed-service";

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

cron.schedule("* * * * *", () => {
  void heartbeat();
  void expireReservations();
});
console.log("[worker] started");
void heartbeat();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
