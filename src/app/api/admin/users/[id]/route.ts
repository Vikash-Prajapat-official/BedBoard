import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { userPatchSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, userPatchSchema);
  if (!body.ok) return body.response;
  const d = body.data;

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return apiError(404, "NOT_FOUND", "User not found");

  // An admin cannot lock themselves out. This also guarantees one active admin always remains.
  if (id === g.actor.id && (d.active === false || (d.role !== undefined && d.role !== "ADMIN"))) {
    return apiError(409, "SELF_LOCKOUT", "You cannot deactivate or demote your own account");
  }

  const finalRole = d.role ?? target.role;
  const wardIds = finalRole === "NURSE" ? (d.wardIds ? [...new Set(d.wardIds)] : undefined) : [];
  if (wardIds?.length) {
    const found = await db.ward.count({ where: { id: { in: wardIds } } });
    if (found !== wardIds.length) return apiError(400, "VALIDATION", "wardIds: one or more wards do not exist");
  }

  const passwordHash = d.password ? await bcrypt.hash(d.password, 12) : undefined;

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: {
        name: d.name,
        role: d.role,
        active: d.active,
        passwordHash,
        pinHash: d.resetPin ? null : undefined,
      },
      select: { id: true, name: true, phone: true, role: true, active: true, pinHash: true },
    });
    // Only touch ward access when it is being set, or the role stops being NURSE.
    if (wardIds !== undefined && (d.wardIds !== undefined || d.role !== undefined)) {
      await tx.userWard.deleteMany({ where: { userId: id } });
      if (wardIds.length) await tx.userWard.createMany({ data: wardIds.map((wardId) => ({ userId: id, wardId })) });
    }
    const ip = clientIp(req);
    await writeAudit(tx, { actorUserId: g.actor.id, action: "user_update", entity: "user", entityId: id, ip });
    if (passwordHash) await writeAudit(tx, { actorUserId: g.actor.id, action: "user_password_reset", entity: "user", entityId: id, ip });
    if (d.resetPin) await writeAudit(tx, { actorUserId: g.actor.id, action: "user_pin_reset", entity: "user", entityId: id, ip });
    return u;
  });

  const { pinHash, ...safe } = user;
  return NextResponse.json({ user: { ...safe, hasPin: !!pinHash } });
}
