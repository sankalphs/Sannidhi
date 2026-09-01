import { expect, test } from "@playwright/test";

test("unauthenticated users are bounced from guarded surfaces to the landing page", async ({
  page,
}) => {
  await page.goto("/student");
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("a student dev session reaches the student shell but is redirected away from admin", async ({
  page,
}) => {
  const response = await page.request.post("/api/dev-session", {
    data: { role: "student" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ ok: true });
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === "sannidhi_session")).toBeTruthy();

  await page.goto("/student");
  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Attendance history", exact: true })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"));
});

test("a faculty session hitting audit is redirected to faculty home", async ({ page }) => {
  const response = await page.request.post("/api/dev-session", {
    data: { role: "faculty" },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto("/audit");
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/faculty/?$"));
  await expect(page.getByRole("heading", { name: "Faculty dashboard" })).toBeVisible();
});
