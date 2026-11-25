import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
export const PASSWORD = "bedboard123"; // the demo seed's password (never used on a real install)
export const PHONES = {
  admin: "9000000001",
  nurse: "9000000002",
  desk: "9000000003",
  doctor: "9000000004",
  housekeeping: "9000000005",
  viewer: "9000000006",
} as const;
export type DemoRole = keyof typeof PHONES;

const PHONE_VIEWPORT = { width: 412, height: 915 };

/** A fresh browser context shaped like a ward phone, with the language chosen up front. */
export async function phoneContext(browser: Browser, locale: "en" | "hi" = "en"): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: PHONE_VIEWPORT, hasTouch: true, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]);
  return ctx;
}

/** Log in through the real login form (English labels: call before switching to Hindi). */
export async function loginUI(page: Page, role: DemoRole, opts: { phone?: string; password?: string } = {}) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(opts.phone ?? PHONES[role]);
  await page.getByLabel("Password").fill(opts.password ?? PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

// ---------------------------------------------------------------- API side (fast set-up, not the thing under test)

export class Api {
  constructor(readonly ctx: APIRequestContext) {}
  async get<T = unknown>(path: string): Promise<T> {
    const r = await this.ctx.get(path);
    expect(r.ok(), `GET ${path} -> ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.json();
  }
  async post<T = unknown>(path: string, data: unknown, expectOk = true): Promise<{ status: number; body: T }> {
    const r = await this.ctx.post(path, { data });
    const body = (await r.json().catch(() => ({}))) as T;
    if (expectOk) expect(r.ok(), `POST ${path} -> ${r.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return { status: r.status(), body };
  }
  dispose() {
    return this.ctx.dispose();
  }
}

/** Logs in over the API the same way the form does (CSRF token, then the credentials callback). */
export async function apiLogin(role: DemoRole): Promise<Api> {
  const ctx = await request.newContext({ baseURL: BASE });
  const { csrfToken } = await (await ctx.get("/api/auth/csrf")).json();
  await ctx.post("/api/auth/callback/credentials", { form: { csrfToken, phone: PHONES[role], password: PASSWORD, json: "true" } });
  return new Api(ctx);
}

export async function wardId(admin: Api, name: string): Promise<string> {
  const { wards } = await admin.get<{ wards: { id: string; name: string }[] }>("/api/admin/wards");
  const w = wards.find((x) => x.name === name);
  expect(w, `ward "${name}" exists in the demo data`).toBeTruthy();
  return w!.id;
}

type MapBed = { id: string; label: string; version: number; status: string };
export const wardBeds = async (api: Api, id: string) => (await api.get<{ beds: MapBed[] }>(`/api/wards/${id}/beds`)).beds;

/**
 * Takes `n` free beds in a ward all the way to CLEANING (admit, discharge order, patient left) through the
 * API, so a test that needs beds waiting for the cleaners does not depend on what earlier runs left behind.
 */
export async function makeCleaningBeds(n: number, ward = "General Male"): Promise<{ id: string; label: string }[]> {
  const [admin, nurse, doctor] = await Promise.all([apiLogin("admin"), apiLogin("nurse"), apiLogin("doctor")]);
  const wid = await wardId(admin, ward);
  const free = (await wardBeds(nurse, wid)).filter((b) => b.status === "FREE");
  expect(free.length, `need ${n} free beds in ${ward}`).toBeGreaterThanOrEqual(n);
  const out: { id: string; label: string }[] = [];
  for (const bed of free.slice(0, n)) {
    const { body } = await nurse.post<{ admissionId: string }>(`/api/beds/${bed.id}/admit`, {
      version: bed.version,
      admittingDoctor: "Dr E2E",
      patient: { uhid: `E2E-${Date.now()}-${out.length}`, name: "E2E Patient", age: 41, sex: "MALE" },
    });
    await doctor.post(`/api/admissions/${body.admissionId}/discharge-step`, { step: "order" });
    await nurse.post(`/api/admissions/${body.admissionId}/discharge-step`, { step: "left" });
    out.push({ id: bed.id, label: bed.label });
  }
  await Promise.all([admin.dispose(), nurse.dispose(), doctor.dispose()]);
  return out;
}

/** Frees beds the test left in CLEANING (ignores beds someone already freed). */
export async function cleanBeds(beds: { id: string }[], ward = "General Male") {
  const [admin, hk] = await Promise.all([apiLogin("admin"), apiLogin("housekeeping")]);
  const nurse = await apiLogin("nurse");
  const current = await wardBeds(nurse, await wardId(admin, ward));
  for (const b of beds) {
    const now = current.find((x) => x.id === b.id);
    if (now?.status === "CLEANING") await hk.post(`/api/beds/${b.id}/status`, { to: "FREE", version: now.version }, false);
  }
  await Promise.all([admin.dispose(), hk.dispose(), nurse.dispose()]);
}
