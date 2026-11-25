import { describe, expect, it } from "vitest";
import { isIdle, parseTimestamp } from "@/lib/idle";

describe("isIdle (shared ward phone lock)", () => {
  const min = 60_000;
  it("idle once the gap reaches IDLE_LOGOUT_MINUTES, not before", () => {
    expect(isIdle(0, 14 * min + 59_000, 15)).toBe(false);
    expect(isIdle(0, 15 * min, 15)).toBe(true);
    expect(isIdle(0, 60 * min, 15)).toBe(true);
  });
  it("never idle when there is no record of activity yet", () => {
    expect(isIdle(null, 10 ** 12, 15)).toBe(false);
  });
  it("a clock that went backwards is not idle", () => {
    expect(isIdle(10 * min, 5 * min, 15)).toBe(false);
  });
});

describe("parseTimestamp (value from localStorage)", () => {
  it("reads a number, rejects junk", () => {
    expect(parseTimestamp("1700000000000")).toBe(1700000000000);
    for (const bad of [null, "", "abc", "NaN", "-5", "0"]) expect(parseTimestamp(bad)).toBeNull();
  });
});
