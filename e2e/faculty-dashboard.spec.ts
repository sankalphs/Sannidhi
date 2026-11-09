import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetFixtures } from "./global-setup";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetFixtures();
});

test.afterAll(() => {
  // Leaves no session behind for later specs.
  resetFixtures();
});

async function devLoginFaculty(page: Page): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role: "faculty" } });
  expect(response.ok()).toBeTruthy();
}

/** The fixture's live CS101 slot on today's schedule. */
function cs101Row(page: Page): Locator {
  return page
    .getByRole("listitem")
    .filter({ hasText: "CS101 · Introduction to Computer Science" })
    .filter({ hasText: "Lecture Hall LH-1" })
    .first();
}

test("the dashboard lists today's classes with a start action", async ({ page }) => {
  await devLoginFaculty(page);
  await page.goto("/faculty");

  await expect(page.getByRole("heading", { name: "Faculty dashboard" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: "Today's schedule" })).toBeVisible();

  const row = cs101Row(page);
  await expect(row).toContainText("CS101 - Section A");
  await expect(
    row.getByTestId("start-slot").or(row.getByRole("link", { name: "Resume" })),
  ).toBeVisible();
  await expect(page.getByTestId("faculty-review-queue")).toBeVisible();
});

test("closing a live session takes a second, confirming click", async ({ page }) => {
  test.setTimeout(180_000);
  await devLoginFaculty(page);
  await page.goto("/faculty");

  const row = cs101Row(page);
  const start = row.getByTestId("start-slot");
  const resume = row.getByRole("link", { name: "Resume" });
  await expect(start.or(resume)).toBeVisible({ timeout: 60_000 });
  if ((await resume.count()) > 0) {
    await resume.click();
  } else {
    await start.click();
  }
  await page.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { level: 1, name: /CS101/ })).toBeVisible();

  const close = page.getByTestId("close-session");
  const confirm = page.getByTestId("confirm-close-session");
  const pause = page.getByTestId("pause-session");
  const restart = page.getByTestId("restart-session");
  if ((await restart.count()) > 0) {
    // A resumed session that was paused or closed: reopen it first.
    await restart.click();
  }
  await expect(pause).toBeVisible({ timeout: 30_000 });

  // The first click only asks for confirmation; the session stays live.
  await close.click();
  await expect(confirm).toBeVisible();
  await expect(close).toHaveCount(0);
  await expect(pause).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(close).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(pause).toBeVisible();

  await close.click();
  await confirm.click();
  await expect(restart).toBeVisible({ timeout: 30_000 });
  await expect(close).toHaveCount(0);
  await expect(pause).toHaveCount(0);

  await page.goto("/faculty");
  const closedRow = cs101Row(page);
  await expect(closedRow.getByText("Closed", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(closedRow.getByRole("link", { name: "Resume" })).toBeVisible();
});
