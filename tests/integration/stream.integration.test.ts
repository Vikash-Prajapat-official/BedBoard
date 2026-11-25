import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BedEvent } from "@/lib/sse";

/** Real Postgres LISTEN/NOTIFY through the same hub the /api/stream route uses. */
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("live updates over LISTEN/NOTIFY", () => {
  let svc: typeof import("@/lib/bed-service");
  let sse: typeof import("@/lib/sse");
  let db: typeof import("@/lib/db").db;
  const events: BedEvent[] = [];
  let off = () => {};
  let wardId: string;
  let desk: { id: string; role: "DESK"; wardIds: string[] };
  let nurse: { id: string; role: "NURSE"; wardIds: string[] };
  const sfx = Date.now().toString(36);
  let seq = 0;

  const newBed = () => db.bed.create({ data: { wardId, label: `S${seq++}-${sfx}`, bedType: "GENERAL" } });
  const waitFor = async (pred: () => boolean, ms: number) => {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms`);
      await new Promise((r) => setTimeout(r, 5));
    }
    return Date.now() - t0;
  };

  beforeAll(async () => {
    svc = await import("@/lib/bed-service");
    sse = await import("@/lib/sse");
    db = (await import("@/lib/db")).db;
    wardId = (await db.ward.create({ data: { name: `Live-${sfx}` } })).id;
    const mk = async (role: "DESK" | "NURSE") =>
      db.user.create({
        data: { name: role, phone: `8${String(Date.now() + seq++).slice(-9)}`, passwordHash: "x", role, wards: role === "NURSE" ? { create: [{ wardId }] } : undefined },
      });
    const d = await mk("DESK");
    const n = await mk("NURSE");
    desk = { id: d.id, role: "DESK", wardIds: [] };
    nurse = { id: n.id, role: "NURSE", wardIds: [wardId] };

    off = sse.subscribe((e) => events.push(e));
    // The listener connects after the first subscriber; it announces itself with a "resync" event.
    await waitFor(() => events.some((e) => e.kind === "resync"), 5000);
  });

  afterAll(async () => {
    off();
    await db?.$disconnect();
  });

  it("a bed change reaches a subscriber within 2 seconds (SPEC section 10)", async () => {
    const bed = await newBed();
    const t0 = Date.now();
    await svc.reserveBed(desk, bed.id, 0);
    await waitFor(() => events.some((e) => e.bedId === bed.id), 2000);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(events.find((e) => e.bedId === bed.id)).toMatchObject({ wardId, from: "FREE", to: "RESERVED", version: 1 });
  });

  it("every step of a stay is announced in order, and a checklist tick is marked as such", async () => {
    const bed = await newBed();
    const a = await svc.admitPatient(nurse, bed.id, { version: 0, admittingDoctor: "Dr T", patient: { uhid: `L${sfx}-${seq++}`, name: "Zed Secretname", age: 30, sex: "MALE" } });
    await svc.dischargeStep(nurse, a.admissionId, { step: "order", done: true });
    await svc.dischargeStep(nurse, a.admissionId, { step: "bill", done: true });
    await waitFor(() => events.filter((e) => e.bedId === bed.id).length >= 4, 2000);

    const mine = events.filter((e) => e.bedId === bed.id);
    const moves = mine.filter((e) => e.kind !== "checklist").map((e) => e.to);
    expect(moves.slice(0, 2)).toEqual(["OCCUPIED", "DISCHARGE_PLANNED"]);
    expect(mine.some((e) => e.kind === "checklist")).toBe(true);
  });

  it("events never contain patient data", async () => {
    const all = JSON.stringify(events);
    expect(all).not.toContain("Zed");
    expect(all).not.toContain("Secretname");
    for (const e of events) expect(Object.keys(e).sort()).toEqual(expect.arrayContaining(["bedId", "from", "to", "version", "wardId"]));
  });

  it("an expired-reservation release is announced too", async () => {
    const bed = await newBed();
    await svc.reserveBed(desk, bed.id, 0, { now: new Date("2026-01-01T00:00:00Z"), reservationMinutes: 1 });
    await svc.releaseExpiredReservations(new Date("2026-01-01T01:00:00Z"));
    await waitFor(() => events.some((e) => e.bedId === bed.id && e.to === "FREE"), 2000);
  });
});
