import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

// Phase 1: heartbeat only. Reservation expiry, census snapshots and the
// retention job are added in Phase 5 (see SPEC.md section 5).
const db = new PrismaClient();

async function heartbeat() {
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(`[worker] heartbeat ok ${new Date().toISOString()}`);
  } catch (err) {
    console.error("[worker] database unreachable", err);
  }
}

cron.schedule("* * * * *", heartbeat);
console.log("[worker] started");
void heartbeat();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
