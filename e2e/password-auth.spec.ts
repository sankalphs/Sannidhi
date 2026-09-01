import { expect, test, type Page } from "@playwright/test";

const STAMP = Date.now().toString().slice(-7);
const USN = `1SI22CS${STAMP.slice(-4)}`;
const EMAIL = `e2e-password-${STAMP}@sannidhi.test`;
const PASSWORD = "Sunny-Campus42";

/** Seeded demo invite (convex/seed.ts) for password signup, no user row exists for it. */
const SIGNUP_INVITE_EMAIL = "password.signup.demo@sit.edu.in";
const SIGNUP_INVITE_TOKEN = "demo-password-invite-token";

async function openPasswordLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /USN/i }).click();
  await expect(page.getByTestId("password-login-form")).toBeVisible();
}

test.describe.serial("password signup and login", () => {
  test("signup without an invite token is refused", async ({ page }) => {
    await page.goto("/signup");
    const form = page.getByTestId("signup-form");
    await form.getByLabel("Institution code").fill("SIT");
    await form.getByLabel("Full name").fill("Squat Attempt");
    await form.getByLabel("USN").fill(USN);
    await form.getByLabel("Email").fill(EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirm password").fill(PASSWORD);
    await form.getByLabel("Invite token").fill("not-a-real-invite-token");
    await form.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Signups need an invite from your institution.")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("an invited email can sign up with the invite token and lands pending activation", async ({
    page,
  }) => {
    await page.goto("/signup");
    const form = page.getByTestId("signup-form");
    await form.getByLabel("Institution code").fill("SIT");
    await form.getByLabel("Full name").fill("Password Signup Demo");
    await form.getByLabel("USN").fill(`1SI22CS${STAMP.slice(-4)}M`);
    await form.getByLabel("Email").fill(SIGNUP_INVITE_EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirm password").fill(PASSWORD);
    await form.getByLabel("Invite token").fill(SIGNUP_INVITE_TOKEN);
    await form.getByRole("button", { name: "Create account" }).click();

    // No session is minted: the invite link (passkey enrollment) activates.
    await expect(page).toHaveURL(/\/signup\/pending$/);
    await expect(page.getByTestId("signup-pending-title")).toBeVisible();
  });

  test("the pending-activation account cannot sign in with its password yet", async ({ page }) => {
    await openPasswordLogin(page);
    const form = page.getByTestId("password-login-form");
    await form.getByLabel("USN or email").fill(SIGNUP_INVITE_EMAIL);
    await form.getByLabel("Password").fill(PASSWORD);
    await form.getByRole("button", { name: "Sign in with password" }).click();

    await expect(
      page.getByText("This account has not been activated yet. Open your invite link"),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/student/);
  });

  test("re-signing up an existing invited email is rejected with a friendly message", async ({
    page,
  }) => {
    await page.goto("/signup");
    const form = page.getByTestId("signup-form");
    await form.getByLabel("Institution code").fill("SIT");
    await form.getByLabel("Full name").fill("Duplicate Attempt");
    await form.getByLabel("USN").fill(`1SI22EC${STAMP.slice(-3)}9`);
    await form.getByLabel("Email").fill(SIGNUP_INVITE_EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirm password").fill(PASSWORD);
    await form.getByLabel("Invite token").fill(SIGNUP_INVITE_TOKEN);
    await form.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByText("An account with this email already exists. Try signing in instead."),
    ).toBeVisible();
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
