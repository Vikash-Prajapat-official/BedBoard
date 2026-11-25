import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Census, retention, reports and the audit viewer against a real PostgreSQL. */
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("scheduled jobs and reports against PostgreSQL", () => {
  let db: typeof import("@/lib/db").db;
  let census: typeof import("@/lib/census");
  let retention: typeof import("@/lib/retention");
  let reports: typeof import("@/lib/reports");
  let auditQ: typeof import("@/lib/audit-query");
  const sfx = Date.now().toString(36);
  let seq = 0;
  let wardId: string;
  const day = (iso: string) => new Date(iso);

  const newBed = (status: "FREE" | "OCCUPIED" | "DISCHARGE_PLANNED" | "BLOCKED" | "CLEANING", bedType: "GENERAL" | "ICU" = "GENERAL") =>
    db.bed.create({ data: { wardId, label: `J${seq++}-${sfx}`, bedType, status } });
  const newPatient = (uhid: string) => db.patient.create({ data: { uhid, name: `Real Name ${uhid}`, age: 40, sex: "FEMALE", phone: "9876543210", abhaNumber: "12-3456" } });
  const admission = async (patientId: string, bedId: string, admittedAt: string, leftAt: string | null, extra: Record<string, unknown> = {}) =>
    db.admission.create({ data: { patientId, bedId, admittingDoctor: "Dr T", admittedAt: day(admittedAt), leftAt: leftAt ? day(leftAt) : null, outcome: leftAt ? "DISCHARGED" : null, ...extra } });

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    census = await import("@/lib/census");
    retention = await import("@/lib/retention");
    reports = await import("@/lib/reports");
    auditQ = await import("@/lib/audit-query");
    wardId = (await db.ward.create({ data: { name: `Jobs-${sfx}` } })).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  describe("midnight census", () => {
    it("counts beds per ward and type, and is safe to run twice", async () => {
      await newBed("FREE"); await newBed("FREE");
      await newBed("OCCUPIED"); await newBed("DISCHARGE_PLANNED");
      await newBed("BLOCKED"); await newBed("CLEANING");
      await newBed("OCCUPIED", "ICU");

      const now = day("2026-06-10T18:30:00Z"); // 00:00 on 11 June in Kolkata
      const first = await census.takeCensus(now, "Asia/Kolkata");
      expect(first.date).toBe("2026-06-11");
      const again = await census.takeCensus(now, "Asia/Kolkata");
      expect(again.rows).toBe(first.rows);

      const mine = await db.censusSnapshot.findMany({ where: { wardId }, orderBy: { bedType: "asc" } });
      expect(mine).toHaveLength(2); // still one row per ward and type after the second run
      expect(mine.find((r) => r.bedType === "GENERAL")).toMatchObject({ total: 6, occupied: 2, free: 2, blocked: 1 });
      expect(mine.find((r) => r.bedType === "ICU")).toMatchObject({ total: 1, occupied: 1, free: 0, blocked: 0 });
      expect(mine[0]!.date.toISOString().slice(0, 10)).toBe("2026-06-11");
    });

    it("a later snapshot of the same date replaces the earlier numbers", async () => {
      await newBed("FREE");
      await census.takeCensus(day("2026-06-10T18:30:00Z"), "Asia/Kolkata");
      const general = await db.censusSnapshot.findFirstOrThrow({ where: { wardId, bedType: "GENERAL" } });
      expect(general.total).toBe(7);
    });
  });

  describe("retention", () => {
    it("anonymises only patients whose stays ended before the cutoff and who are not admitted now", async () => {
      const now = day("2026-11-25T00:00:00Z");
      const [oldP, recentP, openP, mixedP] = [await newPatient(`OLD-${sfx}`), await newPatient(`NEW-${sfx}`), await newPatient(`OPEN-${sfx}`), await newPatient(`MIX-${sfx}`)];
      await admission(oldP.id, (await newBed("FREE")).id, "2025-01-01T00:00:00Z", "2025-01-05T00:00:00Z");
      await admission(recentP.id, (await newBed("FREE")).id, "2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z");
      await admission(openP.id, (await newBed("OCCUPIED")).id, "2025-01-01T00:00:00Z", null); // still here after 2 years
      await admission(mixedP.id, (await newBed("FREE")).id, "2025-01-01T00:00:00Z", "2025-01-05T00:00:00Z");
      await admission(mixedP.id, (await newBed("FREE")).id, "2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z"); // came back recently

      expect(await retention.anonymiseExpiredPatients(now, 365)).toBeGreaterThanOrEqual(1);

      const get = (id: string) => db.patient.findUniqueOrThrow({ where: { id } });
      const old = await get(oldP.id);
      expect(old).toMatchObject({ name: "Anonymised", phone: null, abhaNumber: null, anonymised: true, age: 40, sex: "FEMALE" });
      expect(old.uhid).toBe(`ANON-${oldP.id}`);
      expect((await get(recentP.id)).name).toContain("Real Name");
      expect((await get(openP.id)).anonymised).toBe(false);
      expect((await get(mixedP.id)).anonymised).toBe(false);

      // Running again changes nothing for them, and the run is in the audit log.
      await retention.anonymiseExpiredPatients(now, 365);
      expect((await get(openP.id)).anonymised).toBe(false);
      expect(await db.auditLog.count({ where: { action: "retention_anonymise" } })).toBeGreaterThanOrEqual(1);
    });
  });

  describe("reports", () => {
    const range = (from: string, to: string) => reports.resolveRange({ from, to }).then((r) => (r.ok ? r.range : Promise.reject(new Error(r.message))));

    it("rejects a bad or too-long range", async () => {
      expect((await reports.resolveRange({ from: "2026-13-45", to: "2026-01-01" })).ok).toBe(false);
      expect((await reports.resolveRange({ from: "2026-02-01", to: "2026-01-01" })).ok).toBe(false);
      expect((await reports.resolveRange({ from: "2024-01-01", to: "2026-01-01" })).ok).toBe(false);
      expect((await reports.resolveRange({ from: "2026-01-01", to: "2026-01-31" })).ok).toBe(true);
    });

    it("length of stay, order-to-left time and outcomes", async () => {
      const w = (await db.ward.create({ data: { name: `LOS-${sfx}` } })).id;
      const mk = async (admitted: string, left: string, order: string | null, outcome: "DISCHARGED" | "LAMA") => {
        const bed = await db.bed.create({ data: { wardId: w, label: `L${seq++}-${sfx}`, bedType: "GENERAL" } });
        const p = await newPatient(`LOS${seq++}-${sfx}`);
        return db.admission.create({ data: { patientId: p.id, bedId: bed.id, admittingDoctor: "x", admittedAt: day(admitted), leftAt: day(left), outcome, dischargeOrderAt: order ? day(order) : null } });
      };
      await mk("2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z", "2026-03-01T18:00:00Z", "DISCHARGED"); // 24 h, order 6 h before leaving
      await mk("2026-03-01T00:00:00Z", "2026-03-03T00:00:00Z", "2026-03-02T12:00:00Z", "DISCHARGED"); // 48 h, order 12 h before
      await mk("2026-03-01T00:00:00Z", "2026-03-02T12:00:00Z", null, "LAMA"); // 36 h, no order
      await mk("2026-02-01T00:00:00Z", "2026-02-20T00:00:00Z", null, "DISCHARGED"); // left outside the range

      const r = await reports.getLosReport(await range("2026-03-01", "2026-03-31"));
      const mine = r.wards.find((x) => x.wardId === w)!;
      expect(mine).toMatchObject({ discharges: 3, avgLosHours: 36, avgOrderToLeftHours: 9 });
      expect(r.outcomes.LAMA).toBeGreaterThanOrEqual(1);
    });

    it("turnover per bed and average cleaning time", async () => {
      const w = (await db.ward.create({ data: { name: `TO-${sfx}` } })).id;
      const beds = await Promise.all([1, 2, 3, 4].map((i) => db.bed.create({ data: { wardId: w, label: `T${i}-${sfx}`, bedType: "GENERAL" } })));
      for (const b of beds.slice(0, 2)) {
        const p = await newPatient(`TO${seq++}-${sfx}`);
        await db.admission.create({ data: { patientId: p.id, bedId: b.id, admittingDoctor: "x", admittedAt: day("2026-04-01T00:00:00Z"), leftAt: day("2026-04-03T00:00:00Z"), outcome: "DISCHARGED" } });
      }
      const ev = (bedId: string, toStatus: "CLEANING" | "FREE", at: string) => db.bedEvent.create({ data: { bedId, fromStatus: "OCCUPIED", toStatus, at: day(at) } });
      await ev(beds[0]!.id, "CLEANING", "2026-04-03T00:00:00Z");
      await ev(beds[0]!.id, "FREE", "2026-04-03T00:20:00Z"); // 20 min
      await ev(beds[1]!.id, "CLEANING", "2026-04-03T01:00:00Z");
      await ev(beds[1]!.id, "FREE", "2026-04-03T01:40:00Z"); // 40 min

      const r = await reports.getTurnoverReport(await range("2026-04-01", "2026-04-30"));
      expect(r.wards.find((x) => x.wardId === w)).toMatchObject({ beds: 4, discharges: 2, turnoverPerBed: 0.5, avgCleaningMinutes: 30 });
    });

    it("occupancy report uses the census snapshots", async () => {
      const w = (await db.ward.create({ data: { name: `OC-${sfx}` } })).id;
      for (const [date, occupied] of [["2026-05-01", 6], ["2026-05-02", 8]] as const) {
        await db.censusSnapshot.create({ data: { date: day(`${date}T00:00:00Z`), wardId: w, bedType: "GENERAL", total: 10, occupied, free: 10 - occupied, blocked: 0 } });
      }
      const r = await reports.getOccupancyReport(await range("2026-05-01", "2026-05-02"));
      expect(r.wards.find((x) => x.wardId === w)!.averageOccupancyPct).toBe(70);
      const hist = await reports.getCensusHistory(await range("2026-05-01", "2026-05-02"));
      expect(hist.filter((h) => h.wardId === w).map((h) => h.date)).toEqual(["2026-05-02", "2026-05-01"]);
    });
  });

  describe("audit viewer query", () => {
    it("filters by action, paginates and never shows patient data", async () => {
      const u = await db.user.create({ data: { name: `Auditor ${sfx}`, phone: `7${String(Date.now() + seq++).slice(-9)}`, passwordHash: "x", role: "ADMIN" } });
      const bed = await newBed("FREE");
      for (let i = 0; i < 3; i++) await db.auditLog.create({ data: { actorUserId: u.id, action: `viewer_test_${sfx}`, entity: "bed", entityId: bed.id } });

      const page = await auditQ.getAuditPage({ action: `viewer_test_${sfx}`, actorId: u.id });
      expect(page.total).toBe(3);
      expect(page.rows[0]).toMatchObject({ actor: { name: `Auditor ${sfx}`, role: "ADMIN" } });
      expect(page.rows[0]!.what).toContain(`Jobs-${sfx} / J`); // "Ward / Bed label", not a raw id
      expect(page.actions).toContain(`viewer_test_${sfx}`);
      expect(JSON.stringify(page)).not.toContain("Real Name");

      const none = await auditQ.getAuditPage({ action: `viewer_test_${sfx}`, from: day("2099-01-01T00:00:00Z") });
      expect(none.total).toBe(0);
    });
  });
});
