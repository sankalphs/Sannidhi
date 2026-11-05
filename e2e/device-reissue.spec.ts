import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetFixtures } from "./global-setup";

const STUDENT_EMAIL = "diya.sharma@sit.edu.in";
const DEVICE_LABEL = `E2E reissue ${Date.now().toString().slice(-6)}`;

test.afterAll(() => {
  // Drops the device this spec registers.
  resetFixtures();
});

function verifyPanel(page: Page): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Verify device possession" }) });
}

/** The one-time code the verify panel shows right after it is issued. */
async function shownCode(page: Page): Promise<string> {
  const message = verifyPanel(page).getByText(/one-time verification code is/);
  await expect(message).toContainText(/\d{6}/, { timeout: 30_000 });
  const code = /code is\s*(\d{6})/.exec((await message.textContent()) ?? "")?.[1] ?? "";
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

test("a student who dismissed the possession code can issue a new one and verify with it", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const response = await page.request.post("/api/dev-session", {
    data: { role: "student", email: STUDENT_EMAIL },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/student/devices");

  const labelInput = page.getByLabel("Device label");
  const register = page.getByRole("button", { name: "Register", exact: true });
  // Controlled input: retry the fill until hydration has wired it up.
  await expect(async () => {
    await labelInput.fill(DEVICE_LABEL);
    await expect(register).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await register.click();

  const firstCode = await shownCode(page);

  // Dismiss the code without verifying: it is never shown again.
  await verifyPanel(page).getByRole("button", { name: "Later" }).click();
  await expect(verifyPanel(page)).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: DEVICE_LABEL });
  await expect(row.getByText("New", { exact: true })).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Enter code" }).click();

  await expect(verifyPanel(page)).toContainText("Lost it, or did it expire? Issue a new code.");
  await verifyPanel(page).getByRole("button", { name: "Issue new code" }).click();
  const secondCode = await shownCode(page);

  const codeInput = verifyPanel(page).getByLabel("Six-digit verification code");
  const verify = verifyPanel(page).getByRole("button", { name: "Verify", exact: true });

  // Reissuing retires the earlier code (vanishingly unlikely to repeat).
  if (secondCode !== firstCode) {
    await codeInput.fill(firstCode);
    await verify.click();
    await expect(
      page.getByText("Incorrect verification code. Check the code and try again."),
    ).toBeVisible({ timeout: 30_000 });
  }

  await codeInput.fill(secondCode);
  await verify.click();
  await expect(verifyPanel(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(row.getByText("Enrolled", { exact: true })).toBeVisible({ timeout: 30_000 });
});
