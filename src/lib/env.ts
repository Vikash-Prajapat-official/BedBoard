import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).default("dev-only-secret"),
  APP_URL: z.string().default("http://localhost:3001"),
  PORT: z.coerce.number().default(3001),
  RESERVATION_MINUTES: z.coerce.number().int().positive().default(30),
  DISCHARGE_ALERT_HOURS: z.coerce.number().positive().default(4),
  IDLE_LOGOUT_MINUTES: z.coerce.number().int().positive().default(15),
  RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  PUBLIC_PAGE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

/** Parsed lazily so `next build` does not need a database URL. */
export function getEnv(): Env {
  return schema.parse(process.env);
}
