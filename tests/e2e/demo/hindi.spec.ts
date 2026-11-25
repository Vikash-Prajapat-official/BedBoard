import { expect, test, type Page } from "@playwright/test";
import { loginUI, phoneContext, type DemoRole } from "../helpers";

/**
 * "Every screen works in Hindi" (SPEC section 10): open every screen each role can reach with the
 * language set to Hindi. Each must load, say so in the html tag, show Devanagari text, leave none of the
 * English interface words behind, show no missing-translation marker, and log no browser errors.
 */
const DEVANAGARI = /[ऀ-ॿ]/;

type Screen = { role: DemoRole; path: string; english: RegExp };
// `english` = interface words that must NOT appear once translated (data like ward names is not interface).
const SCREENS: Screen[] = [
  { role: "admin", path: "/dashboard", english: /Free beds|Occupancy|Discharges today|Being cleaned/ },
  { role: "admin", path: "/admin", english: /Audit log|Add wards|Create logins/ },
  { role: "admin", path: "/admin/wards", english: /Add a ward|Specialty|Deactivate/ },
  { role: "admin", path: "/admin/beds", english: /Add beds in bulk|Name prefix/ },
  { role: "admin", path: "/admin/users", english: /Add a staff login|Starting password/ },
  { role: "admin", path: "/admin/audit", english: /Audit log|Everyone|Older/ },
  { role: "admin", path: "/admin/privacy", english: /Find a patient|Erase|Correct/ },
  { role: "admin", path: "/reports", english: /Average occupancy|Occupancy by day|Download/ },
  { role: "admin", path: "/profile", english: /4-digit PIN|Save PIN|Current password/ },
  { role: "admin", path: "/discharges", english: /Discharge tracker|Longest waiting/ },
  { role: "admin", path: "/housekeeping", english: /Beds to clean|Longest waiting/ },
  { role: "desk", path: "/find-bed", english: /Find a bed|Reserved now|Patient sex/ },
  { role: "nurse", path: "/discharges", english: /Discharge tracker|Longest waiting/ },
  { role: "housekeeping", path: "/housekeeping", english: /Beds to clean|Mark clean/ },
  { role: "viewer", path: "/dashboard", english: /Free beds|Occupancy|Full screen/ },
];

async function visit(page: Page, s: Screen, errors: string[]) {
  const res = await page.goto(s.path);
  expect(res?.status(), `${s.role} ${s.path}`).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  const text = await page.locator("main").innerText();
  expect(text, `${s.path} has Hindi text`).toMatch(DEVANAGARI);
  expect(text, `${s.path} still has English interface words`).not.toMatch(s.english);
  expect(text, `${s.path} shows a missing-translation marker`).not.toMatch(/MISSING_MESSAGE|\b[a-z]+\.[a-zA-Z]+(\.[a-zA-Z]+)?\b(?=\s|$)/);
  expect(errors, `${s.path} logged browser errors`).toEqual([]);
}

for (const role of ["admin", "desk", "nurse", "housekeeping", "viewer"] as const) {
  test(`every ${role} screen is in Hindi`, async ({ browser }) => {
    const ctx = await phoneContext(browser, "en");
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await loginUI(page, role); // the login form's labels are looked up in English
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "hi", url: page.url() }]);
      errors.length = 0;
      for (const s of SCREENS.filter((x) => x.role === role)) {
        await visit(page, s, errors);
        errors.length = 0;
      }
    } finally {
      await ctx.close();
    }
  });
}

test("the ward map and every sheet on it are in Hindi", async ({ browser }) => {
  const ctx = await phoneContext(browser, "en");
  const page = await ctx.newPage();
  try {
    await loginUI(page, "nurse");
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "hi", url: page.url() }]);
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /General Male/ }).click();
    await page.waitForURL("**/wards/**");
    await expect(page.getByRole("list", { name: "बेड" })).toBeVisible();

    // A free bed: the admit form.
    await page.getByRole("button", { name: /खाली/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "मरीज़ भर्ती करें" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "बेड आरक्षित करें" })).toBeVisible();
    await sheet.getByRole("button", { name: "मरीज़ भर्ती करें" }).click();
    for (const l of ["मरीज़ का नाम", "UHID", "उम्र", "भर्ती करने वाले डॉक्टर"]) await expect(sheet.getByLabel(l, { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "वापस" }).click();
    await sheet.getByRole("button", { name: "बेड बंद करें" }).click();
    await expect(sheet.getByLabel("कारण (बेड पर दिखेगा)")).toBeVisible();
    await expect(sheet.getByText(/Free|Reserve|Admit|Block/)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("landing, login and the language choice survive a reload", async ({ browser }) => {
  const ctx = await phoneContext(browser, "en");
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("हर खाली बेड का पता, अभी इसी वक़्त।");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "लॉग इन" })).toBeVisible();
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  } finally {
    await ctx.close();
  }
});
