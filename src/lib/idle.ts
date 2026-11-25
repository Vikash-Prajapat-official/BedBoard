/** Idle rule for shared ward phones. Pure so the lock logic can be tested without a browser. */

export function isIdle(lastActiveMs: number | null, nowMs: number, idleMinutes: number): boolean {
  if (lastActiveMs === null) return false;
  const gap = nowMs - lastActiveMs;
  return gap >= 0 && gap >= idleMinutes * 60_000;
}

/** A timestamp stored in localStorage, or null when missing or junk. */
export function parseTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
