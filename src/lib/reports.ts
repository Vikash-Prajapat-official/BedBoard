import { db } from "./db";
import { censusOccupancy, average, lengthOfStayHours, localDate, pairDurations, turnoverRate } from "./report-math";
import { startOfLocalDate } from "./stats";

export type Range = { from: string; to: string; start: Date; end: Date; timeZone: string };
export const MAX_RANGE_DAYS = 366;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const validDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && addDays(d, 0) === d;

/** Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD (hospital local dates, both inclusive). Default: the last 30 days. */
export async function resolveRange(q: { from?: string | null; to?: string | null }, now: Date = new Date()): Promise<{ ok: true; range: Range } | { ok: false; message: string }> {
  const hospital = await db.hospital.findFirst({ select: { timezone: true } });
  const timeZone = hospital?.timezone ?? "Asia/Kolkata";
  const to = q.to || localDate(now, timeZone);
  const from = q.from || addDays(to, -29);
  if (!validDate(from) || !validDate(to)) return { ok: false, message: "Dates must look like 2026-11-25" };
  if (from > to) return { ok: false, message: "'From' must not be after 'to'" };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_RANGE_DAYS) return { ok: false, message: `At most ${MAX_RANGE_DAYS} days at a time` };
  return { ok: true, range: { from, to, start: startOfLocalDate(from, timeZone), end: startOfLocalDate(addDays(to, 1), timeZone), timeZone } };
}

const dayRange = (r: Range) => ({ gte: new Date(`${r.from}T00:00:00Z`), lte: new Date(`${r.to}T00:00:00Z`) });
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

// ---- census history ----------------------------------------------------------------

export async function getCensusHistory(r: Range) {
  const rows = await db.censusSnapshot.findMany({
    where: { date: dayRange(r) },
    select: { date: true, bedType: true, total: true, occupied: true, free: true, blocked: true, ward: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ date: "desc" }],
  });
  rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.ward.sortOrder - b.ward.sortOrder || a.bedType.localeCompare(b.bedType));
  return rows.map((x) => ({ date: x.date.toISOString().slice(0, 10), wardId: x.ward.id, ward: x.ward.name, bedType: x.bedType, total: x.total, occupied: x.occupied, free: x.free, blocked: x.blocked }));
}

// ---- occupancy ---------------------------------------------------------------------

export async function getOccupancyReport(r: Range) {
  const history = await getCensusHistory(r);
  const byDate = new Map<string, typeof history>();
  const byWard = new Map<string, { name: string; days: Map<string, typeof history> }>();
  for (const h of history) {
    byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);
    const w = byWard.get(h.wardId) ?? { name: h.ward, days: new Map() };
    w.days.set(h.date, [...(w.days.get(h.date) ?? []), h]);
    byWard.set(h.wardId, w);
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      total: rows.reduce((s, x) => s + x.total, 0),
      occupied: rows.reduce((s, x) => s + x.occupied, 0),
      free: rows.reduce((s, x) => s + x.free, 0),
      blocked: rows.reduce((s, x) => s + x.blocked, 0),
      occupancyPct: censusOccupancy(rows),
    }));
  const pcts = (list: (number | null)[]) => average(list.filter((p): p is number => p !== null));
  return {
    range: { from: r.from, to: r.to },
    daysWithData: days.length,
    averageOccupancyPct: r1(pcts(days.map((d) => d.occupancyPct))),
    days,
    wards: [...byWard.entries()].map(([wardId, w]) => ({
      wardId,
      name: w.name,
      averageOccupancyPct: r1(pcts([...w.days.values()].map((rows) => censusOccupancy(rows)))),
    })),
  };
}

// ---- length of stay and turnover ----------------------------------------------------

async function dischargedAdmissions(r: Range) {
  return db.admission.findMany({
    where: { leftAt: { gte: r.start, lt: r.end } },
    select: { admittedAt: true, leftAt: true, dischargeOrderAt: true, outcome: true, bed: { select: { wardId: true, ward: { select: { name: true } } } } },
  });
}

/** Ward = the bed the patient left from (a patient moved between wards counts in the last one). */
export async function getLosReport(r: Range) {
  const adms = await dischargedAdmissions(r);
  const stats = (list: typeof adms) => ({
    discharges: list.length,
    avgLosHours: r1(average(list.map((a) => lengthOfStayHours(a.admittedAt, a.leftAt!)))),
    avgOrderToLeftHours: r1(average(list.filter((a) => a.dischargeOrderAt).map((a) => lengthOfStayHours(a.dischargeOrderAt!, a.leftAt!)))),
  });
  const wards = new Map<string, { name: string; list: typeof adms }>();
  for (const a of adms) {
    const w = wards.get(a.bed.wardId) ?? { name: a.bed.ward.name, list: [] };
    w.list.push(a);
    wards.set(a.bed.wardId, w);
  }
  const outcomes: Record<string, number> = { DISCHARGED: 0, LAMA: 0, REFERRED: 0, DIED: 0 };
  for (const a of adms) if (a.outcome) outcomes[a.outcome] = (outcomes[a.outcome] ?? 0) + 1;
  return {
    range: { from: r.from, to: r.to },
    overall: stats(adms),
    outcomes,
    wards: [...wards.entries()].map(([wardId, w]) => ({ wardId, name: w.name, ...stats(w.list) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getTurnoverReport(r: Range) {
  const [adms, beds, events] = await Promise.all([
    dischargedAdmissions(r),
    db.bed.groupBy({ by: ["wardId"], where: { ward: { active: true } }, _count: { _all: true } }),
    db.bedEvent.findMany({
      // Start a little early so a CLEANING that began before the range but finished inside it is paired.
      where: { toStatus: { in: ["CLEANING", "FREE"] }, at: { gte: new Date(r.start.getTime() - 3 * 86_400_000), lt: r.end } },
      select: { bedId: true, toStatus: true, at: true, bed: { select: { wardId: true } } },
    }),
  ]);
  const wardOfBed = new Map(events.map((e) => [e.bedId, e.bed.wardId]));
  const cleaning = pairDurations(events, "CLEANING", "FREE").filter((p) => p.endedAt >= r.start && p.endedAt < r.end);
  const names = new Map((await db.ward.findMany({ select: { id: true, name: true } })).map((w) => [w.id, w.name]));

  const wards = beds.map((b) => ({
    wardId: b.wardId,
    beds: b._count._all,
    discharges: adms.filter((a) => a.bed.wardId === b.wardId).length,
  }));

  const out = wards.map((w) => ({
    wardId: w.wardId,
    name: names.get(w.wardId) ?? "",
    beds: w.beds,
    discharges: w.discharges,
    turnoverPerBed: turnoverRate(w.discharges, w.beds),
    avgCleaningMinutes: r1(average(cleaning.filter((c) => wardOfBed.get(c.bedId) === w.wardId).map((c) => c.minutes))),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const totalBeds = wards.reduce((s, w) => s + w.beds, 0);
  return {
    range: { from: r.from, to: r.to },
    overall: { beds: totalBeds, discharges: adms.length, turnoverPerBed: turnoverRate(adms.length, totalBeds), avgCleaningMinutes: r1(average(cleaning.map((c) => c.minutes))) },
    wards: out,
  };
}
