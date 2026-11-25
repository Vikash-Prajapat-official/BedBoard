import { apiError, clientIp } from "./api";
import { BedError, type ServiceActor } from "./bed-service";
import type { Actor } from "./guard";

/** Turns a BedError into the standard { error: { code, message } } response. Other errors are real bugs: rethrow. */
export function bedErrorResponse(e: unknown) {
  if (e instanceof BedError) return apiError(e.status, e.code, e.message);
  throw e;
}

export const toServiceActor = (a: Actor): ServiceActor => ({ id: a.id, role: a.role, wardIds: a.wardIds });

export const requestOpts = (req: Request) => ({ ip: clientIp(req) });
