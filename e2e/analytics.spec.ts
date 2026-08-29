import { expect, test, type Page } from "@playwright/test";

async function devLogin(page: Page, role: string) {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.status()).toBe(200);
}

test("admin sees cohort analytics with trajectories and trends", async ({ page }) => {
  await devLogin(page, "admin");

  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

  await expect(page.getByTestId("stat-students")).toContainText("3");
  await expect(page.getByTestId("stat-sections")).toContainText("4");
  await expect(page.getByTestId("stat-sessions")).toContainText("48");
  await expect(page.getByTestId("stat-open-alerts")).toContainText(/^(0|3|4)$/);

  const trajectories = page.getByTestId("trajectory-row");
  await expect(trajectories).toHaveCount(2);

  const diyaRow = trajectories.filter({ hasText: "Diya Sharma" });
  await expect(diyaRow).toContainText("54.2%");
  await expect(diyaRow).toContainText("At risk");
  await expect(diyaRow).toContainText("Declining");
  await expect(diyaRow).toContainText("48");

  const aaravRow = trajectories.filter({ hasText: "Aarav Patel" });
  await expect(aaravRow).toContainText("87.5%");
  await expect(aaravRow).toContainText("On track");
  await expect(aaravRow).toContainText("Steady");
  await expect(aaravRow).toContainText("48");

  const sectionTrends = page.getByTestId("section-trend-row");
  await expect(sectionTrends).toHaveCount(4);

  const cs101 = sectionTrends.filter({ hasText: "CS101" });
  await expect(cs101).toContainText("12");
  await expect(cs101).toContainText("2");
  await expect(cs101).toContainText("79.2%");

  const ec210 = sectionTrends.filter({ hasText: "EC210" });
  await expect(ec210).toContainText("12");
  await expect(ec210).toContainText("2");
  await expect(ec210).toContainText("62.5%");

  const proxyCards = page.getByTestId("proxy-attempt-card");
  await expect(proxyCards).toHaveCount(2);

  const diyaProxy = proxyCards.filter({ hasText: "Diya Sharma" });
  await expect(diyaProxy).toContainText("2");
  await expect(diyaProxy).toContainText("flagged check-ins");
  await expect(diyaProxy).toContainText("Face mismatch");
  await expect(diyaProxy).toContainText("Face spoof suspected");

  const aaravProxy = proxyCards.filter({ hasText: "Aarav Patel" });
  await expect(aaravProxy).toContainText("1");
  await expect(aaravProxy).toContainText("flagged check-in");
  await expect(aaravProxy).toContainText("Distrusted device");

  const replayed = page.getByTestId("anomaly-type-row").filter({ hasText: "challenge_replayed" });
  await expect(replayed).toContainText("3");
});

test("early-warning scan routes alerts into the human-review inbox", async ({ page }) => {
  await devLogin(page, "admin");

  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Review inbox" })).toBeVisible();

  const inboxSummary = page.getByTestId("inbox-summary");
  await expect(inboxSummary).toContainText("0 open");
  await expect(page.getByText("No alerts", { exact: true })).toBeVisible();
  await expect(page.getByTestId("run-scan")).toBeVisible();

  await page.getByTestId("run-scan").click();
  await expect(page.getByTestId("scan-result")).toContainText(/Scan created \d+ alerts/, {
    timeout: 30_000,
  });

  await expect(inboxSummary).toContainText("4 open · 0 acknowledged · 0 dismissed", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("review-alert-row")).toHaveCount(4);

  const lowAttendance = page.locator('[data-kind="low_attendance"]');
  await expect(lowAttendance).toContainText("Diya Sharma");
  await expect(lowAttendance).toContainText("Attendance below threshold");
  await expect(lowAttendance).toContainText("9 consecutive absences");
  await expect(lowAttendance).toContainText("Attendance at 54.2%");

  const verificationAnomaly = page.locator('[data-kind="verification_anomaly"]');
  await expect(verificationAnomaly).toContainText("5 ledger anomalies");
});

test("acknowledged and dismissed alerts stay in the inbox history", async ({ page }) => {
  await devLogin(page, "admin");

  await page.goto("/admin/review");

  const inboxSummary = page.getByTestId("inbox-summary");
  await expect(inboxSummary).toBeVisible();
  if (!(await inboxSummary.textContent())?.includes("4 open")) {
    await page.getByTestId("run-scan").click();
    await expect(page.getByTestId("scan-result")).toContainText(/Scan created \d+ alerts/, {
      timeout: 30_000,
    });
    await expect(inboxSummary).toContainText("4 open", { timeout: 30_000 });
  }

  const acknowledgeButton = page
    .locator('[data-kind="verification_anomaly"]')
    .getByTestId("acknowledge-alert");
  await acknowledgeButton.click();
  await expect(inboxSummary).toContainText("3 open · 1 acknowledged · 0 dismissed", {
    timeout: 30_000,
  });
  await expect(page.locator('[data-kind="verification_anomaly"]')).toContainText("acknowledged", {
    timeout: 30_000,
  });

  const aaravProxyRow = page
    .locator('[data-kind="proxy_attempt"]')
    .filter({ hasText: "Aarav Patel" })
    .first();
  await aaravProxyRow.getByTestId("dismiss-alert").click();
  await expect(inboxSummary).toContainText("2 open · 1 acknowledged · 1 dismissed", {
    timeout: 30_000,
  });

  await page.getByTestId("run-scan").click();
  await expect(page.getByTestId("scan-result")).toContainText(/Scan created \d+ alerts/, {
    timeout: 30_000,
  });
  await expect(inboxSummary).toContainText("4 open · 1 acknowledged · 1 dismissed", {
    timeout: 30_000,
  });
});

test("department authority reviews alerts without the scan trigger", async ({ page }) => {
  await devLogin(page, "department_authority");

  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Review inbox" })).toBeVisible();

  await expect(page.getByTestId("run-scan")).toHaveCount(0);
  await expect(page.getByTestId("inbox-summary")).toBeVisible();
  await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
});

test("reports render rolling windows with downloadable exports", async ({ page }) => {
  await devLogin(page, "admin");

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  const reportSummary = page.getByTestId("report-summary");
  await expect(reportSummary).toContainText("Past 7 days");
  await expect(reportSummary).toContainText("4 verified");
  await expect(page.getByTestId("report-row")).toHaveCount(4);

  const csvDownload = page.waitForEvent("download");
  await page.getByTestId("export-csv").click();
  expect((await csvDownload).suggestedFilename()).toBe("sannidhi-attendance-report-weekly.csv");

  const pdfDownload = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  expect((await pdfDownload).suggestedFilename()).toBe("sannidhi-attendance-report-weekly.pdf");

  await page.getByTestId("period-monthly").click();
  await expect(page).toHaveURL(/period=monthly/);
  await expect(reportSummary).toContainText("Past 30 days");
  // The 30-day window slides against fixed backfill dates, so the oldest
  // term week drifts in and out near the boundary — assert bounds, not exact counts.
  await expect(reportSummary).toContainText(/(19|2\d) verified/);
  await expect(reportSummary).toContainText(/[34] flagged/);
  await expect(reportSummary).toContainText("0 rejected");
  await expect(reportSummary).toContainText("0 pending");
  await expect(page.getByTestId("report-row")).not.toHaveCount(0);
  const monthlyRowCount = await page.getByTestId("report-row").count();
  expect(monthlyRowCount).toBeGreaterThanOrEqual(23);
  expect(monthlyRowCount).toBeLessThanOrEqual(27);
});

test("students cannot reach the analytics surfaces", async ({ page }) => {
  await devLogin(page, "student");

  await page.goto("/admin/analytics");
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"));

  await page.goto("/admin/reports");
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"));

  await page.goto("/admin/review");
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"));
});
