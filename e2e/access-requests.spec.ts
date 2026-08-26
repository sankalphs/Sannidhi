import { expect, test } from "@playwright/test";

test("institutions can request access and admins review the queue", async ({ page }) => {
  const stamp = Date.now();
  const institution = `E2E Institute ${stamp}`;

  await page.goto("/request-access");
  await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();

  await page.getByLabel("Institution name").fill(institution);
  await page.getByLabel("Your name").fill("E2E Reviewer");
  await page.getByLabel("Work email").fill(`e2e-${stamp}@example.edu`);
  await page.getByLabel("You are a").selectOption("administrator");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText("Request received")).toBeVisible();

  await page.request.post("/api/dev-session", { data: { role: "admin" } });
  await page.goto("/admin/requests");
  const row = page.locator("[data-testid='access-request-row']", { hasText: institution });
  await expect(row).toBeVisible();
  await expect(row.getByText("new", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(row.getByText("reviewed", { exact: true })).toBeVisible();
});

test("the request-access form rejects a blank submission", async ({ page }) => {
  await page.goto("/request-access");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();
  await expect(page.getByText("Request received")).toHaveCount(0);
});

test("the login page highlights the requested persona and demo login reaches the panel", async ({
  page,
}) => {
  await page.goto("/login?as=student");
  const studentCard = page.getByTestId("persona-student");
  await expect(studentCard).toBeVisible();
  await expect(studentCard).toHaveClass(/ring-2/);

  await studentCard.click();
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"), {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
});
