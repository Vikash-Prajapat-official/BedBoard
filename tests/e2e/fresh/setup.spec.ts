import { expect, test } from "@playwright/test";

/**
 * "Clean-machine install works" (SPEC section 10): against a brand-new, EMPTY database, a hospital can go from
 * nothing to a working ward with no demo data and no default password. Run with `npm run e2e:fresh`
 * after `docker compose down -v && docker compose up -d --build`.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { phone: "9811111111", password: "Hospital#Pass9", name: "Dr A. Admin" };
const NURSE = { phone: "9833333333", password: "NursePass#42", name: "Nurse N. Ward" };

test("a new install sends everyone to setup; the wizard creates the first administrator", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know every free bed, right now.");

  await page.goto("/login");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Set up BedBoard" })).toBeVisible();

  // No default account exists: the demo login does not work on a clean install.
  expect((await request.get("/api/admin/users")).status()).toBe(401);

  await page.getByLabel("Hospital name").fill("Clean Install Hospital");
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel(/Your mobile number/).fill(ADMIN.phone);
  await page.getByLabel(/^Password/).fill(ADMIN.password);
  await page.getByLabel("Confirm password").fill("not the same");
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await page.getByLabel("Confirm password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Setup is now closed for good, even for someone who knows the address.
  const again = await request.post("/api/setup", { data: { hospitalName: "X Hospital", name: "Evil", phone: "9822222222", password: "longenough1" } });
  expect(again.status()).toBe(409);
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$/);
});

test("the new administrator sets up a ward, beds and a nurse, and the nurse sees the ward", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(ADMIN.phone);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Clean Install Hospital");
  await expect(page.getByText("No wards yet.")).toBeVisible();

  // A ward
  await page.goto("/admin/wards");
  await page.getByLabel("Name", { exact: true }).fill("Medicine Ward");
  await page.getByRole("button", { name: "Add ward" }).click();
  await expect(page.getByRole("heading", { name: /Wards \(1\)/ })).toBeVisible();

  // Ten beds with one form: "Bed 1 to 10"
  await page.goto("/admin/beds");
  await expect(page.getByText("Will create 10: Bed 1, Bed 2, Bed 3 ... Bed 10")).toBeVisible();
  await page.getByRole("button", { name: "Add beds" }).click();
  await expect(page.getByText("Added 10 beds")).toBeVisible();
  // Running it again is safe: nothing is duplicated.
  await page.getByRole("button", { name: "Add beds" }).click();
  await expect(page.getByText(/Added 0 beds, skipped 10 that already existed/)).toBeVisible();

  // A nurse for that ward
  await page.goto("/admin/users");
  const addUser = page.locator("form", { has: page.getByRole("button", { name: "Add user" }) });
  await addUser.getByLabel("Name", { exact: true }).fill(NURSE.name);
  await addUser.getByLabel("Mobile number").fill(NURSE.phone);
  await addUser.getByLabel("Starting password").fill(NURSE.password);
  await addUser.getByLabel("Medicine Ward").check();
  await addUser.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("heading", { name: /Staff \(2\)/ })).toBeVisible();

  // The nurse logs in on her own phone, sees the ward with 10 free beds, and can admit.
  const ctx = await browser.newContext({ baseURL: page.url().split("/").slice(0, 3).join("/"), viewport: { width: 412, height: 915 }, hasTouch: true });
  const nurse = await ctx.newPage();
  await nurse.goto("/login");
  await nurse.getByLabel("Mobile number").fill(NURSE.phone);
  await nurse.getByLabel("Password").fill(NURSE.password);
  await nurse.getByRole("button", { name: "Log in" }).click();
  await nurse.waitForURL("**/dashboard");
  const tile = nurse.getByRole("link", { name: /Medicine Ward/ });
  await expect(tile).toContainText("10 free");
  await tile.click();
  await nurse.getByRole("button", { name: /^Bed 1\b/ }).click();
  await nurse.getByRole("button", { name: "Admit patient" }).click();
  await nurse.getByLabel("Patient name").fill("First Patient");
  await nurse.getByLabel("UHID").fill("UH-0001");
  await nurse.getByLabel("Age", { exact: true }).fill("37");
  await nurse.getByLabel("Admitting doctor").fill("Dr A. Admin");
  await nurse.getByRole("button", { name: "Admit", exact: true }).click();
  await expect(nurse.getByRole("button", { name: /^Bed 1\b/ })).toContainText("Occupied");
  await ctx.close();

  // The administrator's dashboard follows, and the audit log recorded the whole story.
  await page.goto("/dashboard");
  await expect(page.getByRole("listitem").filter({ hasText: "Medicine Ward" })).toContainText("9 free");
  await page.goto("/admin/audit");
  for (const action of ["setup_complete", "ward_create", "beds_bulk_add", "user_create", "bed_admit"]) {
    await expect(page.getByRole("cell", { name: action, exact: true }).first()).toBeVisible();
  }
});
