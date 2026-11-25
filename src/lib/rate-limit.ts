/**
 * Failure-count limiter held in process memory. Fine for the single `app`
 * container BedBoard runs as; resets on restart (see DECISIONS.md).
 */
export class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  blocked(key: string): boolean {
    const e = this.hits.get(key);
    if (!e) return false;
    if (e.resetAt <= this.now()) {
      this.hits.delete(key);
      return false;
    }
    return e.count >= this.max;
  }

  fail(key: string): void {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt <= t) this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
    else e.count++;
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}

export const loginLimiter = new FailureLimiter(10, 15 * 60_000);
export const pinLimiter = new FailureLimiter(5, 15 * 60_000);
export const setupLimiter = new FailureLimiter(20, 15 * 60_000);
