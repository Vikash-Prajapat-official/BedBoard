import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { setupSchema } from "@/lib/validation";
import { setupLimiter } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

/**
 * First-run setup: creates the hospital name and the first ADMIN. It is public
 * on purpose (nobody can log in yet) but only works while there are NO users,
 * and the check runs under an advisory lock so two requests cannot both win.
 */
export async function POST(req: Request) {
  const ip = clientIp(req) ?? "unknown";
  if (setupLimiter.blocked(ip)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");

  const body = await parseBody(req, setupSchema);
  if (!body.ok) return body.response;
  const { hospitalName, name, phone, password } = body.data;

  const passwordHash = await bcrypt.hash(password, 12);

  const userId = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
    if ((await tx.user.count()) > 0) return null;

    const existing = await tx.hospital.findFirst();
    if (existing) await tx.hospital.update({ where: { id: existing.id }, data: { name: hospitalName } });
    else await tx.hospital.create({ data: { name: hospitalName } });

    const user = await tx.user.create({ data: { name, phone, passwordHash, role: "ADMIN" } });
    await writeAudit(tx, { actorUserId: user.id, action: "setup_complete", entity: "user", entityId: user.id, ip });
    return user.id;
  });

  if (!userId) {
    setupLimiter.fail(ip);
    return apiError(409, "ALREADY_SETUP", "Setup is already complete. Please log in.");
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
