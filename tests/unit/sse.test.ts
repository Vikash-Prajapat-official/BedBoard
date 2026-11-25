import { describe, expect, it, vi } from "vitest";
import { createHub, parseBedEvent, type BedEvent } from "@/lib/sse";

const event: BedEvent = { bedId: "b1", wardId: "w1", from: "FREE", to: "OCCUPIED", version: 3 };

describe("parseBedEvent (NOTIFY payload -> event)", () => {
  it("accepts a valid payload", () => {
    expect(parseBedEvent(JSON.stringify(event))).toEqual(event);
  });
  it("keeps the checklist marker", () => {
    expect(parseBedEvent(JSON.stringify({ ...event, kind: "checklist" }))?.kind).toBe("checklist");
  });
  it.each(["", "not json", "null", "[]", JSON.stringify({ bedId: "b1" }), JSON.stringify({ ...event, version: "3" })])(
    "rejects %j",
    (raw) => expect(parseBedEvent(raw)).toBeNull(),
  );
  it("drops unknown fields, so nothing unexpected (like a patient name) is ever forwarded", () => {
    const e = parseBedEvent(JSON.stringify({ ...event, patientName: "Asha Sharma" }));
    expect(e).toEqual(event);
    expect(JSON.stringify(e)).not.toContain("Asha");
  });
});

describe("createHub", () => {
  it("delivers each event to every subscriber", () => {
    const hub = createHub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(a);
    hub.subscribe(b);
    hub.dispatch(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });
  it("unsubscribe stops delivery and frees the slot", () => {
    const hub = createHub();
    const a = vi.fn();
    const off = hub.subscribe(a);
    expect(hub.size()).toBe(1);
    off();
    off(); // safe to call twice
    hub.dispatch(event);
    expect(a).not.toHaveBeenCalled();
    expect(hub.size()).toBe(0);
  });
  it("one broken subscriber cannot stop the others", () => {
    const hub = createHub();
    const ok = vi.fn();
    hub.subscribe(() => {
      throw new Error("closed stream");
    });
    hub.subscribe(ok);
    expect(() => hub.dispatch(event)).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });
  it("starts the database listener on the first subscriber and stops it after the last leaves", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const hub = createHub({ onFirstSubscriber: start, onNoSubscribers: stop });
    const off1 = hub.subscribe(() => {});
    const off2 = hub.subscribe(() => {});
    expect(start).toHaveBeenCalledOnce();
    off1();
    expect(stop).not.toHaveBeenCalled();
    off2();
    expect(stop).toHaveBeenCalledOnce();
  });
});
