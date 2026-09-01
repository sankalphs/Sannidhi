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
 * Click a button and wait for the assertion. Retries only after a settle
 * window: the first click on a cold dev server can land before React
 * hydration attaches handlers, but re-clicking in a tight loop can also
 * re-trigger the action and flicker transient state — so give each attempt
 * time to take effect before clicking again.
 */
async function pollClick(button: Locator, assertion: Locator, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (let attempt = 0; ; attempt += 1) {
    if ((await assertion.count()) > 0 && (await assertion.first().isVisible())) {
      await expect(assertion.first()).toBeVisible();
      return;
    }
    if (Date.now() > deadline) break;
    await button.click({ timeout: 10_000 }).catch(() => {});
    await assertion
      .first()
      .waitFor({ timeout: 8_000 })
      .catch(() => {});
  }
  await expect(assertion.first()).toBeVisible({ timeout: 1_000 });
}

/**
 * Fill one or more inputs, click a button, and retry the whole interaction
 * until the assertion holds. A fill that lands before React hydration is
 * reset by the controlled component, and an unhydrated click is a no-op, so
 * each attempt re-checks and re-fills every field before clicking — keeping
 * the submitted payload deterministic.
 */
async function pollFillSave(
  fills: [input: Locator, value: string][],
  button: Locator,
  assertion: Locator,
  timeout = 60_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const [input, value] of fills) {
          if ((await input.inputValue()) !== value) {
            await input.fill(value, { timeout: 10_000 }).catch(() => {});
          }
        }
        await button.click({ timeout: 10_000 }).catch(() => {});
        return (await assertion.count()) > 0 && (await assertion.first().isVisible());
      },
      { timeout, message: "waiting for the saved value to take effect" },
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
  test.setTimeout(180_000);
  await adminPage.goto("/admin/policies");

  await expect(adminPage.getByRole("heading", { name: "Policies", exact: true })).toBeVisible();
  await expect(institutionCard(adminPage).getByText("defaults", { exact: true })).toBeVisible();

  const threshold = () => institutionCard(adminPage).getByLabel("Anomaly flag threshold");
  const saveButton = () =>
    institutionCard(adminPage).getByRole("button", { name: "Save institution policy" });

  // The whole fill→save→reload cycle retries: a fill lost to React hydration
  // or a click before handlers attach saves an empty payload, and only the
  // reloaded persisted value proves the save actually landed.
  await expect
    .poll(
      async () => {
        if ((await threshold().inputValue()) !== "5") {
          await threshold()
            .fill("5", { timeout: 10_000 })
            .catch(() => {});
        }
        await saveButton()
          .click({ timeout: 10_000 })
          .catch(() => {});
        await adminPage.reload();
        await adminPage.getByTestId("policy-card-institution").waitFor({ timeout: 30_000 });
        return (await threshold().inputValue()) === "5";
      },
      { timeout: 150_000, message: "waiting for the institution policy to persist" },
    )
    .toBe(true);

  await expect(institutionCard(adminPage).getByText(/Revision \d+/)).toBeVisible();

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
  await pollFillSave(
    [[institutionCard(adminPage).getByLabel("Anomaly flag threshold"), "99"]],
    institutionCard(adminPage).getByRole("button", { name: "Save institution policy" }),
    institutionCard(adminPage).getByText(/must be an integer between/),
  );
});

test("departments create, list, and carry policy scopes", async () => {
  test.setTimeout(180_000);
  await adminPage.goto("/admin/policies");

  const manager = adminPage.locator("section", { hasText: "Multi-department administration" });
  await pollFillSave(
    [
      [manager.getByLabel("Code"), "CSE"],
      [manager.getByLabel("Name"), "Computer Science & Engineering"],
    ],
    manager.getByRole("button", { name: "Create department" }),
    departmentCard(adminPage, "CSE"),
    90_000,
  );

  // Reload-verified save: only the persisted value proves the payload landed.
  const deptThreshold = () => departmentCard(adminPage, "CSE").getByLabel("Anomaly flag threshold");
  const deptSave = () =>
    departmentCard(adminPage, "CSE").getByRole("button", { name: "Save department policy" });
  await expect
    .poll(
      async () => {
        if ((await deptThreshold().inputValue()) !== "2") {
          await deptThreshold()
            .fill("2", { timeout: 10_000 })
            .catch(() => {});
        }
        await deptSave()
          .click({ timeout: 10_000 })
          .catch(() => {});
        await adminPage.reload();
        await adminPage.getByTestId("policy-card-department").waitFor({ timeout: 30_000 });
        return (await deptThreshold().inputValue()) === "2";
      },
      { timeout: 150_000, message: "waiting for the department policy to persist" },
    )
    .toBe(true);
  await expect(
    departmentCard(adminPage, "CSE")
      .getByTestId("policy-card-badge")
      .getByText(/Revision \d+/),
  ).toBeVisible();
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
  const strictSelect = () => card.getByLabel("Strict presence");
  const saveButton = () => card.getByRole("button", { name: "Save venue policy" });

  // Reload-verified save: only the persisted "on" selection proves the strict
  // presence payload landed (an empty sparse save would still show a badge).
  await expect
    .poll(
      async () => {
        if ((await strictSelect().inputValue()) !== "on") {
          await strictSelect()
            .selectOption("on", { timeout: 10_000 })
            .catch(() => {});
        }
        await saveButton()
          .click({ timeout: 10_000 })
          .catch(() => {});
        await adminPage.reload();
        await adminPage
          .locator('[data-testid="policy-card-venue"]')
          .first()
          .waitFor({ timeout: 30_000 });
        return (await strictSelect().inputValue()) === "on";
      },
      { timeout: 150_000, message: "waiting for the strict venue policy to persist" },
    )
    .toBe(true);
  await expect(card.getByTestId("policy-card-badge").getByText(/Revision \d+/)).toBeVisible();

  await facultyPage.goto("/faculty/sessions");
  // Fresh session so this redemption is the student's first — but pinned to
  // CS101 + LH-1, the venue whose strict policy this test just enabled.
  // (Guest-dialog defaults can shift after the roster-sync test creates
  // new courses, so the selection is explicit.)
  const resumeLinkEarly = facultyPage.getByRole("link", { name: "Resume" }).first();
  if ((await resumeLinkEarly.count()) > 0) {
    await resumeLinkEarly.click();
    await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
    const close = facultyPage.getByTestId("close-session");
    await expect(close).toBeVisible({ timeout: 30_000 });
    await close.click();
    await expect(facultyPage.getByTestId("restart-session")).toBeVisible({ timeout: 30_000 });
  }

  await facultyPage.goto("/faculty/sessions");
  await facultyPage.getByTestId("start-guest-session").click();
  const courseSelect = facultyPage.getByTestId("guest-course");
  await expect(courseSelect).toBeVisible({ timeout: 30_000 });
  const cs101 = courseSelect.locator("option", { hasText: "CS101" });
  await expect(cs101).toHaveCount(1, { timeout: 30_000 });
  await courseSelect.selectOption({ label: (await cs101.textContent()) ?? "CS101" });
  const sectionSelect = facultyPage.getByTestId("guest-section");
  await expect(sectionSelect.locator("option").first()).toHaveCount(1, { timeout: 30_000 });
  await sectionSelect.selectOption({ index: 0 });
  const venueSelect = facultyPage.getByTestId("guest-venue");
  const lh1 = venueSelect.locator("option", { hasText: "Lecture Hall LH-1" });
  await expect(lh1).toHaveCount(1, { timeout: 30_000 });
  await venueSelect.selectOption({ label: (await lh1.textContent()) ?? "Lecture Hall LH-1" });
  const create = facultyPage.getByTestId("create-guest-session");
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
  await expect(facultyPage.getByTestId("close-session")).toBeVisible({ timeout: 30_000 });

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
