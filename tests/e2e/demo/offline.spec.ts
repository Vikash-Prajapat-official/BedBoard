import { expect, test, type Page } from "@playwright/test";
import { cleanBeds, loginUI, makeCleaningBeds, phoneContext } from "../helpers";

/**
 * SPEC section 10, offline: with the network off, actions queue and replay; a stale one shows
 * "Bed changed, please refresh". Run against the real server with the browser's network switched off.
 */
let beds: { id: string; label: string }[] = [];
test.afterEach(async () => {
  await cleanBeds(beds); // leave the ward as we found it
  beds = [];
});

// A row of the cleaning list (an <ol>). The red conflict banner is also a list that mentions the bed, so
// "any list item with this label" would count the banner too.
const row = (page: Page, label: string) => page.locator("ol > li").filter({ hasText: label });
const banner = (page: Page) => page.getByRole("status").filter({ hasText: /Offline\.|Sending/ });

test("a tap made offline is saved on the phone and sent when the connection returns", async ({ browser }) => {
  beds = await makeCleaningBeds(1);
  const label = beds[0]!.label;
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  try {
    await loginUI(page, "housekeeping");
    await page.goto("/housekeeping");
    await expect(row(page, label)).toContainText("Cleaning");

    await ctx.setOffline(true);
    await row(page, label).getByRole("button", { name: "Mark clean" }).click();

    // Nothing is lost and the screen does not break: the tap waits on the phone.
    await expect(banner(page)).toContainText("1 action is saved on this phone");
    await expect(row(page, label)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/housekeeping");

    await ctx.setOffline(false);
    // Back online: it is sent by itself, the banner clears and the bed leaves the cleaning list.
    await expect(page.getByText(/1 saved action was sent/)).toBeVisible({ timeout: 20_000 });
    await expect(row(page, label)).toHaveCount(0, { timeout: 20_000 });
    await expect(banner(page)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("several offline taps are replayed in order", async ({ browser }) => {
  beds = await makeCleaningBeds(2);
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  try {
    await loginUI(page, "housekeeping");
    await page.goto("/housekeeping");
    await ctx.setOffline(true);
    for (const b of beds) await row(page, b.label).getByRole("button", { name: "Mark clean" }).click();
    await expect(banner(page)).toContainText("2 actions are saved");

    await ctx.setOffline(false);
    for (const b of beds) await expect(row(page, b.label)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(/2 saved actions were sent/)).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("a stale offline tap is refused with 'Bed changed, please refresh'", async ({ browser }) => {
  beds = await makeCleaningBeds(1);
  const label = beds[0]!.label;
  const [ctxA, ctxB] = await Promise.all([phoneContext(browser), phoneContext(browser)]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
  try {
    await Promise.all([loginUI(a, "housekeeping"), loginUI(b, "housekeeping")]);
    await Promise.all([a.goto("/housekeeping"), b.goto("/housekeeping")]);

    // Phone A loses signal and the cleaner taps "Mark clean" on a bed.
    await ctxA.setOffline(true);
    await row(a, label).getByRole("button", { name: "Mark clean" }).click();
    await expect(banner(a)).toContainText("1 action is saved");

    // Meanwhile a colleague on phone B cleans that same bed.
    await row(b, label).getByRole("button", { name: "Mark clean" }).click();
    await expect(row(b, label)).toHaveCount(0);

    // Phone A reconnects: the old tap must NOT be applied, and she is told why.
    await ctxA.setOffline(false);
    const alert = a.getByRole("alert").filter({ hasText: "Bed changed, please refresh" });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText(label);
    await expect(row(a, label)).toHaveCount(0, { timeout: 20_000 }); // refreshed: the bed is free now
    await alert.getByRole("button", { name: "OK" }).click();
    await expect(alert).toHaveCount(0);
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});

test("the offline banner and the conflict message are in Hindi when the language is Hindi", async ({ browser }) => {
  beds = await makeCleaningBeds(1);
  const label = beds[0]!.label;
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  try {
    await loginUI(page, "housekeeping");
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "hi", url: page.url() }]);
    await page.goto("/housekeeping");
    await ctx.setOffline(true);
    await row(page, label).getByRole("button", { name: "साफ़ हो गया" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन।" })).toContainText("इस फ़ोन में सहेजी गई हैं");
    await ctx.setOffline(false);
    await expect(row(page, label)).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await ctx.close();
  }
});
