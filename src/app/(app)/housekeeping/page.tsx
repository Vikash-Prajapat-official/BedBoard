import { requireUser } from "@/lib/current-user";
import { getCleaningList } from "@/lib/bed-queries";
import { LiveRefresh } from "@/components/live-refresh";
import { CleaningList } from "./cleaning-list";

export const dynamic = "force-dynamic";

// Bed labels and wards only: housekeeping never sees patient data.
export default async function HousekeepingPage() {
  const user = await requireUser(["HOUSEKEEPING", "NURSE", "ADMIN"]);
  const beds = await getCleaningList();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Beds to clean ({beds.length})</h1>
        <span className="ml-auto"><LiveRefresh /></span>
      </div>
      <CleaningList beds={beds} role={user.role} wardIds={user.wardIds} />
    </div>
  );
}
