import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Page-level gate only (redirects to /login). API routes are NOT covered here:
// each one calls guard() itself, so a missing check cannot hide behind this file.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
