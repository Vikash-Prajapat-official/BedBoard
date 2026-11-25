import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("patient privacy tools against PostgreSQL", () => {
  let db: typeof import("@/lib/db").db;
  let tools: typeof import("@/lib/patient-admin");
  const sfx = Date.now().toString(36);
  let actorId: string;
  let wardId: string;
  let seq = 0;

  const patient = (name: string, extra: Record<string, unknown> = {}) =>
    db.patient.create({ data: { uhid: `PV-${sfx}-${seq++}`, name, age: 44, sex: "FEMALE", phone: "9876543210", abhaNumber: "91-1234", ...extra } });
  const stay = async (patientId: string, left: boolean) => {
    const bed = await db.bed.create({ data: { wardId, label: `V${seq++}-${sfx}`, bedType: "GENERAL" } });
    return db.admission.create({ data: { patientId, bedId: bed.id, admittingDoctor: "Dr P", leftAt: left ? new Date() : null, outcome: left ? "DISCHARGED" : null } });
  };

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    tools = await import("@/lib/patient-admin");
    wardId = (await db.ward.create({ data: { name: `Priv-${sfx}` } })).id;
    actorId = (await db.user.create({ data: { name: "Priv Admin", phone: `6${String(Date.now()).slice(-9)}`, passwordHash: "x", role: "ADMIN" } })).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("finds a patient by exact UHID or part of the name, case-insensitively, and needs 2+ characters", async () => {
    const p = await patient(`Zephyrine Quill ${sfx}`);
    expect((await tools.searchPatients(p.uhid.toLowerCase())).map((x) => x.id)).toContain(p.id);
    expect((await tools.searchPatients(`quill ${sfx}`)).map((x) => x.id)).toContain(p.id);
    expect(await tools.searchPatients("z")).toEqual([]);
    expect(await tools.searchPatients("")).toEqual([]);
  });

  it("reports stays and whether the patient is admitted now", async () => {
    const p = await patient(`Admitted Person ${sfx}`);
    await stay(p.id, true);
    await stay(p.id, false);
    const [row] = await tools.searchPatients(p.uhid);
    expect(row).toMatchObject({ stays: 2, admittedNow: true });
  });

  it("corrects a mistake and records it in the audit log", async () => {
    const p = await patient(`Wrong Name ${sfx}`);
    const r = await tools.correctPatient(actorId, p.id, { name: `Right Name ${sfx}`, age: 45, phone: null });
    expect(r.ok && r.data).toMatchObject({ name: `Right Name ${sfx}`, age: 45, phone: null });
    expect(await db.auditLog.count({ where: { action: "patient_correct", entityId: p.id, actorUserId: actorId } })).toBe(1);
    expect((await tools.correctPatient(actorId, "no-such-id", { age: 1 }))).toMatchObject({ ok: false, status: 404 });
  });

  it("erases a patient who has left: name, UHID, phone and ABHA go; age and sex stay", async () => {
    const p = await patient(`Erase Me ${sfx}`);
    await stay(p.id, true);
    expect(await tools.erasePatient(actorId, p.id)).toEqual({ ok: true, data: undefined });

    const after = await db.patient.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ name: "Anonymised", phone: null, abhaNumber: null, anonymised: true, age: 44, sex: "FEMALE" });
    expect(after.uhid).toBe(`ANON-${p.id}`);
    expect(await db.auditLog.count({ where: { action: "patient_erase", entityId: p.id } })).toBe(1);

    // Gone from search, cannot be erased or corrected twice.
    expect(await tools.searchPatients(`Erase Me ${sfx}`)).toEqual([]);
    expect(await tools.erasePatient(actorId, p.id)).toMatchObject({ ok: false, status: 409, code: "ALREADY_ANONYMISED" });
    expect(await tools.correctPatient(actorId, p.id, { name: "Back Again" })).toMatchObject({ ok: false, code: "ALREADY_ANONYMISED" });
  });

  it("refuses to erase a patient who is still admitted, and changes nothing", async () => {
    const p = await patient(`Still Here ${sfx}`);
    await stay(p.id, false);
    expect(await tools.erasePatient(actorId, p.id)).toMatchObject({ ok: false, status: 409, code: "PATIENT_ADMITTED" });
    expect((await db.patient.findUniqueOrThrow({ where: { id: p.id } })).name).toBe(`Still Here ${sfx}`);
  });

  it("the audit entries hold no patient data", async () => {
    const rows = await db.auditLog.findMany({ where: { action: { in: ["patient_correct", "patient_erase"] } }, select: { action: true, entity: true, entityId: true } });
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/Right Name|Erase Me|Still Here|9876543210/);
  });
});
