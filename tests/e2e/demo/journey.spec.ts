import { expect, test, type Page } from "@playwright/test";
import { loginUI, phoneContext } from "../helpers";

/**
 * SPEC section 10, end to end: desk reserves, nurse admits, doctor orders discharge, steps ticked,
 * patient left, housekeeping cleans, and the dashboard shows FREE within 2 seconds.
 * Six people, six phones, one real server. Nothing is faked.
 */
const WARD = "General Male";

/** The "free" number on the General Male tile of the dashboard. */
const freeCount = (dash: Page) => dash.getByRole("listitem").filter({ hasText: WARD }).locator("strong").first();

test("a bed goes from reserved to admitted to discharged to cleaned, and the dashboard follows within 2 seconds", async ({ browser }) => {
  const viewerCtx = await phoneContext(browser);
  const deskCtx = await phoneContext(browser);
  const nurseCtx = await phoneContext(browser);
  const doctorCtx = await phoneContext(browser);
  const hkCtx = await phoneContext(browser);
  const dash = await viewerCtx.newPage();
  const desk = await deskCtx.newPage();
  const nurse = await nurseCtx.newPage();
  const doctor = await doctorCtx.newPage();
  const hk = await hkCtx.newPage();

  try {
    // The casualty TV: a viewer login on the dashboard, left open and never touched again.
    await loginUI(dash, "viewer");
    await expect(dash.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
    const before = Number(await freeCount(dash).innerText());
    expect(before).toBeGreaterThan(0);

    // 1. Desk finds a free bed in the ward and reserves it.
    await loginUI(desk, "desk");
    await desk.goto("/find-bed");
    await desk.getByLabel("Ward").selectOption({ label: WARD });
    await desk.getByRole("button", { name: "Search" }).click();
    const firstFree = desk.getByRole("region", { name: "Free beds" }).getByRole("listitem").first();
    const label = (await firstFree.locator("strong").first().innerText()).trim();
    await firstFree.getByRole("button", { name: "Reserve" }).click();
    await expect(desk.getByText(/reserved for \d+ minutes/)).toBeVisible();
    // The TV drops by one without anyone reloading it.
    await expect(freeCount(dash)).toHaveText(String(before - 1), { timeout: 2000 });

    // 2. The nurse sees it reserved on the ward map and admits the patient: two taps plus the form.
    await loginUI(nurse, "nurse");
    await nurse.getByRole("link", { name: new RegExp(WARD) }).click();
    await nurse.waitForURL("**/wards/**");
    const wardUrl = nurse.url();
    const tile = (p: Page) => p.getByRole("button", { name: new RegExp(`^${label}\\b`) });
    await expect(tile(nurse)).toContainText("Reserved");
    await tile(nurse).click();
    await nurse.getByRole("button", { name: "Admit patient" }).click();
    await nurse.getByLabel("Patient name").fill("E2E Journey");
    await nurse.getByLabel("UHID").fill(`E2E-J-${Date.now()}`);
    await nurse.getByLabel("Age", { exact: true }).fill("52");
    await nurse.getByLabel("Admitting doctor").fill("Dr Rao");
    await nurse.getByRole("button", { name: "Admit", exact: true }).click();
    await expect(tile(nurse)).toContainText("Occupied");
    await expect(tile(nurse)).toContainText("E2E Journey");

    // 3. The doctor gives the discharge order from the same ward map.
    await loginUI(doctor, "doctor");
    await doctor.goto(wardUrl);
    await tile(doctor).click();
    const checklist = doctor.getByRole("region", { name: "Discharge checklist" });
    await checklist.getByRole("listitem").filter({ hasText: "Discharge order given" }).getByRole("button", { name: "Mark done" }).click();
    await expect(checklist.getByRole("listitem").filter({ hasText: "Discharge order given" }).getByRole("button", { name: "Undo" })).toBeVisible();

    // 4. The nurse ticks summary, bill and medicines on the discharge tracker, then confirms the patient left.
    await nurse.goto("/discharges");
    const row = nurse.getByRole("listitem").filter({ hasText: label }).filter({ hasText: "E2E Journey" });
    await expect(row).toBeVisible();
    for (const step of ["Summary", "Bill", "Medicines"]) {
      await row.getByRole("button", { name: new RegExp(`^.?\\s*${step}`) }).click();
    }
    await expect(row).toContainText("4 of 4 steps");
    await row.getByRole("button", { name: "Patient left", exact: true }).click();
    await row.getByRole("button", { name: "Confirm patient left" }).click();
    await expect(row).toHaveCount(0);

    // The bed is now waiting for the cleaners: still not free on the TV.
    await expect(freeCount(dash)).toHaveText(String(before - 1));

    // 5. Housekeeping marks it clean. This is the moment the clock starts.
    await loginUI(hk, "housekeeping");
    await hk.goto("/housekeeping");
    const cleanRow = hk.getByRole("listitem").filter({ hasText: label });
    await expect(cleanRow).toContainText("Cleaning");
    await cleanRow.getByRole("button", { name: "Mark clean" }).click();

    // 6. The dashboard shows the bed FREE again within 2 seconds, with no reload.
    await expect(freeCount(dash)).toHaveText(String(before), { timeout: 2000 });
  } finally {
    await Promise.all([viewerCtx, deskCtx, nurseCtx, doctorCtx, hkCtx].map((c) => c.close()));
  }
});
