import { expect, test } from "@playwright/test";

async function devLogin(page: import("@playwright/test").Page, role: string) {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.status()).toBe(200);
}

test.describe("enrollment completion gate", () => {
  test("fully enrolled demo students reach attendance surfaces", async ({ page }) => {
    await devLogin(page, "student");

    await page.goto("/student/history");
    await expect(page.getByRole("heading", { name: "Attendance history" })).toBeVisible();
    await expect(page.getByText("Enrollment incomplete")).toHaveCount(0);
    await expect(page.getByText("Attendance features stay locked")).toHaveCount(0);

    await page.goto("/student/requests");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    await expect(page.getByText("Enrollment incomplete")).toHaveCount(0);
  });

  test("unlocked students no longer see the enrollment checklist on their dashboard", async ({
    page,
  }) => {
    await devLogin(page, "student");

    await page.goto("/student");
    await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
    await expect(page.getByText("Enrollment checklist")).toHaveCount(0);
    await expect(page.getByText("Attendance locked")).toHaveCount(0);
  });

  test("the devices surface offers biometric consent with disclosure", async ({ page }) => {
    await devLogin(page, "student");

    await page.goto("/student/devices");
    await expect(page.getByText("Biometric verification (optional)")).toBeVisible();
    await expect(
      page.getByText("Never stored: raw images or photographs of your face.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("No consent recorded")).toBeVisible();
  });

  test("admin surfaces remain unaffected by the enrollment gate", async ({ page }) => {
    await devLogin(page, "admin");

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  });
});
