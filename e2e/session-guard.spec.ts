import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/**
 * No fixture account has a password, so the credential check is stubbed to
 * succeed; a real dev session cookie lets the guarded destination render. What
 * is under test is where the sign-in form sends the user afterwards.
 */
async function signInWithStubbedPassword(page: Page, next: string): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role: "student" } });
  expect(response.ok()).toBeTruthy();
  await page.route("**/api/auth/login/password", (route) =>
    route.fulfill({ status: 200, json: { redirect: "/student" } }),
  );

  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const form = page.getByTestId("password-login-form");
  // The tab only switches once the page has hydrated.
  await expect(async () => {
    await page.getByRole("tab", { name: /USN/i }).click();
    await expect(form).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });

  await form.getByLabel("USN or email").fill("aarav.patel@sit.edu.in");
  await form.getByLabel("Password").fill("not-checked-by-the-stub");
  await form.getByRole("button", { name: "Sign in with password" }).click();
}

test("signed-out visitors to guarded pages are sent to sign-in with a return path", async ({
  page,
}) => {
  const guarded = [
    "/student/history",
    "/student/check-in?code=abc",
    "/faculty/sessions",
    "/admin/users",
    "/audit",
  ];
  for (const path of guarded) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
  }
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/student/history");
  await expect(page).toHaveURL("http://localhost:3000/login?next=%2Fstudent%2Fhistory");
});

test("password sign-in returns to the page in `next`", async ({ page }) => {
  await signInWithStubbedPassword(page, "/student/history");
  await expect(page).toHaveURL(/\/student\/history$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Attendance history" })).toBeVisible({
    timeout: 30_000,
  });
});

for (const offsite of ["//evil.com", "https://evil.com/phish", "/\\evil.com"]) {
  test(`an off-site next (${offsite}) is ignored in favour of the role home`, async ({ page }) => {
    await signInWithStubbedPassword(page, offsite);
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/student\/?$/, { timeout: 30_000 });
  });
}
