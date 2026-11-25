import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PinForm } from "./pin-form";

export default async function ProfilePage() {
  const user = await requireUser();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { phone: true, pinHash: true } });
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
        <p className="text-sm text-slate-600">
          {user.role.toLowerCase()} · {me?.phone}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <h3 className="font-medium">4-digit PIN</h3>
        <p className="text-sm text-slate-600">
          {me?.pinHash ? "A PIN is set." : "No PIN set."} On shared ward phones the PIN lets you resume
          quickly after the screen locks.
        </p>
        <PinForm />
      </CardContent>
    </Card>
  );
}
