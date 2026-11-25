import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, parseBody } from "@/lib/api";
import { pinVerifySchema } from "@/lib/validation";
import { pinLimiter } from "@/lib/rate-limit";

// Checks my PIN. The idle-lock screen that calls this arrives in Phase 5.
export async function POST(req: Request) {
  const g = await guard("any");
  if (!g.ok) return g.response;

  const key = `pinverify:${g.actor.id}`;
  if (pinLimiter.blocked(key)) return apiError(429, "RATE_LIMITED", "Too many wrong PINs. Log in with your password.");

  const body = await parseBody(req, pinVerifySchema);
  if (!body.ok) return body.response;

  const me = await db.user.findUnique({ where: { id: g.actor.id }, select: { pinHash: true } });
  if (!me?.pinHash) return apiError(409, "NO_PIN", "No PIN has been set for this account");

  if (!(await bcrypt.compare(body.data.pin, me.pinHash))) {
    pinLimiter.fail(key);
    return apiError(403, "WRONG_PIN", "Wrong PIN");
  }
  pinLimiter.clear(key);
  return NextResponse.json({ ok: true });
}
