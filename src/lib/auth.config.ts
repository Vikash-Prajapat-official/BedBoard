import type { NextAuthConfig } from "next-auth";

// Pages anyone may open without logging in. Everything else needs a session.
const PUBLIC_PREFIXES = ["/login", "/setup", "/health", "/public"];

/** Edge-safe half of the Auth.js config (no database or bcrypt imports). */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const p = request.nextUrl.pathname;
      if (p === "/" || PUBLIC_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = String(token.uid);
      return session;
    },
  },
} satisfies NextAuthConfig;
