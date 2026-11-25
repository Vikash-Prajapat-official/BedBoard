/// <reference lib="webworker" />
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * What the service worker does, and what it deliberately does not:
 *  - Precaches the built JavaScript, CSS and fonts, so the app starts fast and installs as an app.
 *  - Serves /offline when a page is requested with no network.
 *  - Does NOT cache pages or /api answers: ward maps show patient names and everything must be live,
 *    and a cached page would still be readable on a shared phone after logout.
 * Taps made while offline are kept by the offline queue (IndexedDB), not by this worker.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  // A page is always fetched live (NetworkOnly: nothing is stored). Having a route for it is what lets the
  // offline fallback below take over when the network is down.
  runtimeCaching: [{ matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() }],
  fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] },
});

serwist.addEventListeners();
