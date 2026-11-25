import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("public availability against PostgreSQL", () => {
  let db: typeof import("@/lib/db").db;
  let pub: typeof import("@/lib/public-availability");
  const sfx = Date.now().toString(36);
  let seq = 0;
  const icu = (types: { type: string; free: number; total: number }[]) => types.find((t) => t.type === "ICU") ?? { type: "ICU", free: 0, total: 0 };

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    pub = await import("@/lib/public-availability");
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("counts free and in-service beds by type, ignores blocked beds and inactive wards", async () => {
    const before = icu((await pub.computePublicAvailability()).types);

    const ward = await db.ward.create({ data: { name: `Pub-${sfx}` } });
    const off = await db.ward.create({ data: { name: `PubOff-${sfx}`, active: false } });
    const bed = (wardId: string, status: "FREE" | "OCCUPIED" | "BLOCKED") => db.bed.create({ data: { wardId, label: `P${seq++}-${sfx}`, bedType: "ICU", status } });
    await bed(ward.id, "FREE"); await bed(ward.id, "FREE"); await bed(ward.id, "OCCUPIED"); await bed(ward.id, "BLOCKED");
    await bed(off.id, "FREE"); // inactive ward: not counted

    const after = await pub.computePublicAvailability();
    expect(icu(after.types).free - before.free).toBe(2);
    expect(icu(after.types).total - before.total).toBe(3); // 2 free + 1 occupied; the blocked one is out of service
    expect(after.free).toBe(after.types.reduce((n, t) => n + t.free, 0));
    expect(after.total).toBe(after.types.reduce((n, t) => n + t.total, 0));
  });

  it("exposes nothing but counts: no ward names, bed labels or patient fields", async () => {
    const a = await pub.computePublicAvailability();
    expect(Object.keys(a).sort()).toEqual(["free", "hospitalName", "timeZone", "total", "types", "updatedAt"]);
    for (const t of a.types) expect(Object.keys(t).sort()).toEqual(["free", "total", "type"]);
    const json = JSON.stringify(a);
    expect(json).not.toContain(`Pub-${sfx}`);
    expect(json).not.toMatch(/Real Name|uhid|label/i);
  });

  it("the switch comes from PUBLIC_PAGE_ENABLED only", () => {
    const old = process.env.PUBLIC_PAGE_ENABLED;
    process.env.PUBLIC_PAGE_ENABLED = "true";
    expect(pub.isPublicPageEnabled()).toBe(true);
    for (const v of ["false", "", "TRUE", "1", undefined]) {
      if (v === undefined) delete process.env.PUBLIC_PAGE_ENABLED;
      else process.env.PUBLIC_PAGE_ENABLED = v;
      expect(pub.isPublicPageEnabled()).toBe(false);
    }
    if (old === undefined) delete process.env.PUBLIC_PAGE_ENABLED;
    else process.env.PUBLIC_PAGE_ENABLED = old;
  });
});
