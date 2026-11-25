import { randomUUID } from "node:crypto";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Send <title> and the meta description in the first chunk for every visitor (not streamed in later),
  // so search engines and tools like Lighthouse always see them.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Content-Security-Policy (production only: the dev server needs eval). Everything must come from this
      // same server; nothing may frame the app; forms may only post back to it. Next.js and Auth.js write small
      // inline scripts and styles, so those two are allowed inline, but no outside script or connection is.
      ...(process.env.NODE_ENV === "production"
        ? [{
            source: "/:path*",
            headers: [{
              key: "Content-Security-Policy",
              value: [
                "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'", "manifest-src 'self'",
                "worker-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
              ].join("; "),
            }],
          }]
        : []),
      // The service worker must never be served from a stale cache, or an update could not reach phones.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

// PWA: installable, app shell and static files precached. Pages and API answers are NOT cached
// (see src/sw.ts), because they hold patient names and must be live.
const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  register: false, // registered by <ServiceWorkerRegister />, which skips browsers that do not allow it
  reloadOnOnline: false, // the offline queue replays itself; a forced reload would interrupt a nurse mid-tap
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
});

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(withSerwist(nextConfig));
