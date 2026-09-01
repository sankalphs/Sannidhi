import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { reseedDemoData } from "./global-setup";

test.describe.configure({ mode: "serial" });

const LH1_COORDS = { latitude: 12.97165, longitude: 77.59462, accuracy: 20 };
const FAR_COORDS = { latitude: 28.6139, longitude: 77.209, accuracy: 20 };
const HYDRATION_MS = 2000;

let facultyContext: BrowserContext;
let studentContext: BrowserContext;
let adminContext: BrowserContext;
let facultyPage: Page;
let studentPage: Page;
let adminPage: Page;
let lastUsedToken = "";

async function devLogin(page: Page, role: "student" | "faculty" | "admin"): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

async function openFacultySession(): Promise<void> {
  await facultyPage.goto("/faculty/sessions");
  const startSlot = facultyPage.getByTestId("start-slot").first();
  const resumeLink = facultyPage.getByRole("link", { name: "Resume" }).first();
  await expect(startSlot.or(resumeLink).first()).toBeVisible({ timeout: 120_000 });
  if ((await resumeLink.count()) > 0) {
    await resumeLink.click();
  } else {
    await startSlot.click();
  }
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
}

async function nextFreshToken(): Promise<string> {
  const tokenEl = facultyPage.getByTestId("qr-token");
  await expect
    .poll(
      async () => {
        const value = ((await tokenEl.textContent()) ?? "").trim();
        return value.length > 0 && value !== lastUsedToken;
      },
      { timeout: 75_000, message: "waiting for a freshly rotated QR token" },
    )
    .toBe(true);
  lastUsedToken = ((await tokenEl.textContent()) ?? "").trim();
  return lastUsedToken;
}

async function reloadScanner(): Promise<void> {
  await studentPage.goto("/student/check-in");
  const input = studentPage.getByTestId("checkin-input");
  await input.waitFor({ state: "visible", timeout: 120_000 });
  await expect(studentPage.getByTestId("geo-status")).toHaveText(/Location ready/i, {
    timeout: 30_000,
  });
  await studentPage.waitForTimeout(HYDRATION_MS);
}

async function openScannerAt(coords: { latitude: number; longitude: number; accuracy: number }) {
  await studentContext.setGeolocation(coords);
  await reloadScanner();
}

async function submitCode(token: string): Promise<void> {
  await studentPage.getByTestId("checkin-input").fill(token);
  await studentPage.getByTestId("submit-code").click();
}

test.beforeAll(async ({ browser }) => {
  facultyContext = await browser.newContext();
  studentContext = await browser.newContext();
  adminContext = await browser.newContext();

  await studentContext.grantPermissions(["geolocation"]);
  await studentContext.setGeolocation(LH1_COORDS);

  facultyPage = await facultyContext.newPage();
  studentPage = await studentContext.newPage();
  adminPage = await adminContext.newPage();

  await devLogin(facultyPage, "faculty");
  await devLogin(studentPage, "student");
  await devLogin(adminPage, "admin");
});

test.afterAll(async () => {
  await facultyContext.close().catch(() => {});
  await studentContext.close().catch(() => {});
  await adminContext.close().catch(() => {});
  reseedDemoData();
});

/**
 * Closes the current session and opens a fresh guest session so the next
 * scenario's redemption is the student's first for that session — a settled
 * (session, student) decision is echoed, never re-challenged.
 */
async function rotateFacultySession(): Promise<void> {
  await expect(facultyPage.getByTestId("close-session")).toBeVisible({ timeout: 30_000 });
  await facultyPage.getByTestId("close-session").click();

  await facultyPage.goto("/faculty/sessions");
  await facultyPage.getByTestId("start-guest-session").click();
  const create = facultyPage.getByTestId("create-guest-session");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
  await expect(facultyPage.getByTestId("close-session")).toBeVisible({ timeout: 30_000 });
}

test("happy path: in-venue check-in is accepted", async () => {
  test.setTimeout(180_000);

  await openFacultySession();
  const token = await nextFreshToken();

  await openScannerAt(LH1_COORDS);
  await submitCode(token);

  const outcome = studentPage.getByTestId("checkin-outcome");
  await expect(outcome).toContainText(/checked in/i, { timeout: 60_000 });
  await expect(studentPage.getByTestId("outcome-verdict")).toHaveText(/accept/i);
  await expect(studentPage.getByTestId("outcome-headline")).toContainText(/you're checked in/i);
  await expect(studentPage.getByTestId("try-again")).toHaveCount(0);
  await expect(studentPage.getByTestId("checkin-again")).toHaveCount(0);
});

test("step-up: far-away geolocation demands an extra check", async () => {
  test.setTimeout(180_000);

  // Fresh session: the happy path just settled this student as verified.
  await rotateFacultySession();

  const token = await nextFreshToken();

  await openScannerAt(FAR_COORDS);
  await submitCode(token);

  await expect(
    studentPage.getByTestId("outcome-verdict").or(studentPage.getByTestId("face-start")),
  ).toBeVisible({ timeout: 60_000 });
  // Full challenge completion (capture, fallback, faculty override) lives in
  // stepup.spec.ts; stop here so this spec stays fast.
  await expect(studentPage.getByTestId("face-start")).toBeVisible({ timeout: 60_000 });
});

test("replay: a consumed code reports already used", async () => {
  test.setTimeout(180_000);

  // Fresh session: the previous scenario left this student mid-step-up; the
  // replay verdict below must come from the consumed nonce, not that state.
  await rotateFacultySession();

  const token = await nextFreshToken();

  await openScannerAt(LH1_COORDS);
  await submitCode(token);
  await expect(studentPage.getByTestId("checkin-outcome")).toContainText(/checked in/i, {
    timeout: 60_000,
  });

  await reloadScanner();
  await submitCode(token);
  await expect(studentPage.getByTestId("checkin-outcome")).toContainText(/already used/i, {
    timeout: 60_000,
  });
});

test("manual verification flips the roster row to verified", async () => {
  test.setTimeout(180_000);

  await expect(facultyPage.locator('[data-testid^="board-row-"]').first()).toBeVisible({
    timeout: 60_000,
  });
  const verifyButtons = facultyPage.locator('[data-testid^="manual-verify-"]');
  await expect(verifyButtons.first()).toBeVisible({ timeout: 15_000 });

  const button = verifyButtons.first();
  const rowTestId = ((await button.getAttribute("data-testid")) ?? "").replace(
    "manual-verify-",
    "board-row-",
  );

  await button.click();
  const reasonBox = facultyPage.getByTestId("manual-verify-reason");
  const submitButton = facultyPage.getByTestId("manual-verify-submit");
  await expect(reasonBox).toBeVisible();
  await expect(submitButton).toBeDisabled();

  await reasonBox.fill("too short");
  await expect(submitButton).toBeDisabled();

  await reasonBox.fill("Verified in person by instructor after late arrival.");
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(reasonBox).toBeHidden({ timeout: 15_000 });
  await expect(facultyPage.getByTestId(rowTestId)).toContainText(/verified/i, { timeout: 20_000 });
});

test("audit trail exposes decision evidence and a valid hash chain", async () => {
  test.setTimeout(180_000);

  await adminPage.goto("/audit/events");
  const ledgerRows = adminPage.locator('[data-testid^="ledger-row-"]');
  await expect(ledgerRows.first()).toBeVisible({ timeout: 60_000 });

  const toggles = adminPage.locator('[data-testid^="ledger-toggle-"]');
  const toggleCount = Math.min(await toggles.count(), 30);
  expect(toggleCount).toBeGreaterThan(0);

  let decisionSeq: string | null = null;
  for (let index = 0; index < toggleCount && decisionSeq === null; index += 1) {
    const toggle = toggles.nth(index);
    const seq = ((await toggle.getAttribute("data-testid")) ?? "").replace("ledger-toggle-", "");
    await toggle.click();
    const evidence = adminPage.getByTestId(`ledger-evidence-${seq}`);
    if ((await evidence.count()) > 0 && (await evidence.getByText("Policy:").count()) > 0) {
      decisionSeq = seq;
    }
  }
  expect(decisionSeq).not.toBeNull();

  await adminPage.getByTestId("verify-chain").click();
  await expect(adminPage.getByTestId("chain-status")).toContainText(/chain valid/i, {
    timeout: 30_000,
  });
});

test("rate limiting blocks rapid repeated attempts", async () => {
  test.setTimeout(240_000);

  await reloadScanner();
  let sawRateLimit = false;
  for (let attempt = 1; attempt <= 8 && !sawRateLimit; attempt += 1) {
    if (attempt > 1) {
      await reloadScanner();
    }
    await submitCode(`garbage-token-${attempt}`);
    const outcome = studentPage.getByTestId("checkin-outcome");
    await expect(outcome).toBeVisible({ timeout: 30_000 });
    sawRateLimit = /too many attempts/i.test((await outcome.textContent()) ?? "");
  }
  await expect(studentPage.getByTestId("checkin-outcome")).toContainText(/too many attempts/i);
});
