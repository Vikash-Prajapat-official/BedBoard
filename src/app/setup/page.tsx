import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl text-blue-700">Set up BedBoard</CardTitle>
          <p className="text-sm text-slate-600">
            Create the first administrator for your hospital. You can add wards, beds and staff next.
          </p>
        </CardHeader>
        <CardContent>
          <SetupForm />
        </CardContent>
      </Card>
    </main>
  );
}
