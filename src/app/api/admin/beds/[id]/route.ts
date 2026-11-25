import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { bedPatchSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

// Rename a bed or change its type. Status changes are NOT done here: they go through
// the state machine in src/lib/beds.ts (Phase 3).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, bedPatchSchema);
  if (!body.ok) return body.response;

  const bed = await db.bed.findUnique({ where: { id }, select: { id: true, status: true, bedType: true } });
  if (!bed) return apiError(404, "NOT_FOUND", "Bed not found");

  const typeChanges = body.data.bedType !== undefined && body.data.bedType !== bed.bedType;
  if (typeChanges && bed.status !== "FREE" && bed.status !== "BLOCKED") {
    return apiError(409, "BED_IN_USE", "Only a free or blocked bed can change type");
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.bed.update({
        where: { id },
        data: { label: body.data.label, bedType: body.data.bedType },
        select: { id: true, wardId: true, label: true, bedType: true, status: true },
      });
      await writeAudit(tx, { actorUserId: g.actor.id, action: "bed_update", entity: "bed", entityId: id, ip: clientIp(req) });
      return u;
    });
    return NextResponse.json({ bed: updated });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return apiError(409, "LABEL_TAKEN", "Another bed in this ward already has that label");
    }
    throw e;
  }
}
