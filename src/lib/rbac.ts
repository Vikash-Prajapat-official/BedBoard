import type { Role } from "./constants";

export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

/**
 * Ward-level edit rights. Admins can edit every ward; nurses only the wards
 * assigned to them (UserWard). Other roles never edit through a ward map.
 */
export function canEditWard(role: Role, assignedWardIds: readonly string[], wardId: string): boolean {
  if (role === "ADMIN") return true;
  if (role === "NURSE") return assignedWardIds.includes(wardId);
  return false;
}

/** Roles that may see patient names (Spec section 8): ward staff, desk, admins. */
export const CAN_SEE_PATIENT_NAMES: readonly Role[] = ["ADMIN", "NURSE", "DESK", "DOCTOR"];
