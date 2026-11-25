import type { NextResponse } from "next/server";
import { auth } from "./auth";
import { db } from "./db";
import { apiError } from "./api";
import { hasRole } from "./rbac";
import type { Role } from "./constants";

export type Actor = { id: string; name: string; role: Role; wardIds: string[] };

export type GuardResult = { ok: true; actor: Actor } | { ok: false; response: NextResponse };

/**
 * Every API route starts with this. It reads the session, then re-loads the user
 * from the database so a deactivated user or changed role takes effect on the
 * very next request instead of when the cookie expires.
 * Pass "any" for routes open to every logged-in user.
 */
export async function guard(allowed: readonly Role[] | "any"): Promise<GuardResult> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { ok: false, response: apiError(401, "UNAUTHENTICATED", "Please log in") };

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true, wards: { select: { wardId: true } } },
  });
  if (!user || !user.active) {
    return { ok: false, response: apiError(401, "UNAUTHENTICATED", "Please log in") };
  }

  const role = user.role as Role;
  if (allowed !== "any" && !hasRole(role, allowed)) {
    return { ok: false, response: apiError(403, "FORBIDDEN", "You do not have access to this") };
  }
  return { ok: true, actor: { id: user.id, name: user.name, role, wardIds: user.wards.map((w) => w.wardId) } };
}
