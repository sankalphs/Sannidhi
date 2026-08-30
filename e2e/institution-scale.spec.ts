import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { reseedDemoData } from "./global-setup";

test.describe.configure({ mode: "serial" });

const LH1_COORDS = { latitude: 12.97165, longitude: 77.59462, accuracy: 20 };
const FAR_COORDS = { latitude: 28.6139, longitude: 77.209, accuracy: 20 };
const HYDRATION_MS = 2000;

let adminContext: BrowserContext;
let facultyContext: BrowserContext;
let studentContext: BrowserContext;
let adminPage: Page;
let facultyPage: Page;
let studentPage: Page;
let lastUsedToken = "";

async function devLogin(page: Page, role: string) {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext();
  facultyContext = await browser.newContext();
  studentContext = await browser.newContext();

  await studentContext.grantPermissions(["geolocation"]);
  await studentContext.setGeolocation(LH1_COORDS);

  adminPage = await adminContext.newPage();
  facultyPage = await facultyContext.newPage();
  studentPage = await studentContext.newPage();

  await devLogin(adminPage, "admin");
  await devLogin(facultyPage, "faculty");
  await devLogin(studentPage, "student");
});

test.afterAll(async () => {
  await adminContext.close().catch(() => {});
  await facultyContext.close().catch(() => {});
  await studentContext.close().catch(() => {});
  reseedDemoData();
});

function institutionCard(page: Page) {
  return page.getByTestId("policy-card-institution");
}

function venueCard(page: Page, name: string) {
  return page.locator('[data-testid="policy-card-venue"]', { hasText: name });
}

function departmentCard(page: Page, code: string) {
  return page.locator('[data-testid="policy-card-department"]', { hasText: code });
}

/**
 * Click a button repeatedly until the assertion locator becomes visible.
 * The first click on a cold dev server can land before React hydration
 * attaches handlers; polling keeps the step deterministic without sleeps.
 */
async function pollClick(button: Locator, assertion: Locator, timeout = 60_000): Promise<void> {
  await expect
    .poll(
      async () => {
        await button.click({ timeout: 10_000 }).catch(() => {});
        return (await assertion.count()) > 0 && (await assertion.first().isVisible());
      },
      { timeout, message: "waiting for the effect of the clicked control" },
    )
    .toBe(true);
  await expect(assertion.first()).toBeVisible();
}

async function autoConfirm(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.confirm = () => true;
  });
}

test("institution defaults save, stamp, and clear through the policies console", async () => {
  await adminPage.goto("/admin/policies");

  await expect(adminPage.getByRole("heading", { name: "Policies", exact: true })).toBeVisible();
  await expect(institutionCard(adminPage).getByText("defaults", { exact: true })).toBeVisible();

  await institutionCard(adminPage).getByLabel("Anomaly flag threshold").fill("5");
  await pollClick(
    institutionCard(adminPage).getByRole("button", { name: "Save institution policy" }),
    institutionCard(adminPage)
      .getByTestId("policy-card-badge")
      .getByText(/Revision \d+/),
  );
  await expect(institutionCard(adminPage).getByText(/risk-engine\/v1\+policy:\d+/)).toBeVisible({
    timeout: 30_000,
  });

  await adminPage.reload();
  await expect(institutionCard(adminPage).getByLabel("Anomaly flag threshold")).toHaveValue("5");

  await autoConfirm(adminPage);
  await pollClick(
    institutionCard(adminPage).getByRole("button", { name: "Clear override" }),
    institutionCard(adminPage).getByTestId("policy-card-badge").getByText("defaults", {
      exact: true,
    }),
  );
});

test("invalid policy values are rejected inline", async () => {
  await adminPage.goto("/admin/policies");
  await institutionCard(adminPage).getByLabel("Anomaly flag threshold").fill("99");
  await pollClick(
    institutionCard(adminPage).getByRole("button", { name: "Save institution policy" }),
    institutionCard(adminPage).getByText(/must be an integer between/),
  );
});

test("departments create, list, and carry policy scopes", async () => {
  await adminPage.goto("/admin/policies");

  const manager = adminPage.locator("section", { hasText: "Multi-department administration" });
  await manager.getByLabel("Code").fill("CSE");
  await manager.getByLabel("Name").fill("Computer Science & Engineering");
  await pollClick(
    manager.getByRole("button", { name: "Create department" }),
    departmentCard(adminPage, "CSE"),
    90_000,
  );

  await departmentCard(adminPage, "CSE").getByLabel("Anomaly flag threshold").fill("2");
  await pollClick(
    departmentCard(adminPage, "CSE").getByRole("button", { name: "Save department policy" }),
    departmentCard(adminPage, "CSE")
      .getByTestId("policy-card-badge")
      .getByText(/Revision \d+/),
  );
});

test("department authority sees a read-only scoped console", async () => {
  const authorityContext = await adminPage.context().browser()?.newContext();
  expect(authorityContext).not.toBeNull();
  const authorityPage = await authorityContext!.newPage();
  await devLogin(authorityPage, "department_authority");
  await authorityPage.goto("/admin/policies");

  await expect(authorityPage.getByText("Read-only view")).toBeVisible();
  await expect(authorityPage.getByRole("button", { name: "Save institution policy" })).toHaveCount(
    0,
  );
  await expect(authorityPage.getByRole("button", { name: "Create department" })).toHaveCount(0);
  await authorityContext!.close();
});

test("courses page renders catalog with departments and the roster sync panel", async () => {
  await adminPage.goto("/admin/courses");

  await expect(
    adminPage.getByRole("heading", { name: "Courses & sections", exact: true }),
  ).toBeVisible();
  await expect(adminPage.locator("table").getByText("CS101")).toBeVisible();
  await expect(adminPage.locator("table").getByText("EC210")).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "Roster sync (SIS/LMS)", exact: true }),
  ).toBeVisible();
});

test("roster sync previews and applies the sample dataset idempotently", async () => {
  test.setTimeout(240_000);

  await adminPage.goto("/admin/courses");
  const panel = adminPage.locator("section", { hasText: "Roster sync (SIS/LMS)" });

  await pollClick(
    panel.getByRole("button", { name: "Load sample dataset" }),
    panel.getByText(/valid rows? ready/),
  );

  await pollClick(
    panel.getByRole("button", { name: "Preview sync" }),
    panel.getByRole("heading", { name: "Preview", exact: true }),
  );
  await expect(panel.getByText(/new department/)).toBeVisible();
  await expect(panel.getByText(/to invite/)).toBeVisible();

  await pollClick(
    panel.getByRole("button", { name: "Apply sync" }),
    panel.getByRole("heading", { name: "Sync applied", exact: true }),
    120_000,
  );

  await pollClick(
    panel.getByRole("button", { name: "Load sample dataset" }),
    panel.getByText(/valid rows? ready/),
  );
  await pollClick(
    panel.getByRole("button", { name: "Preview sync" }),
    panel.getByRole("heading", { name: "Preview", exact: true }),
    120_000,
  );
  await expect(panel.getByText(/new department/)).toHaveCount(0);
  await expect(panel.getByText(/already enrolled/)).toBeVisible();

  await adminPage.goto("/admin/users");
  await expect(adminPage.getByText("Kabir Rao").first()).toBeVisible({ timeout: 30_000 });
});

test("strict venue policy escalates a far-away check-in to faculty review", async () => {
  test.setTimeout(300_000);

  await adminPage.goto("/admin/policies");
  const card = venueCard(adminPage, "LH-1");
  await expect(card).toBeVisible();
  await card.getByLabel("Strict presence").check();
  await pollClick(
    card.getByRole("button", { name: "Save venue policy" }),
    card.getByTestId("policy-card-badge").getByText(/Revision \d+/),
  );

  await facultyPage.goto("/faculty/sessions");
  const startSlot = facultyPage.getByTestId("start-slot").first();
  const resumeLink = facultyPage.getByRole("link", { name: "Resume" }).first();
  await expect(startSlot.or(resumeLink).first()).toBeVisible({ timeout: 120_000 });
  if ((await resumeLink.count()) > 0) {
    await resumeLink.click();
  } else {
    await startSlot.click();
  }
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });

  const tokenEl = facultyPage.getByTestId("qr-token");
  await expect
    .poll(
      async () => {
        const value = ((await tokenEl.textContent()) ?? "").trim();
        return value.length > 0 && value !== lastUsedToken;
      },
      { timeout: 75_000, message: "waiting for a freshly rotated QR token" },
    )
    .toBe(true);
  lastUsedToken = ((await tokenEl.textContent()) ?? "").trim();

  await studentContext.setGeolocation(FAR_COORDS);
  await studentPage.goto("/student/check-in");
  const input = studentPage.getByTestId("checkin-input");
  await input.waitFor({ state: "visible", timeout: 120_000 });
  await expect(studentPage.getByTestId("geo-status")).toHaveText(/Location ready/i, {
    timeout: 30_000,
  });
  await studentPage.waitForTimeout(HYDRATION_MS);
  await studentPage.getByTestId("checkin-input").fill(lastUsedToken);
  await studentPage.getByTestId("submit-code").click();

  await expect(studentPage.getByTestId("outcome-verdict")).toBeVisible({ timeout: 60_000 });
  await expect(studentPage.getByTestId("outcome-verdict")).toHaveText(/flag/i);

  const flaggedRow = facultyPage
    .locator('[data-testid^="board-row-"]')
    .filter({ hasText: /flagged/i });
  await expect(flaggedRow.first()).toBeVisible({ timeout: 30_000 });

  await autoConfirm(adminPage);
  await adminPage.goto("/admin/policies");
  await autoConfirm(adminPage);
  await pollClick(
    venueCard(adminPage, "LH-1").getByRole("button", { name: "Clear override" }),
    venueCard(adminPage, "LH-1").getByTestId("policy-card-badge").getByText("defaults", {
      exact: true,
    }),
  );
});
