import { db } from "./db";
import { BED_TYPES } from "./constants";
import { endOfLocalDay, occupancyPercent } from "./stats";

export type TypeCount = { type: string; total: number; free: number };

export type Counts = {
  total: number;
  free: number;
  reserved: number;
  occupied: number; // OCCUPIED + DISCHARGE_PLANNED: a planned discharge still holds the bed
  cleaning: number;
  blocked: number;
  dischargesToday: number;
  occupancyPct: number | null;
};

export type WardSummary = Counts & { id: string; name: string; floor: number; specialty: string | null; types: TypeCount[] };
export type Dashboard = { hospitalName: string | null; updatedAt: string; totals: Counts; wards: WardSummary[] };

const empty = (): Counts => ({ total: 0, free: 0, reserved: 0, occupied: 0, cleaning: 0, blocked: 0, dischargesToday: 0, occupancyPct: null });

function add(c: Counts, status: string, n: number) {
  c.total += n;
  if (status === "FREE") c.free += n;
  else if (status === "RESERVED") c.reserved += n;
  else if (status === "OCCUPIED" || status === "DISCHARGE_PLANNED") c.occupied += n;
  else if (status === "CLEANING") c.cleaning += n;
  else if (status === "BLOCKED") c.blocked += n;
}

/**
 * Hospital-wide counts. NEVER selects patient data: the dashboard, the casualty TV and the
 * public page are all built from this and show numbers only (SPEC section 8).
 * "Discharges expected today" = open discharge plans due before the end of today in the
 * hospital's time zone, including ones already overdue.
 */
export async function getDashboard(now: Date = new Date()): Promise<Dashboard> {
  const hospital = await db.hospital.findFirst({ select: { name: true, timezone: true } });
  const endOfToday = endOfLocalDay(now, hospital?.timezone ?? "Asia/Kolkata");

  const [wards, grouped, due] = await Promise.all([
    db.ward.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, floor: true, specialty: true },
    }),
    db.bed.groupBy({ by: ["wardId", "bedType", "status"], where: { ward: { active: true } }, _count: { _all: true } }),
    db.bed.groupBy({
      by: ["wardId"],
      where: { status: "DISCHARGE_PLANNED", ward: { active: true }, currentAdmission: { is: { dischargePlannedFor: { lt: endOfToday } } } },
      _count: { _all: true },
    }),
  ]);

  const totals = empty();
  const summaries: WardSummary[] = wards.map((w) => {
    const c = empty();
    const types = new Map<string, TypeCount>();
    for (const g of grouped) {
      if (g.wardId !== w.id) continue;
      add(c, g.status, g._count._all);
      const t = types.get(g.bedType) ?? { type: g.bedType, total: 0, free: 0 };
      t.total += g._count._all;
      if (g.status === "FREE") t.free += g._count._all;
      types.set(g.bedType, t);
    }
    c.dischargesToday = due.find((d) => d.wardId === w.id)?._count._all ?? 0;
    c.occupancyPct = occupancyPercent(c);

    for (const k of ["total", "free", "reserved", "occupied", "cleaning", "blocked", "dischargesToday"] as const) totals[k] += c[k];
    return { ...w, ...c, types: BED_TYPES.flatMap((t) => types.get(t) ?? []) };
  });
  totals.occupancyPct = occupancyPercent(totals);

  return { hospitalName: hospital?.name ?? null, updatedAt: now.toISOString(), totals, wards: summaries };
}
