import { expect, test, type Page } from "@playwright/test";

/** Picks the newest session in the exemption / on-duty class picker. */
async function selectFirstSession(page: Page) {
  const picker = page.getByTestId("request-session-picker");
  await expect(picker.locator("option").nth(1)).toBeAttached();
  await picker.selectOption({ index: 1 });
}

test("students file attendance requests and see them listed with status", async ({ page }) => {
  await page.request.post("/api/dev-session", { data: { role: "student" } });
  await page.goto("/student/requests");
  await expect(page.getByRole("heading", { name: "Requests", level: 1 })).toBeVisible();

  await expect(page.getByText("File a request")).toBeVisible();

  const reason = `E2E exemption request ${Date.now()} — represented the institute at a fest.`;
  await page.getByLabel("Request type").selectOption("exemption");
  await page.getByLabel("Reason").fill(reason);

  const submit = page.getByRole("button", { name: "Submit request" });
  await expect(submit).toBeDisabled();
  await selectFirstSession(page);
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("Request filed.")).toBeVisible();

  const row = page.locator("[data-testid='attendance-request-row']", { hasText: reason });
  await expect(row).toBeVisible();
  await expect(row.getByText("Exemption", { exact: true })).toBeVisible();
  await expect(row.getByText("submitted", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.locator("[data-testid='attendance-request-row']", { hasText: reason }),
  ).toBeVisible();
});

test("the request form rejects a too-short reason", async ({ page }) => {
  await page.request.post("/api/dev-session", { data: { role: "student" } });
  await page.goto("/student/requests");

  await page.getByLabel("Reason").fill("too short");
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
});

test("an exemption request reaches the faculty queue and approval is recorded", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const studentContext = await browser.newContext();
  const facultyContext = await browser.newContext();
  try {
    const studentPage = await studentContext.newPage();
    await studentPage.request.post("/api/dev-session", { data: { role: "student" } });
    await studentPage.goto("/student/requests");

    const reason = `E2E exemption review ${Date.now()} — represented the institute at a fest.`;
    await studentPage.getByLabel("Request type").selectOption("exemption");
    await studentPage.getByLabel("Reason").fill(reason);
    // Every fixture session is run by the fixture faculty, so any pick routes to them.
    await selectFirstSession(studentPage);
    const submit = studentPage.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(studentPage.getByText("Request filed.")).toBeVisible();

    // Exemption filings carry no attendance record; the faculty who ran the
    // session sees them and approval acknowledges the request.
    const facultyPage = await facultyContext.newPage();
    await facultyPage.request.post("/api/dev-session", { data: { role: "faculty" } });
    await facultyPage.goto("/faculty");

    const queueRow = facultyPage.locator("[data-testid='review-queue-row']", { hasText: reason });
    await expect(queueRow).toBeVisible({ timeout: 30_000 });
    await expect(queueRow.getByText("Exemption", { exact: true })).toBeVisible();
    await queueRow.getByTestId("approve-dispute").click();
    await queueRow.getByTestId("confirm-approve-dispute").click();
    await expect(queueRow).toBeHidden({ timeout: 30_000 });

    await studentPage.reload();
    const row = studentPage.locator("[data-testid='attendance-request-row']", { hasText: reason });
    await expect(row.getByText("approved", { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await facultyContext.close();
    await studentContext.close();
  }
});
