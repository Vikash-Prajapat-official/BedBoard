import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { getFreeBeds, getWardMap } from "@/lib/bed-queries";
import { getEnv } from "@/lib/env";
import { LiveRefresh } from "@/components/live-refresh";
import { WardMapView } from "./ward-map";

export const dynamic = "force-dynamic";

export default async function WardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["NURSE", "DESK", "DOCTOR", "ADMIN"]);
  const { id } = await params;
  const map = await getWardMap({ role: user.role, wardIds: user.wardIds }, id);
  if (!map) notFound();
  const freeBeds = user.role === "NURSE" && map.canEdit ? await getFreeBeds() : [];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <Link href="/dashboard" className="text-sm text-blue-700 underline">All wards</Link>
        <h1 className="text-2xl font-bold">{map.ward.name}</h1>
        <span className="ml-auto"><LiveRefresh wardId={map.ward.id} /></span>
      </div>
      {!map.canEdit && (
        <p className="rounded-md border border-slate-300 bg-slate-100 p-2 text-sm">
          View only. You are not assigned to this ward, so patient names are hidden and bed actions are off.
        </p>
      )}
      <WardMapView map={map} role={user.role} freeBeds={freeBeds} alertHours={getEnv().DISCHARGE_ALERT_HOURS} />
    </div>
  );
}
