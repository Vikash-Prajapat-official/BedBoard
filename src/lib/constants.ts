export const ROLES = ["ADMIN", "NURSE", "DESK", "DOCTOR", "HOUSEKEEPING", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const BED_TYPES = ["GENERAL", "OXYGEN", "VENTILATOR", "ICU", "COT", "ISOLATION"] as const;
export type BedType = (typeof BED_TYPES)[number];

export const WARD_GENDERS = ["MALE", "FEMALE", "ANY"] as const;
export type WardGender = (typeof WARD_GENDERS)[number];
