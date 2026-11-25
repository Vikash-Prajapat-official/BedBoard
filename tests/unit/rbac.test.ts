import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@/lib/constants";
import { CAN_SEE_PATIENT_NAMES, canEditWard, hasRole } from "@/lib/rbac";
import { FailureLimiter } from "@/lib/rate-limit";

describe("hasRole", () => {
  it.each(ROLES)("%s is allowed only when listed", (role) => {
    expect(hasRole(role, [role])).toBe(true);
    expect(hasRole(role, ROLES.filter((r) => r !== role))).toBe(false);
    expect(hasRole(role, [])).toBe(false);
  });
});

describe("canEditWard", () => {
  const cases: [Role, string[], string, boolean][] = [
    ["ADMIN", [], "w1", true],
    ["NURSE", ["w1"], "w1", true],
    ["NURSE", ["w2"], "w1", false],
    ["NURSE", [], "w1", false],
    ["DESK", ["w1"], "w1", false],
    ["DOCTOR", ["w1"], "w1", false],
    ["HOUSEKEEPING", ["w1"], "w1", false],
    ["VIEWER", ["w1"], "w1", false],
  ];
  it.each(cases)("%s with wards %j on %s -> %s", (role, wards, ward, expected) => {
    expect(canEditWard(role, wards, ward)).toBe(expected);
  });
});

describe("patient name visibility (Spec section 8)", () => {
  it("excludes housekeeping and viewers", () => {
    expect(CAN_SEE_PATIENT_NAMES).not.toContain("HOUSEKEEPING");
    expect(CAN_SEE_PATIENT_NAMES).not.toContain("VIEWER");
    expect(CAN_SEE_PATIENT_NAMES).toEqual(expect.arrayContaining(["ADMIN", "NURSE", "DESK", "DOCTOR"]));
  });
});

describe("FailureLimiter", () => {
  it("blocks after max failures and unblocks when the window passes", () => {
    let t = 0;
    const l = new FailureLimiter(3, 1000, () => t);
    l.fail("a");
    l.fail("a");
    expect(l.blocked("a")).toBe(false);
    l.fail("a");
    expect(l.blocked("a")).toBe(true);
    expect(l.blocked("b")).toBe(false);
    t = 1001;
    expect(l.blocked("a")).toBe(false);
  });

  it("clear resets the count", () => {
    const l = new FailureLimiter(1, 1000);
    l.fail("a");
    expect(l.blocked("a")).toBe(true);
    l.clear("a");
    expect(l.blocked("a")).toBe(false);
  });
});
