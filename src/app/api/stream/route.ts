import { guard } from "@/lib/guard";
import { subscribe } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: one event per bed change, fed by Postgres LISTEN/NOTIFY.
 * Open to every logged-in role because events hold only ids and statuses, no patient data.
 */
export async function GET(req: Request) {
  const g = await guard("any");
  if (!g.ok) return g.response;

  const enc = new TextEncoder();
  let off = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(ping);
    off();
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          stop(); // the client went away
        }
      };
      send("retry: 3000\n\nevent: hello\ndata: {}\n\n");
      off = subscribe((e) => send(`event: bed\ndata: ${JSON.stringify(e)}\n\n`));
      // Keeps proxies and phones from closing an idle connection.
      ping = setInterval(() => send(": ping\n\n"), 25_000);
      req.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // tell nginx/Caddy not to buffer
    },
  });
}
