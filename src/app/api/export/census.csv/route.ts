import { guard } from "@/lib/guard";
import { apiError, clientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { getCensusHistory, resolveRange } from "@/lib/reports";

export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const r = await resolveRange({ from: sp.get("from"), to: sp.get("to") });
  if (!r.ok) return apiError(400, "VALIDATION", r.message);

  const rows = await getCensusHistory(r.range);
  await writeAudit(db, { actorUserId: g.actor.id, action: "export_census", entity: "report", entityId: `${r.range.from}..${r.range.to}`, ip: clientIp(req) });

  const body = toCsv(
    ["date", "ward", "bed_type", "total", "occupied", "free", "blocked"],
    rows.map((x) => [x.date, x.ward, x.bedType, x.total, x.occupied, x.free, x.blocked]),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bedboard-census-${r.range.from}-to-${r.range.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
