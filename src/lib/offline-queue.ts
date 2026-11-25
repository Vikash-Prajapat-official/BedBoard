/**
 * Offline action queue (SPEC section 5). A ward phone that loses signal keeps the nurse's taps here
 * (IndexedDB) together with the bed `version` she saw, then replays them in order when the network
 * is back. The server refuses stale versions with 409, which is shown as "Bed changed, please refresh".
 * The queue logic is storage- and network-agnostic so it can be unit tested.
 */

export type QueuedAction = {
  id: string;
  url: string;
  method: "POST";
  body: unknown;
  label: string;
  createdAt: number;
};

export type Store = {
  get(): Promise<QueuedAction[]>;
  set(items: QueuedAction[]): Promise<void>;
};

export type SendResult =
  | { kind: "ok" }
  | { kind: "conflict"; message: string } // stale version: the bed changed, drop it and tell the nurse
  | { kind: "rejected"; message: string } // the server refused it for good (no access, bad input)
  | { kind: "retry" } // network or server trouble: keep it
  | { kind: "auth" }; // logged out: keep it until she logs in again

export function classifyResponse(status: number, message?: string): SendResult {
  if (status >= 200 && status < 300) return { kind: "ok" };
  if (status === 409) return { kind: "conflict", message: "Bed changed, please refresh" };
  if (status === 401) return { kind: "auth" };
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry" };
  return { kind: "rejected", message: message ?? `Request refused (${status})` };
}

export type ReplayResult = {
  sent: number;
  conflicts: { action: QueuedAction; message: string }[];
  rejected: { action: QueuedAction; message: string }[];
  remaining: number;
  needsLogin?: boolean;
  skipped?: boolean;
};

export function createQueue(store: Store, newId: () => string = () => crypto.randomUUID()) {
  let running = false;
  // Reads and writes of the stored list happen one at a time so a tap during a replay is never lost.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  return {
    list: () => store.get(),

    enqueue: (a: Omit<QueuedAction, "id" | "createdAt">, now: number = Date.now()) =>
      exclusive(async () => {
        const item: QueuedAction = { ...a, id: newId(), createdAt: now };
        await store.set([...(await store.get()), item]);
        return item;
      }),

    /** Sends queued actions oldest first. Stops at the first one that needs a retry or a login. */
    async replay(send: (a: QueuedAction) => Promise<SendResult>): Promise<ReplayResult> {
      if (running) return { sent: 0, conflicts: [], rejected: [], remaining: (await store.get()).length, skipped: true };
      running = true;
      const result: ReplayResult = { sent: 0, conflicts: [], rejected: [], remaining: 0 };
      try {
        const snapshot = await store.get();
        for (const action of snapshot) {
          const r = await send(action);
          if (r.kind === "retry") break;
          if (r.kind === "auth") {
            result.needsLogin = true;
            break;
          }
          if (r.kind === "ok") result.sent++;
          else if (r.kind === "conflict") result.conflicts.push({ action, message: r.message });
          else result.rejected.push({ action, message: r.message });
          await exclusive(async () => store.set((await store.get()).filter((i) => i.id !== action.id)));
        }
        result.remaining = (await store.get()).length;
        return result;
      } finally {
        running = false;
      }
    },
  };
}

const KEY = "bedboard-offline-queue";

/** Browser storage for the queue. idb-keyval is loaded on demand so server code never imports it. */
export const idbStore = (): Store => ({
  get: async () => ((await (await import("idb-keyval")).get<QueuedAction[]>(KEY)) ?? []),
  set: async (items) => void (await (await import("idb-keyval")).set(KEY, items)),
});
