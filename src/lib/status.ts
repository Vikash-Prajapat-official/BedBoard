// Status identity: colour + icon + word, never colour alone (Spec: Principles).
// Display metadata only. The state machine itself lives in src/lib/beds.ts (Phase 3).
import {
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Ban,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type BedStatusKey =
  | "FREE"
  | "RESERVED"
  | "OCCUPIED"
  | "DISCHARGE_PLANNED"
  | "CLEANING"
  | "BLOCKED";

export const STATUS_META: Record<
  BedStatusKey,
  { label: string; icon: LucideIcon; className: string }
> = {
  FREE: { label: "Free", icon: CheckCircle2, className: "bg-green-100 text-green-900 border-green-600" },
  RESERVED: { label: "Reserved", icon: CalendarClock, className: "bg-blue-100 text-blue-900 border-blue-600" },
  OCCUPIED: { label: "Occupied", icon: BedDouble, className: "bg-slate-200 text-slate-900 border-slate-500" },
  DISCHARGE_PLANNED: { label: "Discharge planned", icon: ClipboardCheck, className: "bg-amber-100 text-amber-900 border-amber-600" },
  CLEANING: { label: "Cleaning", icon: Sparkles, className: "bg-purple-100 text-purple-900 border-purple-600" },
  BLOCKED: { label: "Blocked", icon: Ban, className: "bg-red-100 text-red-900 border-red-600" },
};
