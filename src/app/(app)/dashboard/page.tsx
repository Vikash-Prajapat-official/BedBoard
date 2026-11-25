import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder: the live dashboard (counts only) is built in Phase 4.
export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {user.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-700">
        <p>You are logged in as {user.role.toLowerCase()}. The live bed dashboard arrives in a later phase.</p>
        {user.role === "ADMIN" && (
          <p>
            Start by setting up your <Link className="text-blue-700 underline" href="/admin/wards">wards</Link>,{" "}
            <Link className="text-blue-700 underline" href="/admin/beds">beds</Link> and{" "}
            <Link className="text-blue-700 underline" href="/admin/users">staff</Link>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
