import { z } from "zod";
import { BED_TYPES, ROLES, WARD_GENDERS } from "./constants";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");

// bcrypt only uses the first 72 bytes, so longer passwords are refused.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

const name = z.string().trim().min(1, "Required").max(80);

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(72),
});

export const setupSchema = z.object({
  hospitalName: z.string().trim().min(2).max(120),
  name,
  phone: phoneSchema,
  password: passwordSchema,
});

export const wardCreateSchema = z.object({
  name,
  gender: z.enum(WARD_GENDERS).default("ANY"),
  floor: z.number().int().min(-5).max(100).default(0),
  specialty: z.string().trim().max(80).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const wardPatchSchema = wardCreateSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export const MAX_BULK_BEDS = 200;

export const bulkBedsSchema = z
  .object({
    wardId: z.string().min(1),
    bedType: z.enum(BED_TYPES),
    prefix: z.string().trim().max(20).default("Bed"),
    from: z.number().int().min(1).max(9999),
    to: z.number().int().min(1).max(9999),
  })
  .refine((v) => v.to >= v.from, { message: "'To' must be at least 'From'", path: ["to"] })
  .refine((v) => v.to - v.from + 1 <= MAX_BULK_BEDS, {
    message: `At most ${MAX_BULK_BEDS} beds at a time`,
    path: ["to"],
  });

export const bedPatchSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  bedType: z.enum(BED_TYPES).optional(),
});

export const userCreateSchema = z.object({
  name,
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  wardIds: z.array(z.string().min(1)).max(100).default([]),
});

export const userPatchSchema = z.object({
  name: name.optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
  wardIds: z.array(z.string().min(1)).max(100).optional(),
  resetPin: z.literal(true).optional(),
});

// ---- Bed actions (Phase 3). `version` is the bed version the client last saw. ----
const version = z.number().int().min(0);

export const admitSchema = z.object({
  version,
  admittingDoctor: z.string().trim().min(1).max(80),
  patient: z.object({
    uhid: z.string().trim().min(1).max(30),
    name,
    age: z.number().int().min(0).max(130),
    sex: z.enum(["MALE", "FEMALE", "OTHER"]),
    phone: phoneSchema.optional(),
  }),
});

export const reserveSchema = z.object({ version });

// Only the moves that are not "admit" / "discharge" / "reserve", which have their own endpoints.
export const statusSchema = z
  .object({
    to: z.enum(["FREE", "BLOCKED", "OCCUPIED"]),
    version,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.to !== "BLOCKED" || !!v.reason, { message: "A reason is required to block a bed", path: ["reason"] });

export const transferSchema = z.object({
  toBedId: z.string().min(1),
  version,
  toVersion: version.optional(),
});

export const DISCHARGE_STEPS = ["plan", "order", "summary", "bill", "meds", "left"] as const;
export const OUTCOMES = ["DISCHARGED", "LAMA", "REFERRED", "DIED"] as const;

export const dischargeStepSchema = z.object({
  step: z.enum(DISCHARGE_STEPS),
  done: z.boolean().default(true),
  version: version.optional(),
  outcome: z.enum(OUTCOMES).optional(),
  plannedFor: z.string().datetime().optional(),
});

export const pinSetSchema = z.object({ password: z.string().min(1).max(72), pin: pinSchema });
export const pinVerifySchema = z.object({ pin: pinSchema });
