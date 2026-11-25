import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { IdleLock } from "@/components/idle-lock";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { OfflineSync } from "@/components/offline-sync";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { pinHash: true } });
  const t = await getTranslations("nav");
  const tr = await getTranslations("role");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-3">
          <Link href="/dashboard" className="font-bold text-blue-700">BedBoard</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/dashboard">{t("dashboard")}</Link>
            {user.role === "DESK" && <Link href="/find-bed">{t("findBed")}</Link>}
            {["NURSE", "DOCTOR", "DESK", "ADMIN"].includes(user.role) && <Link href="/discharges">{t("discharges")}</Link>}
            {["HOUSEKEEPING", "NURSE", "ADMIN"].includes(user.role) && <Link href="/housekeeping">{t("housekeeping")}</Link>}
            {user.role === "ADMIN" && <Link href="/reports">{t("reports")}</Link>}
            {user.role === "ADMIN" && <Link href="/admin">{t("admin")}</Link>}
            <Link href="/profile">{t("profile")}</Link>
          </nav>
          <span className="ml-auto text-sm text-slate-700">{t("who", { name: user.name, role: tr(user.role) })}</span>
          <LocaleSwitcher />
          <form action={logout}>
            <Button type="submit" variant="outline" className="min-h-9">{t("logout")}</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <OfflineSync />
        {children}
      </main>
      <IdleLock idleMinutes={getEnv().IDLE_LOGOUT_MINUTES} hasPin={!!me?.pinHash} logout={logout} />
    </div>
  );
}
