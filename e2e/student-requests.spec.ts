import { expect, test } from "@playwright/test";

test("students file attendance requests and see them listed with status", async ({ page }) => {
  await page.request.post("/api/dev-session", { data: { role: "student" } });
  await page.goto("/student/requests");
  await expect(page.getByRole("heading", { name: "Requests", level: 1 })).toBeVisible();

  await expect(page.getByText("File a request")).toBeVisible();

  const reason = `E2E exemption request ${Date.now()} — represented the institute at a fest.`;
  await page.getByLabel("Request type").selectOption("exemption");
  await page.getByLabel("Reason").fill(reason);

  const submit = page.getByRole("button", { name: "Submit request" });
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
  const studentPage = await studentContext.newPage();
  await studentPage.request.post("/api/dev-session", { data: { role: "student" } });
  await studentPage.goto("/student/requests");

  const reason = `E2E exemption review ${Date.now()} — represented the institute at a fest.`;
  await studentPage.getByLabel("Request type").selectOption("exemption");
  await studentPage.getByLabel("Reason").fill(reason);
  const submit = studentPage.getByRole("button", { name: "Submit request" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(studentPage.getByText("Request filed.")).toBeVisible();

  // Exemption filings carry no attendance record, so every faculty of the
  // institution sees them; approval acknowledges the request.
  const facultyContext = await browser.newContext();
  const facultyPage = await facultyContext.newPage();
  await facultyPage.request.post("/api/dev-session", { data: { role: "faculty" } });
  await facultyPage.goto("/faculty");

  const queueRow = facultyPage.locator("[data-testid='review-queue-row']", { hasText: reason });
  await expect(queueRow).toBeVisible({ timeout: 30_000 });
  await expect(queueRow.getByText("Exemption", { exact: true })).toBeVisible();
  await queueRow.getByTestId("approve-dispute").click();
  await expect(queueRow).toBeHidden({ timeout: 30_000 });

  await studentPage.reload();
  const row = studentPage.locator("[data-testid='attendance-request-row']", { hasText: reason });
  await expect(row.getByText("approved", { exact: true })).toBeVisible({ timeout: 30_000 });
});
