import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { resetFixtures } from "./global-setup";

test.describe.configure({ mode: "serial" });

const LH1_COORDS = { latitude: 12.97165, longitude: 77.59462, accuracy: 20 };

let facultyContext: BrowserContext;
let facultyPage: Page;

async function devLogin(page: Page, role: "student" | "faculty"): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

/** The path the class QR encodes (src/lib/client/check-in-link.ts), relative to the origin. */
function checkInPath(token: string): string {
  return `/student/check-in?code=${encodeURIComponent(token)}`;
}

/** Starts (or resumes) the fixture's live CS101 slot and waits for its QR token. */
async function openCs101Session(): Promise<string> {
  await facultyPage.goto("/faculty/sessions");
  const row = facultyPage
    .getByRole("listitem")
    .filter({ hasText: "CS101 · Introduction to Computer Science" })
    .first();
  const start = row.getByTestId("start-slot");
  const resume = row.getByRole("link", { name: "Resume" });
  await expect(start.or(resume)).toBeVisible({ timeout: 120_000 });
  if ((await resume.count()) > 0) {
    await resume.click();
  } else {
    await start.click();
  }
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });

  const tokenEl = facultyPage.getByTestId("qr-token");
  await expect
    .poll(async () => ((await tokenEl.textContent()) ?? "").trim(), { timeout: 60_000 })
    .not.toBe("");
  return ((await tokenEl.textContent()) ?? "").trim();
}

test.beforeAll(async ({ browser }) => {
  resetFixtures();
  facultyContext = await browser.newContext();
  facultyPage = await facultyContext.newPage();
  await devLogin(facultyPage, "faculty");
});

test.afterAll(async () => {
  await facultyContext.close().catch(() => {});
  // Leaves no live session behind for later specs.
  resetFixtures();
});

test("a signed-out visitor opening the class QR link is sent to sign-in with a return path", async ({
  page,
}) => {
  const token = "e2e.sample-token_123";
  await page.goto(checkInPath(token));

  await expect(page).toHaveURL(/\/login\?next=/, { timeout: 30_000 });
  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe(checkInPath(token));
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a signed-in student opening the class QR link is checked in without typing", async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const token = await openCs101Session();

  const studentContext = await browser.newContext();
  try {
    await studentContext.grantPermissions(["geolocation"]);
    await studentContext.setGeolocation(LH1_COORDS);
    const studentPage = await studentContext.newPage();
    await devLogin(studentPage, "student");

    await studentPage.goto(checkInPath(token));

    // The code is submitted on its own once the location check settles.
    const outcome = studentPage.getByTestId("checkin-outcome");
    await expect(outcome).toContainText(/checked in/i, { timeout: 90_000 });
    await expect(studentPage.getByTestId("outcome-verdict")).toHaveText(/accept/i);
    await expect(outcome).toContainText("CS101");
    await expect(studentPage.getByTestId("checkin-input")).toHaveCount(0);

    // The code is dropped from the address bar so a refresh can't resubmit it.
    await expect(studentPage).toHaveURL(/\/student\/check-in$/, { timeout: 30_000 });
    expect(new URL(studentPage.url()).searchParams.has("code")).toBe(false);

    // The live board counts the accepted check-in.
    await expect(facultyPage.getByTestId("board-count-verified")).toHaveText(/Verified 1\b/, {
      timeout: 60_000,
    });
  } finally {
    await studentContext.close();
  }

  const close = facultyPage.getByTestId("close-session");
  await close.click();
  await facultyPage.getByTestId("confirm-close-session").click();
  await expect(facultyPage.getByTestId("restart-session")).toBeVisible({ timeout: 30_000 });
});
