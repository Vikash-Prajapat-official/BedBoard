import Link from "next/link";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-3">
          <Link href="/dashboard" className="font-bold text-blue-700">BedBoard</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard">Dashboard</Link>
            {user.role === "DESK" && <Link href="/find-bed">Find a bed</Link>}
            {["NURSE", "DOCTOR", "DESK", "ADMIN"].includes(user.role) && <Link href="/discharges">Discharges</Link>}
            {["HOUSEKEEPING", "NURSE", "ADMIN"].includes(user.role) && <Link href="/housekeeping">Housekeeping</Link>}
            {user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
            <Link href="/profile">Profile</Link>
          </nav>
          <span className="ml-auto text-sm text-slate-600">
            {user.name} ({user.role.toLowerCase()})
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" className="min-h-9">Log out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
