import { expect, test } from "@playwright/test";

test("home page renders the redesigned landing", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Attendance that holds up under audit." }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request institution access" })).toBeVisible();
});

test("home page presents the four role panels and the live session preview", async ({ page }) => {
  await page.goto("/");
  for (const panel of ["Student panel", "Faculty panel", "Admin panel", "Auditor panel"]) {
    await expect(page.getByText(panel, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("demo-qr-token")).toBeVisible();
  await expect(page.getByText("Rotates every 8s")).toBeVisible();
});
