import { describe, expect, it } from "vitest";
import { classifyResponse, createQueue, type QueuedAction, type SendResult, type Store } from "@/lib/offline-queue";

const memoryStore = (): Store & { items: QueuedAction[] } => {
  const s = { items: [] as QueuedAction[], get: async () => s.items.map((i) => ({ ...i })), set: async (v: QueuedAction[]) => void (s.items = v.map((i) => ({ ...i }))) };
  return s;
};
let n = 0;
const newQueue = () => {
  const store = memoryStore();
  return { store, q: createQueue(store, () => `id${++n}`) };
};
const act = (label: string, version = 1) => ({ url: `/api/beds/b1/reserve`, method: "POST" as const, body: { version }, label });

describe("classifyResponse (what to do with the server's answer)", () => {
  it.each([
    [200, "ok"], [201, "ok"],
    [409, "conflict"],
    [401, "auth"],
    [400, "rejected"], [403, "rejected"], [404, "rejected"],
    [429, "retry"], [500, "retry"], [502, "retry"], [503, "retry"],
  ] as const)("%i -> %s", (status, kind) => expect(classifyResponse(status).kind).toBe(kind));

  it("a conflict says 'Bed changed, please refresh'", () => {
    expect(classifyResponse(409)).toEqual({ kind: "conflict", message: "Bed changed, please refresh" });
  });
  it("keeps the server's own message for a rejection", () => {
    expect(classifyResponse(403, "You are not assigned to this ward")).toEqual({ kind: "rejected", message: "You are not assigned to this ward" });
  });
});

describe("offline queue", () => {
  it("enqueue keeps the order and the version the nurse saw", async () => {
    const { q } = newQueue();
    await q.enqueue(act("first", 3), 1000);
    await q.enqueue(act("second", 7), 2000);
    const list = await q.list();
    expect(list.map((a) => a.label)).toEqual(["first", "second"]);
    expect((list[1]!.body as { version: number }).version).toBe(7);
    expect(list[0]!.createdAt).toBe(1000);
  });

  it("replays in order and empties the queue when everything succeeds", async () => {
    const { q } = newQueue();
    for (const l of ["a", "b", "c"]) await q.enqueue(act(l));
    const seen: string[] = [];
    const r = await q.replay(async (a) => (seen.push(a.label), { kind: "ok" }));
    expect(seen).toEqual(["a", "b", "c"]);
    expect(r).toMatchObject({ sent: 3, remaining: 0, conflicts: [], rejected: [] });
    expect(await q.list()).toEqual([]);
  });

  it("a stale action is reported as a conflict and dropped, the rest still go", async () => {
    const { q } = newQueue();
    for (const l of ["a", "b", "c"]) await q.enqueue(act(l));
    const r = await q.replay(async (a): Promise<SendResult> => (a.label === "b" ? classifyResponse(409) : { kind: "ok" }));
    expect(r.sent).toBe(2);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]!.action.label).toBe("b");
    expect(r.conflicts[0]!.message).toBe("Bed changed, please refresh");
    expect(await q.list()).toEqual([]);
  });

  it("a rejected action (for example no access) is dropped and reported", async () => {
    const { q } = newQueue();
    await q.enqueue(act("a"));
    const r = await q.replay(async () => classifyResponse(403, "Not allowed"));
    expect(r.rejected.map((x) => x.message)).toEqual(["Not allowed"]);
    expect(r.remaining).toBe(0);
  });

  it("stops at the first retryable failure and keeps that action and everything after it, in order", async () => {
    const { q } = newQueue();
    for (const l of ["a", "b", "c"]) await q.enqueue(act(l));
    const seen: string[] = [];
    const r = await q.replay(async (a) => (seen.push(a.label), a.label === "b" ? { kind: "retry" } : { kind: "ok" }));
    expect(seen).toEqual(["a", "b"]); // c was not even tried: it may depend on b
    expect(r).toMatchObject({ sent: 1, remaining: 2 });
    expect((await q.list()).map((a) => a.label)).toEqual(["b", "c"]);
  });

  it("when logged out, keeps everything and says so", async () => {
    const { q } = newQueue();
    await q.enqueue(act("a"));
    const r = await q.replay(async () => ({ kind: "auth" }));
    expect(r).toMatchObject({ sent: 0, remaining: 1, needsLogin: true });
  });

  it("a second replay while one is running does nothing (no double sends)", async () => {
    const { q } = newQueue();
    await q.enqueue(act("a"));
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const first = q.replay(async () => (calls++, await gate, { kind: "ok" }));
    const second = await q.replay(async () => (calls++, { kind: "ok" }));
    expect(second.skipped).toBe(true);
    release();
    await first;
    expect(calls).toBe(1);
  });

  it("an action queued during a replay is kept, not lost", async () => {
    const { q } = newQueue();
    await q.enqueue(act("a"));
    const r = await q.replay(async () => {
      await q.enqueue(act("late"));
      return { kind: "ok" };
    });
    expect(r.sent).toBe(1);
    expect((await q.list()).map((a) => a.label)).toEqual(["late"]);
  });
});
