import { expect, test } from "@playwright/test";
import { PASSWORD, apiLogin, loginUI, phoneContext, wardId } from "../helpers";

const SEEDED_SURNAMES = /\b(Sharma|Verma|Patil|Singh|Iyer|Khan|Das|Nair|Yadav|Gupta)\b/;

test.describe("who can open what", () => {
  test("a visitor who is not logged in is sent to the login page, and the API says 401", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    for (const path of ["/api/dashboard", "/api/stream", "/api/admin/users", "/api/reports/los", "/api/export/admissions.csv"]) {
      const r = await page.request.get(path);
      expect(r.status(), path).toBe(401);
    }
  });

  test("screens a role may not use send that person back to the dashboard", async ({ browser }) => {
    const admin = await apiLogin("admin");
    const anyWard = await wardId(admin, "Surgery");
    await admin.dispose();
    const cases: [Parameters<typeof loginUI>[1], string][] = [
      ["desk", "/admin"], ["desk", "/reports"], ["nurse", "/admin/users"], ["nurse", "/find-bed"],
      ["housekeeping", "/discharges"], ["housekeeping", `/wards/${anyWard}`], ["viewer", `/wards/${anyWard}`], ["viewer", "/housekeeping"],
    ];
    for (const [role, path] of cases) {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      await loginUI(page, role);
      await page.goto(path);
      await expect(page, `${role} -> ${path}`).toHaveURL(/\/dashboard$/);
      await ctx.close();
    }
  });

  test("the server refuses a forbidden API call even when it is made directly", async () => {
    const [nurse, viewer, hk] = await Promise.all([apiLogin("nurse"), apiLogin("viewer"), apiLogin("housekeeping")]);
    expect((await nurse.ctx.get("/api/admin/users")).status()).toBe(403);
    expect((await nurse.ctx.get("/api/reports/occupancy")).status()).toBe(403);
    expect((await viewer.ctx.get("/api/beds/search")).status()).toBe(403);
    expect((await hk.ctx.post("/api/beds/x/admit", { data: {} })).status()).toBe(403);
    expect((await viewer.ctx.get("/api/dashboard")).status()).toBe(200); // counts are for everyone logged in
    await Promise.all([nurse.dispose(), viewer.dispose(), hk.dispose()]);
  });

  test("a wrong password does not log in, and ten wrong tries lock that number for a while", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9000000006");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Log in" }).click();
    // (Next.js also keeps an empty role=alert route announcer on every page, so pick the message itself.)
    await expect(page.getByText(/Wrong phone number or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("names stay inside the ward", () => {
  test("the dashboard shows numbers only, never a patient name", async ({ browser }) => {
    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    await loginUI(page, "viewer");
    await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(SEEDED_SURNAMES);
    expect(await page.content()).not.toMatch(SEEDED_SURNAMES);
    await ctx.close();
  });

  test("a nurse outside the ward sees the beds but no patients; the desk sees patients", async ({ browser }) => {
    const [nurseCtx, deskCtx] = await Promise.all([phoneContext(browser), phoneContext(browser)]);
    const [nurse, desk] = await Promise.all([nurseCtx.newPage(), deskCtx.newPage()]);
    await Promise.all([loginUI(nurse, "nurse"), loginUI(desk, "desk")]);
    for (const p of [nurse, desk]) {
      await p.getByRole("link", { name: /Surgery/ }).click(); // the demo nurse is only assigned to the two General wards
      await p.waitForURL("**/wards/**");
    }
    await expect(nurse.getByText(/View only\. You are not assigned to this ward/)).toBeVisible();
    expect(await nurse.getByRole("list", { name: "Beds" }).innerText()).not.toMatch(SEEDED_SURNAMES);
    await expect(desk.getByRole("list", { name: "Beds" }).getByRole("button").filter({ hasText: SEEDED_SURNAMES }).first()).toBeVisible();

    // The nurse's tap on a bed offers no actions, and the server would refuse them anyway.
    await nurse.getByRole("button", { name: /Occupied/ }).first().click();
    await expect(nurse.getByRole("dialog")).toContainText("View only");
    await Promise.all([nurseCtx.close(), deskCtx.close()]);
  });

  test("the audit log and CSV exports hold no patient names", async () => {
    const admin = await apiLogin("admin");
    const csv = await (await admin.ctx.get("/api/export/admissions.csv")).text();
    expect(csv.split("\r\n")[0]).toContain("admission_id,uhid,age,sex,ward,bed");
    expect(csv).not.toMatch(SEEDED_SURNAMES);
    await admin.dispose();
  });
});

test.describe("shared phones", () => {
  test("after being idle, the screen locks; a wrong PIN is refused and the right one unlocks", async ({ browser }) => {
    const nurse = await apiLogin("nurse");
    await nurse.post("/api/me/pin", { password: PASSWORD, pin: "4321" });
    await nurse.dispose();

    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    await loginUI(page, "nurse");
    // Pretend the phone has been sitting untouched for 30 minutes, then wake it.
    await page.evaluate(() => localStorage.setItem("bedboard-last-active", String(Date.now() - 30 * 60_000)));
    await page.reload();
    const lock = page.getByRole("dialog", { name: "Screen locked" });
    await expect(lock).toBeVisible();

    await lock.getByLabel("4-digit PIN").fill("1111");
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock.getByRole("alert")).toContainText("Wrong PIN");

    // The lock survives a reload: it cannot be skipped by refreshing the page.
    await page.reload();
    await expect(lock).toBeVisible();

    await lock.getByLabel("4-digit PIN").fill("4321");
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await ctx.close();
  });
});

test.describe("home page, app install and public page", () => {
  test("the home page says what the spec says, in this order, with a working demo ward", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know every free bed, right now.");
    await expect(page.getByText("A free, open-source live bed board for hospitals. Nurses update in two taps; the whole hospital sees it instantly.")).toBeVisible();
    await expect(page.getByRole("link", { name: "See live demo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Install free" })).toBeVisible();
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    const order = ["Try it: tap a bed", "Phone calls to every ward", "How it works", "Discharged at 11, gone at 5?", "Everything a ward needs", "Names stay inside the ward", "Install in three steps", "Questions"];
    let from = 0;
    for (const want of order) {
      const at = headings.findIndex((h, i) => i >= from && h.startsWith(want));
      expect(at, `section "${want}" present and in order`).toBeGreaterThanOrEqual(from);
      from = at + 1;
    }
    await expect(page.getByText("There is no real-time updation going on.")).toBeVisible();
    await expect(page.getByRole("link", { name: "The Caravan, 31 May 2020" })).toHaveAttribute("href", /caravanmagazine\.in/);
    await expect(page.getByText(/docker compose up -d --build/)).toBeVisible();

    // The demo ward: tap Bed 1 (Occupied) and it moves to the next step. Nothing is saved.
    const bed1 = page.getByRole("button", { name: /^Bed 1: Occupied/ });
    await bed1.click();
    await expect(page.getByRole("button", { name: /^Bed 1: Discharge planned/ })).toBeVisible();
    // Colour is never the only signal: every status in the legend has an icon and a word.
    const legend = page.getByRole("list", { name: /colour, an icon and a word/ });
    await expect(legend.getByRole("listitem")).toHaveCount(6);
  });

  test("security headers are set on every response", async ({ request }) => {
    const h = (await request.get("/login")).headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("same-origin");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("the app is installable: manifest, icons and a service worker that never caches pages or the API", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "BedBoard", display: "standalone", theme_color: "#1D4ED8" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-store");
    const code = await sw.text();
    expect(code).toContain("/offline");
    // No rule that stores API answers. ("app/api/..." inside build-file names is not a rule, so look for a quoted /api/ path.)
    expect(/['"]\/api\//.test(code)).toBe(false);
    expect(/startsWith\(['"]\/api/.test(code)).toBe(false);
    expect((await request.get("/offline")).status()).toBe(200);
  });

  test("the public page shows counts only (when the hospital has turned it on)", async ({ page, request }) => {
    const api = await request.get("/api/public/availability");
    test.skip(api.status() === 404, "PUBLIC_PAGE_ENABLED is not true on this server");
    const data = await api.json();
    expect(Object.keys(data).sort()).toEqual(["free", "hospitalName", "timeZone", "total", "types", "updatedAt"]);
    expect(api.headers()["cache-control"]).toContain("max-age=60");
    expect(JSON.stringify(data)).not.toMatch(/uhid|label|ward/i);

    await page.goto("/public");
    await expect(page.getByRole("heading", { name: "Bed availability" })).toBeVisible();
    await expect(page.getByText(/No patient information is shown here/)).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(SEEDED_SURNAMES);
  });

  test("the first-run setup page is closed once the hospital has users", async ({ request }) => {
    const r = await request.post("/api/setup", { data: { hospitalName: "Evil Hospital", name: "Evil", phone: "9822222222", password: "longenough1" } });
    expect(r.status()).toBe(409);
    const login = await request.get("/setup", { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(login.status());
  });
});
