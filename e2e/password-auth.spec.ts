import { expect, test, type Page } from "@playwright/test";

const STAMP = Date.now().toString().slice(-7);
const USN = `1SI22CS${STAMP.slice(-4)}`;
const EMAIL = `e2e-password-${STAMP}@sannidhi.test`;
const PASSWORD = "Sunny-Campus42";

async function openPasswordLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /USN/i }).click();
  await expect(page.getByTestId("password-login-form")).toBeVisible();
}

/** First auth POST in a run pays dev-server route compilation; allow for it. */
async function expectStudentDashboard(page: Page) {
  await expect(page).toHaveURL(new RegExp("http://localhost:3000/student/?$"), {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
}

test.describe.serial("password signup and login", () => {
  test("a student can self-register with institution code, USN, email and password", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);

    const form = page.getByTestId("signup-form");
    await form.getByLabel("Institution code").fill("SIT");
    await form.getByLabel("Full name").fill("E2E Password Student");
    await form.getByLabel("USN").fill(USN);
    await form.getByLabel("Email").fill(EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirm password").fill(PASSWORD);
    await form.getByRole("button", { name: "Create account" }).click();

    await expectStudentDashboard(page);

    // Password-only account still shows required enrollment steps (device pending).
    await expect(page.getByText("Enrollment checklist")).toBeVisible();
    await expect(page.getByText("Device active")).toBeVisible();
    // ...and marks the passkey as recommended rather than blocking.
    await expect(page.getByText("recommended", { exact: true })).toBeVisible();
  });

  test("duplicate email or USN signup is rejected with a friendly message", async ({ page }) => {
    await page.goto("/signup");
    const form = page.getByTestId("signup-form");
    await form.getByLabel("Institution code").fill("SIT");
    await form.getByLabel("Full name").fill("Duplicate Attempt");
    await form.getByLabel("USN").fill(`1SI22EC${STAMP.slice(-3)}9`);
    await form.getByLabel("Email").fill(EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirm password").fill(PASSWORD);
    await form.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByText("An account with this email already exists. Try signing in instead."),
    ).toBeVisible();
  });

  test("the new account can log in with email + password after signing out", async ({ page }) => {
    await page.goto("/student"); // bounced to landing when unauthenticated
    await expect(page).toHaveURL("http://localhost:3000/");
    await page.goto("/login");
    await openPasswordLogin(page);

    const form = page.getByTestId("password-login-form");
    await form.getByLabel("USN or email").fill(EMAIL);
    await form.getByLabel("Password").fill(PASSWORD);
    await form.getByRole("button", { name: "Sign in with password" }).click();

    await expectStudentDashboard(page);
  });

  test("the same account can log in with USN + institution code", async ({ page }) => {
    await openPasswordLogin(page);

    const form = page.getByTestId("password-login-form");
    await form.getByLabel("USN or email").fill(USN.toLowerCase());
    await form.getByLabel(/Institution code/).fill("sit");
    await form.getByLabel("Password").fill(PASSWORD);
    await form.getByRole("button", { name: "Sign in with password" }).click();

    await expectStudentDashboard(page);
  });

  test("a wrong password is rejected without revealing which part failed", async ({ page }) => {
    await openPasswordLogin(page);

    const form = page.getByTestId("password-login-form");
    await form.getByLabel("USN or email").fill(EMAIL);
    await form.getByLabel("Password").fill("totally-wrong-99");
    await form.getByRole("button", { name: "Sign in with password" }).click();

    await expect(
      page.getByText("Incorrect credentials. Check your details and try again."),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/student/);
  });

  test("rapid repeated attempts — even against unknown accounts — are throttled", async ({
    page,
  }) => {
    await openPasswordLogin(page);

    const form = page.getByTestId("password-login-form");
    await form.getByLabel("USN or email").fill(`e2e-throttle-${STAMP}@sannidhi.test`);
    await form.getByLabel("Password").fill("totally-wrong-99");
    const submit = form.getByRole("button", { name: "Sign in with password" });
    const alert = form.getByRole("alert");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submit.click();
      await expect(alert).toContainText("Incorrect credentials");
    }
    await submit.click();
    await expect(alert).toContainText("Too many failed attempts");
  });
});
