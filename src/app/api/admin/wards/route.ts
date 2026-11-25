import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/guard";
import { clientIp, parseBody } from "@/lib/api";
import { wardCreateSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const wards = await db.ward.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { beds: true } } },
  });
  return NextResponse.json({
    wards: wards.map(({ _count, ...w }) => ({ ...w, bedCount: _count.beds })),
  });
}

export async function POST(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;

  const body = await parseBody(req, wardCreateSchema);
  if (!body.ok) return body.response;

  const ward = await db.$transaction(async (tx) => {
    let sortOrder = body.data.sortOrder;
    if (sortOrder === undefined) {
      const last = await tx.ward.aggregate({ _max: { sortOrder: true } });
      sortOrder = (last._max.sortOrder ?? -1) + 1;
    }
    const created = await tx.ward.create({
      data: {
        name: body.data.name,
        gender: body.data.gender,
        floor: body.data.floor,
        specialty: body.data.specialty ?? null,
        sortOrder,
      },
    });
    await writeAudit(tx, { actorUserId: g.actor.id, action: "ward_create", entity: "ward", entityId: created.id, ip: clientIp(req) });
    return created;
  });
  return NextResponse.json({ ward }, { status: 201 });
}
