import { requireUser } from "@/lib/current-user";
import { getDischargeList } from "@/lib/bed-queries";
import { getEnv } from "@/lib/env";
import { LiveRefresh } from "@/components/live-refresh";
import { DischargeTracker } from "./discharge-tracker";

export const dynamic = "force-dynamic";

// Contains patient names: nurses get only their own wards, desk/doctor/admin get all.
export default async function DischargesPage() {
  const user = await requireUser(["NURSE", "DOCTOR", "DESK", "ADMIN"]);
  const rows = await getDischargeList({ role: user.role, wardIds: user.wardIds });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Discharge tracker ({rows.length})</h1>
        <span className="ml-auto"><LiveRefresh /></span>
      </div>
      <DischargeTracker rows={rows} canAct={user.role === "NURSE" || user.role === "DOCTOR"} alertHours={getEnv().DISCHARGE_ALERT_HOURS} />
    </div>
  );
}
