import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function devLogin(page: Page, role: "student" | "faculty"): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

test("student disputes a check-in and the recording faculty corrects it without rewriting history", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const facultyContext = await browser.newContext();
  const studentContext = await browser.newContext();
  try {
    const facultyPage = await facultyContext.newPage();
    const studentPage = await studentContext.newPage();

    await devLogin(facultyPage, "faculty");
    await devLogin(studentPage, "student");

    // Faculty opens a live session; the seeded slot makes one startable now.
    await facultyPage.goto("/faculty/sessions");
    const resumeLink = facultyPage.getByRole("link", { name: "Resume" }).first();
    if ((await resumeLink.count()) > 0) {
      await resumeLink.click();
    } else {
      await facultyPage.getByTestId("start-slot").first().click();
    }
    await facultyPage.waitForURL(/\/faculty\/sessions\//, { timeout: 60_000 });

    // Student checks in with the rotating QR token.
    const qrToken = facultyPage.getByTestId("qr-token");
    await expect
      .poll(async () => ((await qrToken.textContent()) ?? "").trim(), { timeout: 60_000 })
      .not.toHaveLength(0);
    const token = (await qrToken.textContent()) ?? "";

    await studentPage.goto("/student/check-in");
    const codeInput = studentPage.getByTestId("checkin-input");
    await codeInput.waitFor({ state: "visible", timeout: 60_000 });
    await codeInput.fill(token);
    await studentPage.getByTestId("submit-code").click();
    await expect(studentPage.getByTestId("checkin-outcome")).toContainText(/checked in/i, {
      timeout: 60_000,
    });

    // Student disputes the fresh record.
    const reason = `E2E dispute ${Date.now()} — attended class, system lost the scan.`;
    await studentPage.goto("/student/requests");
    await studentPage.getByLabel("Request type").selectOption("correction");
    const picker = studentPage.getByTestId("correction-event-picker");
    await expect(picker.locator("option")).not.toHaveCount(1, { timeout: 30_000 });
    await picker.selectOption({ index: 1 });
    await studentPage.getByLabel("Reason").fill(reason);
    const submit = studentPage.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(studentPage.getByText("Request filed.")).toBeVisible();

    const row = studentPage.locator("[data-testid='attendance-request-row']", { hasText: reason });
    await expect(row.getByText("submitted", { exact: true })).toBeVisible();

    // Recording faculty reviews the routed dispute.
    await facultyPage.goto("/faculty");
    const queueRow = facultyPage
      .getByTestId("review-queue-row")
      .filter({ hasText: reason })
      .first();
    await expect(queueRow).toBeVisible({ timeout: 30_000 });
    await expect(queueRow.getByText(/was (verified|flagged|rejected)/)).toBeVisible();
    await queueRow.getByTestId("approve-dispute").click();
    await expect(queueRow).toBeHidden({ timeout: 30_000 });

    // The original stays visible to the student, now marked corrected.
    await studentPage.reload();
    await expect(row.getByText("approved", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(row.getByTestId("disputed-record-line")).toContainText(
      /was \w+ → corrected to verified/,
    );
  } finally {
    await facultyContext.close();
    await studentContext.close();
  }
});
