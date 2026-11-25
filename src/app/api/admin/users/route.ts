import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { userCreateSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

// Never returns password or PIN hashes.
export async function GET() {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, phone: true, role: true, active: true, pinHash: true, wards: { select: { wardId: true } } },
  });
  return NextResponse.json({
    users: users.map(({ pinHash, wards, ...u }) => ({ ...u, hasPin: !!pinHash, wardIds: wards.map((w) => w.wardId) })),
  });
}

export async function POST(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const body = await parseBody(req, userCreateSchema);
  if (!body.ok) return body.response;
  const { name, phone, password, role } = body.data;
  // Ward access only matters for nurses (SPEC section 4: UserWard).
  const wardIds = role === "NURSE" ? [...new Set(body.data.wardIds)] : [];

  if (wardIds.length) {
    const found = await db.ward.count({ where: { id: { in: wardIds } } });
    if (found !== wardIds.length) return apiError(400, "VALIDATION", "wardIds: one or more wards do not exist");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name, phone, passwordHash, role, wards: { create: wardIds.map((wardId) => ({ wardId })) } },
        select: { id: true, name: true, phone: true, role: true, active: true },
      });
      await writeAudit(tx, { actorUserId: g.actor.id, action: "user_create", entity: "user", entityId: u.id, ip: clientIp(req) });
      return u;
    });
    return NextResponse.json({ user: { ...user, hasPin: false, wardIds } }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return apiError(409, "PHONE_TAKEN", "A user with this phone number already exists");
    }
    throw e;
  }
}
