import { guard } from "@/lib/guard";
import { apiError, clientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { lengthOfStayHours } from "@/lib/report-math";
import { resolveRange } from "@/lib/reports";

/**
 * Admissions that overlap the range. Deliberately has NO patient name or phone: reports need
 * length of stay, not identities. The UHID is included so the hospital can look a stay up in its own
 * record system. Every export is written to the audit log.
 */
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const r = await resolveRange({ from: sp.get("from"), to: sp.get("to") });
  if (!r.ok) return apiError(400, "VALIDATION", r.message);
  const { start, end, from, to } = r.range;

  const rows = await db.admission.findMany({
    where: { admittedAt: { lt: end }, OR: [{ leftAt: null }, { leftAt: { gte: start } }] },
    orderBy: { admittedAt: "asc" },
    take: 100_000,
    select: {
      id: true, admittedAt: true, dischargeOrderAt: true, summaryReadyAt: true, billClearedAt: true, medsGivenAt: true, leftAt: true, outcome: true,
      patient: { select: { uhid: true, age: true, sex: true } },
      bed: { select: { label: true, ward: { select: { name: true } } } },
    },
  });
  await writeAudit(db, { actorUserId: g.actor.id, action: "export_admissions", entity: "report", entityId: `${from}..${to}`, ip: clientIp(req) });

  const body = toCsv(
    ["admission_id", "uhid", "age", "sex", "ward", "bed", "admitted_at", "discharge_order_at", "summary_ready_at", "bill_cleared_at", "meds_given_at", "left_at", "outcome", "length_of_stay_hours"],
    rows.map((a) => [
      a.id, a.patient.uhid, a.patient.age, a.patient.sex, a.bed.ward.name, a.bed.label,
      a.admittedAt, a.dischargeOrderAt, a.summaryReadyAt, a.billClearedAt, a.medsGivenAt, a.leftAt, a.outcome,
      a.leftAt ? Math.round(lengthOfStayHours(a.admittedAt, a.leftAt) * 10) / 10 : "",
    ]),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bedboard-admissions-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
