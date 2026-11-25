import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { pinSetSchema } from "@/lib/validation";
import { pinLimiter } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

// Set or change my own 4-digit PIN (used for re-entry on shared ward devices).
// Requires the account password so a borrowed unlocked phone cannot set a PIN.
export async function POST(req: Request) {
  const g = await guard("any");
  if (!g.ok) return g.response;

  const key = `pinset:${g.actor.id}`;
  if (pinLimiter.blocked(key)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");

  const body = await parseBody(req, pinSetSchema);
  if (!body.ok) return body.response;

  const me = await db.user.findUnique({ where: { id: g.actor.id }, select: { passwordHash: true } });
  if (!me || !(await bcrypt.compare(body.data.password, me.passwordHash))) {
    pinLimiter.fail(key);
    return apiError(403, "WRONG_PASSWORD", "Password is incorrect");
  }
  pinLimiter.clear(key);

  const pinHash = await bcrypt.hash(body.data.pin, 12);
  await db.user.update({ where: { id: g.actor.id }, data: { pinHash } });
  await writeAudit(db, { actorUserId: g.actor.id, action: "pin_set", entity: "user", entityId: g.actor.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
