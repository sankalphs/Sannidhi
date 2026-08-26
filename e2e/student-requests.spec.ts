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
