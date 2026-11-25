/** Pure maths for census, reports and retention. No database, no clock of its own. */
import { occupancyPercent } from "./stats";

export type BedGroup = { wardId: string; bedType: string; status: string; count: number };
export type CensusRow = { wardId: string; bedType: string; total: number; occupied: number; free: number; blocked: number };

/**
 * One row per ward and bed type. occupied = OCCUPIED + DISCHARGE_PLANNED (a planned discharge
 * still holds the bed). Reserved and cleaning beds are in `total` but neither free nor occupied.
 */
export function buildCensusRows(groups: BedGroup[]): CensusRow[] {
  const map = new Map<string, CensusRow>();
  for (const g of groups) {
    const key = `${g.wardId}\u0000${g.bedType}`;
    const r = map.get(key) ?? { wardId: g.wardId, bedType: g.bedType, total: 0, occupied: 0, free: 0, blocked: 0 };
    r.total += g.count;
    if (g.status === "OCCUPIED" || g.status === "DISCHARGE_PLANNED") r.occupied += g.count;
    else if (g.status === "FREE") r.free += g.count;
    else if (g.status === "BLOCKED") r.blocked += g.count;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => a.wardId.localeCompare(b.wardId) || a.bedType.localeCompare(b.bedType));
}

export function censusOccupancy(rows: CensusRow[]): number | null {
  const sum = rows.reduce((s, r) => ({ occupied: s.occupied + r.occupied, total: s.total + r.total, blocked: s.blocked + r.blocked }), { occupied: 0, total: 0, blocked: 0 });
  return occupancyPercent(sum);
}

/** Calendar date (YYYY-MM-DD) in the hospital's time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function lengthOfStayHours(admittedAt: Date, leftAt: Date): number {
  return Math.max(0, (leftAt.getTime() - admittedAt.getTime()) / 3_600_000);
}

export function average(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Discharges per bed over the period, 2 decimals. */
export function turnoverRate(discharges: number, beds: number): number | null {
  return beds <= 0 ? null : Math.round((discharges / beds) * 100) / 100;
}

type StatusEvent = { bedId: string; toStatus: string; at: Date };

/**
 * Minutes a bed spent between entering `from` and next entering `to` (for example CLEANING then FREE).
 * A repeated `from` restarts the clock; an unfinished `from` is ignored.
 */
export function pairDurations(events: StatusEvent[], from: string, to: string): { bedId: string; minutes: number; endedAt: Date }[] {
  const byBed = new Map<string, StatusEvent[]>();
  for (const e of events) byBed.set(e.bedId, [...(byBed.get(e.bedId) ?? []), e]);
  const out: { bedId: string; minutes: number; endedAt: Date }[] = [];
  for (const [bedId, list] of byBed) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    let start: Date | null = null;
    for (const e of list) {
      if (e.toStatus === from) start = e.at;
      else if (e.toStatus === to && start) {
        out.push({ bedId, minutes: Math.round((e.at.getTime() - start.getTime()) / 60_000), endedAt: e.at });
        start = null;
      }
    }
  }
  return out;
}

/** Patient details older than this (since they left) are anonymised. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
