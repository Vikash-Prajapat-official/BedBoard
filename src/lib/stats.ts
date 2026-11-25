/** Pure maths for the dashboard and trackers (no database, no clock of its own). */

/** Occupied / usable beds. Blocked beds are out of service, so they are not counted as capacity. */
export function occupancyPercent(c: { occupied: number; total: number; blocked: number }): number | null {
  const usable = c.total - c.blocked;
  if (usable <= 0) return null;
  return Math.round((c.occupied / usable) * 100);
}

export function waitingMinutes(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
}

/** A discharge turns red once the order is DISCHARGE_ALERT_HOURS old. */
export function isOverdue(orderAt: Date | null, now: Date, alertHours: number): boolean {
  if (!orderAt) return false;
  return now.getTime() - orderAt.getTime() >= alertHours * 3_600_000;
}

type Checklist = {
  dischargeOrderAt: Date | null;
  summaryReadyAt: Date | null;
  billClearedAt: Date | null;
  medsGivenAt: Date | null;
};

/** Order, summary, bill, medicines. ("Patient left" ends the admission, so it is not a step here.) */
export function checklistProgress(a: Checklist): { done: number; total: 4 } {
  const done = [a.dischargeOrderAt, a.summaryReadyAt, a.billClearedAt, a.medsGivenAt].filter(Boolean).length;
  return { done, total: 4 };
}

function zonedParts(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** How far ahead of UTC the zone is at this instant, in ms. */
function zoneOffsetMs(d: Date, timeZone: string): number {
  const p = zonedParts(d, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant the local calendar date "YYYY-MM-DD" begins in `timeZone`. DST-safe. */
export function startOfLocalDate(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}

/** The instant the next calendar day starts in `timeZone` (exclusive end of "today"). DST-safe. */
export function endOfLocalDay(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day + 1);
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  // The offset can differ at the corrected instant when a clock change falls in between.
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}
