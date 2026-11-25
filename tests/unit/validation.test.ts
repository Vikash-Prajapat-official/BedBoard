import { describe, expect, it } from "vitest";
import { buildBedLabels } from "@/lib/bed-labels";
import {
  bulkBedsSchema,
  passwordSchema,
  phoneSchema,
  pinSchema,
  userCreateSchema,
} from "@/lib/validation";

describe("phone", () => {
  it.each(["9876543210", "6000000000"])("accepts %s", (p) => expect(phoneSchema.safeParse(p).success).toBe(true));
  it.each(["1234567890", "98765", "98765432101", "98765abcde", ""])("rejects %s", (p) =>
    expect(phoneSchema.safeParse(p).success).toBe(false),
  );
});

describe("password and PIN", () => {
  it("password length 8..72", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });
  it("PIN is exactly 4 digits", () => {
    expect(pinSchema.safeParse("0123").success).toBe(true);
    for (const bad of ["123", "12345", "12a4", ""]) expect(pinSchema.safeParse(bad).success).toBe(false);
  });
});

describe("bulk beds", () => {
  const base = { wardId: "w1", bedType: "GENERAL", from: 1, to: 30 };
  it("accepts 'Bed 1 to 30' and defaults the prefix", () => {
    const r = bulkBedsSchema.parse(base);
    expect(r.prefix).toBe("Bed");
  });
  it("rejects to < from, more than 200, and unknown bed types", () => {
    expect(bulkBedsSchema.safeParse({ ...base, from: 10, to: 5 }).success).toBe(false);
    expect(bulkBedsSchema.safeParse({ ...base, from: 1, to: 201 }).success).toBe(false);
    expect(bulkBedsSchema.safeParse({ ...base, from: 1, to: 200 }).success).toBe(true);
    expect(bulkBedsSchema.safeParse({ ...base, bedType: "LUXURY" }).success).toBe(false);
  });
  it("builds labels", () => {
    expect(buildBedLabels("Bed", 1, 3)).toEqual(["Bed 1", "Bed 2", "Bed 3"]);
    expect(buildBedLabels(" ICU ", 9, 10)).toEqual(["ICU 9", "ICU 10"]);
    expect(buildBedLabels("", 5, 6)).toEqual(["5", "6"]);
    expect(buildBedLabels("Bed", 7, 7)).toEqual(["Bed 7"]);
  });
});

describe("user create", () => {
  it("rejects an unknown role", () => {
    const r = userCreateSchema.safeParse({ name: "A", phone: "9876543210", password: "12345678", role: "OWNER" });
    expect(r.success).toBe(false);
  });
  it("defaults wardIds to empty", () => {
    const r = userCreateSchema.parse({ name: "A", phone: "9876543210", password: "12345678", role: "NURSE" });
    expect(r.wardIds).toEqual([]);
  });
});
