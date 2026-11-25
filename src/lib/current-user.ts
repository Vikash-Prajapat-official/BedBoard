import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { hasRole } from "./rbac";
import type { Role } from "./constants";

/** For server-rendered pages. Redirects to /login when there is no valid, active user. */
export async function requireUser(allowed: readonly Role[] | "any" = "any") {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) redirect("/login");
  const role = user.role as Role;
  if (allowed !== "any" && !hasRole(role, allowed)) redirect("/dashboard");
  return { id: user.id, name: user.name, role };
}
