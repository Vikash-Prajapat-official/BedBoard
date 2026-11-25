import { NextResponse } from "next/server";
import type { z } from "zod";

/** Error shape from SPEC section 7: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: apiError(400, "BAD_JSON", "Request body must be JSON") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return {
      ok: false,
      response: apiError(400, "VALIDATION", `${where}${first?.message ?? "Invalid input"}`),
    };
  }
  return { ok: true, data: parsed.data };
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
}
