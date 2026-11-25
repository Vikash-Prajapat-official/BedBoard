import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { wardPatchSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, wardPatchSchema);
  if (!body.ok) return body.response;

  const existing = await db.ward.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return apiError(404, "NOT_FOUND", "Ward not found");

  const ward = await db.$transaction(async (tx) => {
    const updated = await tx.ward.update({ where: { id }, data: body.data });
    await writeAudit(tx, { actorUserId: g.actor.id, action: "ward_update", entity: "ward", entityId: id, ip: clientIp(req) });
    return updated;
  });
  return NextResponse.json({ ward });
}
