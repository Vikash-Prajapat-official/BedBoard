/**
 * Realtime fan-out: ONE Postgres LISTEN connection per app process feeds every
 * open SSE stream (SPEC section 5). Events carry only ids and statuses, never
 * patient data, because every logged-in role (including viewers) may receive them.
 */
import { Client } from "pg";

export type BedEvent = {
  bedId: string;
  wardId: string;
  from: string;
  to: string;
  version: number;
  /** "checklist": a discharge step changed, the bed status did not. "resync": the listener reconnected, refresh everything. */
  kind?: "checklist" | "resync";
};

/** Reads a NOTIFY payload. Only known fields survive, so nothing unexpected is ever forwarded. */
export function parseBedEvent(raw: string): BedEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.bedId !== "string" || typeof o.wardId !== "string" || typeof o.from !== "string" || typeof o.to !== "string" || typeof o.version !== "number") {
    return null;
  }
  const e: BedEvent = { bedId: o.bedId, wardId: o.wardId, from: o.from, to: o.to, version: o.version };
  if (o.kind === "checklist") e.kind = "checklist";
  return e;
}

type Listener = (e: BedEvent) => void;

export function createHub(hooks: { onFirstSubscriber?: () => void; onNoSubscribers?: () => void } = {}) {
  const subs = new Set<{ fn: Listener }>();
  return {
    subscribe(fn: Listener): () => void {
      const entry = { fn };
      subs.add(entry);
      if (subs.size === 1) hooks.onFirstSubscriber?.();
      return () => {
        if (!subs.delete(entry)) return;
        if (subs.size === 0) hooks.onNoSubscribers?.();
      };
    },
    dispatch(e: BedEvent) {
      for (const s of [...subs]) {
        try {
          s.fn(e);
        } catch {
          // A closed stream must not stop delivery to the others.
        }
      }
    },
    size: () => subs.size,
  };
}

// ---- the single database listener --------------------------------------------------

let client: Client | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let wanted = false;

function scheduleReconnect() {
  if (!wanted || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, retryDelay);
  retryTimer.unref?.();
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

async function connect() {
  if (!wanted || client) return;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[sse] DATABASE_URL is not set; live updates are off");
    return;
  }
  const c = new Client({ connectionString: url });
  const lost = () => {
    if (client !== c) return;
    client = null;
    c.removeAllListeners();
    c.end().catch(() => {});
    scheduleReconnect();
  };
  c.on("notification", (m) => {
    if (m.channel !== "beds" || !m.payload) return;
    const e = parseBedEvent(m.payload);
    if (e) hub.dispatch(e);
  });
  c.on("error", lost);
  c.on("end", lost);
  try {
    await c.connect();
    await c.query("LISTEN beds");
    client = c;
    retryDelay = 1000;
    // Events sent while we were disconnected are gone: tell every screen to reload.
    hub.dispatch({ bedId: "", wardId: "", from: "", to: "", version: 0, kind: "resync" });
  } catch (err) {
    console.error("[sse] could not listen to the database", err);
    c.removeAllListeners();
    c.on("error", () => {});
    c.end().catch(() => {});
    scheduleReconnect();
  }
}

function stopListener() {
  wanted = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const c = client;
  client = null;
  if (c) {
    c.removeAllListeners();
    c.on("error", () => {});
    c.end().catch(() => {});
  }
}

const g = globalThis as unknown as { __bedHub?: ReturnType<typeof createHub> };
const hub = (g.__bedHub ??= createHub({
  onFirstSubscriber: () => {
    wanted = true;
    void connect();
  },
  onNoSubscribers: stopListener,
}));

/** Subscribe to bed events. Returns the unsubscribe function. */
export const subscribe = (fn: Listener) => hub.subscribe(fn);
