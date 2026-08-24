import { expect, test } from "@playwright/test";

async function devLogin(page: import("@playwright/test").Page, role: string) {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.status()).toBe(200);
}

test.describe("enrollment completion gate", () => {
  test("dev-impersonated students cannot reach attendance surfaces", async ({ page }) => {
    await devLogin(page, "student");

    await page.goto("/student/history");
    await expect(page.getByRole("heading", { name: "Attendance history" })).toBeVisible();
    await expect(page.getByText("Enrollment incomplete")).toBeVisible();
    await expect(page.getByText("Account active")).toBeVisible();
    await expect(
      page.getByText("Calendar and subject-wise attendance views arrive with sessions in Phase 2."),
    ).toHaveCount(0);

    await page.goto("/student/requests");
    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
    await expect(page.getByText("Enrollment incomplete")).toBeVisible();
    await expect(
      page.getByText("Leave, on-duty, and correction requests arrive in Phase 2."),
    ).toHaveCount(0);
  });

  test("locked students see the enrollment checklist on their dashboard", async ({ page }) => {
    await devLogin(page, "student");

    await page.goto("/student");
    await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
    await expect(page.getByText("Enrollment checklist")).toBeVisible();
    await expect(page.getByText("Attendance locked")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to devices" })).toBeVisible();
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
