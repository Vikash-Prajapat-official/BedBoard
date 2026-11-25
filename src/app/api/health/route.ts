import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public liveness check (no patient data). Used by Docker healthcheck and /health.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { error: { code: "DB_DOWN", message: "Database is not reachable" } },
      { status: 503 },
    );
  }
}
