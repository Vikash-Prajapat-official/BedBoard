import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { bulkBedsSchema } from "@/lib/validation";
import { buildBedLabels } from "@/lib/bed-labels";
import { writeAudit } from "@/lib/audit";

// Setup view of beds (labels, types, status). No patient data is included.
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const wardId = new URL(req.url).searchParams.get("wardId") ?? undefined;
  const beds = await db.bed.findMany({
    where: { wardId },
    select: { id: true, wardId: true, label: true, bedType: true, status: true },
    orderBy: [{ ward: { sortOrder: "asc" } }, { label: "asc" }],
  });
  return NextResponse.json({ beds });
}

// Bulk add: { wardId, bedType, prefix: "Bed", from: 1, to: 30 } creates "Bed 1" .. "Bed 30".
// Labels that already exist in the ward are skipped, so re-running is safe.
export async function POST(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const body = await parseBody(req, bulkBedsSchema);
  if (!body.ok) return body.response;
  const { wardId, bedType, prefix, from, to } = body.data;

  const ward = await db.ward.findUnique({ where: { id: wardId }, select: { id: true } });
  if (!ward) return apiError(404, "NOT_FOUND", "Ward not found");

  const labels = buildBedLabels(prefix, from, to);
  const created = await db.$transaction(async (tx) => {
    const r = await tx.bed.createMany({
      data: labels.map((label) => ({ wardId, label, bedType })),
      skipDuplicates: true,
    });
    await writeAudit(tx, { actorUserId: g.actor.id, action: "beds_bulk_add", entity: "ward", entityId: wardId, ip: clientIp(req) });
    return r.count;
  });

  return NextResponse.json({ created, skipped: labels.length - created }, { status: 201 });
}
