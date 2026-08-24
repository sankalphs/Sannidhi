import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function devLogin(page: Page, role: "student" | "faculty"): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

test("faculty publishes a rotating QR token and the student checks in with it", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const facultyContext = await browser.newContext();
  const studentContext = await browser.newContext();
  try {
    const facultyPage = await facultyContext.newPage();
    const studentPage = await studentContext.newPage();

    await devLogin(facultyPage, "faculty");
    await devLogin(studentPage, "student");

    await facultyPage.goto("/faculty/sessions");
    const startSlot = facultyPage.getByTestId("start-slot").first();
    const resumeLink = facultyPage.getByRole("link", { name: "Resume" }).first();

    if ((await resumeLink.count()) > 0) {
      await resumeLink.click();
    } else {
      await startSlot.waitFor({ state: "visible", timeout: 60_000 });
      await startSlot.click();
    }
    await facultyPage.waitForURL(/\/faculty\/sessions\//, { timeout: 60_000 });

    const qrToken = facultyPage.getByTestId("qr-token");
    await expect
      .poll(async () => ((await qrToken.textContent()) ?? "").trim(), { timeout: 60_000 })
      .not.toHaveLength(0);
    const token = (await qrToken.textContent()) ?? "";
    expect(token.trim().length).toBeGreaterThan(0);

    await studentPage.goto("/student/check-in");
    const codeInput = studentPage.getByTestId("checkin-input");
    await codeInput.waitFor({ state: "visible", timeout: 60_000 });
    await codeInput.fill(token);
    await studentPage.getByTestId("submit-code").click();

    const outcome = studentPage.getByTestId("checkin-outcome");
    await expect(outcome).toContainText(/checked in/i, { timeout: 60_000 });

    const tryAgain = studentPage.getByTestId("try-again");
    if ((await tryAgain.count()) > 0 && (await tryAgain.isVisible().catch(() => false))) {
      await tryAgain.click();
      await codeInput.waitFor({ state: "visible", timeout: 30_000 });
    } else {
      await studentPage.goto("/student/check-in");
      await codeInput.waitFor({ state: "visible", timeout: 60_000 });
    }
    await codeInput.fill(token);
    await studentPage.getByTestId("submit-code").click();
    await expect(studentPage.getByTestId("checkin-outcome")).toContainText(
      /already used|expired/i,
      { timeout: 60_000 },
    );

    await facultyPage.reload();
    await expect(facultyPage.locator('[data-testid^="board-row"]').first()).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await facultyContext.close();
    await studentContext.close();
  }
});
