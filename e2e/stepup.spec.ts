import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  installAnimatedCamera,
  installDeniedCamera,
  installStaticCamera,
} from "./helpers/fake-camera";
import { reseedDemoData } from "./global-setup";

test.describe.configure({ mode: "serial" });

const LH1_COORDS = { latitude: 12.97165, longitude: 77.59462, accuracy: 20 };
const FAR_COORDS = { latitude: 28.6139, longitude: 77.209, accuracy: 20 };
const HYDRATION_MS = 2000;
const STUDENT_EMAIL = "aarav.patel@sit.edu.in";

let facultyContext: BrowserContext;
let adminContext: BrowserContext;
let studentContext: BrowserContext;
let staticContext: BrowserContext | null = null;
let deniedContext: BrowserContext | null = null;
let facultyPage: Page;
let adminPage: Page;
let studentPage: Page;
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

/**
 * Closes the current session and opens a fresh guest session, so each
 * scenario runs against a session with no settled (session, student)
 * decision yet — re-redemption of the same session now echoes its settled
 * outcome instead of re-challenging.
 */
async function rotateFacultySession(): Promise<void> {
  const close = facultyPage.getByTestId("close-session");
  await expect(close).toBeVisible({ timeout: 15_000 });
  await close.click();
  // The close mutation is fired void; wait for the closed state (the restart
  // control appearing) before a new guest session can start cleanly.
  await expect(facultyPage.getByTestId("restart-session")).toBeVisible({ timeout: 30_000 });

  await facultyPage.goto("/faculty/sessions");
  await facultyPage.getByTestId("start-guest-session").click();
  const create = facultyPage.getByTestId("create-guest-session");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await facultyPage.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
  await expect(facultyPage.getByTestId("close-session")).toBeVisible({ timeout: 30_000 });
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

async function openScannerAt(
  context: BrowserContext,
  page: Page,
  coords: { latitude: number; longitude: number; accuracy: number },
): Promise<void> {
  await context.setGeolocation(coords);
  await page.goto("/student/check-in");
  const input = page.getByTestId("checkin-input");
  await input.waitFor({ state: "visible", timeout: 120_000 });
  await expect(page.getByTestId("geo-status")).toHaveText(/Location ready/i, {
    timeout: 30_000,
  });
  await page.waitForTimeout(HYDRATION_MS);
}

async function submitCode(page: Page, token: string): Promise<void> {
  await page.getByTestId("checkin-input").fill(token);
  await page.getByTestId("submit-code").click();
}

/**
 * The step-up path may surface a verdict stamp first or jump straight to the
 * challenge screen; either way, the capture UI must appear.
 */
async function expectStepUpStarted(page: Page): Promise<void> {
  await expect(page.getByTestId("outcome-verdict").or(page.getByTestId("face-start"))).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("face-start")).toBeVisible({ timeout: 60_000 });
}

/** Drives one FaceCapture round on `page`: start camera, wait for preview, scan. */
async function captureFace(page: Page): Promise<void> {
  await page.getByTestId("face-start").click();
  await expect(page.getByTestId("face-preview")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("face-capture").click();
}

async function studentBoardRow(): Promise<Locator> {
  const row = facultyPage.locator('[data-testid^="board-row-"]', { hasText: STUDENT_EMAIL });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  return row;
}

async function studentRowId(): Promise<string> {
  const row = await studentBoardRow();
  const testid = (await row.getAttribute("data-testid")) ?? "";
  expect(testid).toMatch(/^board-row-/);
  return testid.replace("board-row-", "");
}

async function overrideViaDialog(rowId: string, reason: string): Promise<void> {
  const button = facultyPage.getByTestId(`manual-verify-${rowId}`);
  await expect(button).toBeVisible({ timeout: 15_000 });
  await expect(button).toHaveText(/Override/i);
  await button.click();

  const reasonBox = facultyPage.getByTestId("manual-verify-reason");
  await expect(reasonBox).toBeVisible();
  await reasonBox.fill(reason);
  await facultyPage.getByTestId("manual-verify-submit").click();
  await expect(reasonBox).toBeHidden({ timeout: 15_000 });
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000);

  facultyContext = await browser.newContext();
  adminContext = await browser.newContext();
  studentContext = await browser.newContext();

  await studentContext.grantPermissions(["geolocation"]);
  await studentContext.setGeolocation(LH1_COORDS);
  await installAnimatedCamera(studentContext);

  facultyPage = await facultyContext.newPage();
  adminPage = await adminContext.newPage();
  studentPage = await studentContext.newPage();

  await devLogin(facultyPage, "faculty");
  await devLogin(adminPage, "admin");
  await devLogin(studentPage, "student");

  await openFacultySession();

  // The face must be enrolled before any scenario can demand a step-up check.
  await studentPage.goto("/student/devices");
  const enrollButton = studentPage.getByTestId("biometric-enroll");
  await expect(enrollButton).toBeVisible({ timeout: 60_000 });
  await enrollButton.click();
  await captureFace(studentPage);
  await expect(studentPage.getByTestId("biometric-status")).toContainText(/Face enrolled/i, {
    timeout: 30_000,
  });
});

test.afterAll(async () => {
  await facultyContext.close().catch(() => {});
  await adminContext.close().catch(() => {});
  await studentContext.close().catch(() => {});
  await staticContext?.close().catch(() => {});
  await deniedContext?.close().catch(() => {});
  reseedDemoData();
});

test("step-up: animated capture completes the challenge and verifies", async () => {
  test.setTimeout(180_000);

  // Fresh session: the resume path may land on a session where an earlier
  // spec already settled this student, and settled decisions are echoed.
  await rotateFacultySession();

  const token = await nextFreshToken();
  await openScannerAt(studentContext, studentPage, FAR_COORDS);
  await submitCode(studentPage, token);

  await expectStepUpStarted(studentPage);
  await captureFace(studentPage);
  await expect(studentPage.getByTestId("stepup-result")).toContainText(/verified/i, {
    timeout: 90_000,
  });

  const rowId = await studentRowId();
  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/verified/i, {
    timeout: 30_000,
  });

  // Ledger records the completed step-up with its policy evidence.
  await adminPage.goto("/audit/events");
  const toggles = adminPage.locator('[data-testid^="ledger-toggle-"]');
  await expect(toggles.first()).toBeVisible({ timeout: 60_000 });
  const toggleCount = Math.min(await toggles.count(), 40);
  let stepupSeq: string | null = null;
  for (let index = 0; index < toggleCount && stepupSeq === null; index += 1) {
    const toggle = toggles.nth(index);
    const seq = ((await toggle.getAttribute("data-testid")) ?? "").replace("ledger-toggle-", "");
    const rowText = ((await adminPage.getByTestId(`ledger-row-${seq}`).textContent()) ?? "").trim();
    if (!/attendance\.stepup_completed/i.test(rowText)) continue;
    await toggle.click();
    await expect(adminPage.getByTestId(`ledger-evidence-${seq}`).getByText("Policy:")).toBeVisible({
      timeout: 10_000,
    });
    stepupSeq = seq;
  }
  expect(stepupSeq).not.toBeNull();
});

test("step-up: static presentation flags spoof and faculty overrides", async ({ browser }) => {
  test.setTimeout(180_000);

  // Fresh session: the previous scenario left this student verified, and a
  // settled decision is echoed (not re-challenged) on re-redemption.
  await rotateFacultySession();

  staticContext = await browser.newContext();
  await staticContext.grantPermissions(["geolocation"]);
  await installStaticCamera(staticContext);
  const staticPage = await staticContext.newPage();
  await devLogin(staticPage, "student");

  const token = await nextFreshToken();
  await openScannerAt(staticContext, staticPage, FAR_COORDS);
  await submitCode(staticPage, token);

  await expectStepUpStarted(staticPage);
  await captureFace(staticPage);
  await expect(staticPage.getByTestId("stepup-result")).toContainText(/review/i, {
    timeout: 90_000,
  });

  const rowId = await studentRowId();
  const row = facultyPage.getByTestId(`board-row-${rowId}`);
  await expect(row).toContainText(/flagged/i, { timeout: 30_000 });
  // Reason codes render as friendly labels; the raw code rides in the title.
  await expect(row).toContainText(/face spoof suspected/i, { timeout: 30_000 });

  await overrideViaDialog(rowId, "Verified in person after reviewing the spoof flag.");
  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/verified/i, {
    timeout: 30_000,
  });
});

test("step-up: unavailable camera escalates to faculty review", async ({ browser }) => {
  test.setTimeout(180_000);

  // Fresh session: the previous override settled this student as verified.
  await rotateFacultySession();

  deniedContext = await browser.newContext();
  await deniedContext.grantPermissions(["geolocation"]);
  await installDeniedCamera(deniedContext);
  const deniedPage = await deniedContext.newPage();
  await devLogin(deniedPage, "student");

  const token = await nextFreshToken();
  await openScannerAt(deniedContext, deniedPage, FAR_COORDS);
  await submitCode(deniedPage, token);

  await expectStepUpStarted(deniedPage);
  const faceStart = deniedPage.getByTestId("face-start");
  await faceStart.click();
  await expect(deniedPage.getByTestId("face-error")).toContainText(/denied/i, { timeout: 15_000 });

  await deniedPage.getByTestId("stepup-fallback").click();
  // The fallback asks for confirmation before giving up on the face check.
  const confirmButton = deniedPage.getByTestId("stepup-fallback-confirm");
  await expect(confirmButton).toBeVisible({ timeout: 15_000 });
  await confirmButton.click();
  await expect(deniedPage.getByText(/faculty will verify/i)).toBeVisible({ timeout: 60_000 });

  const rowId = await studentRowId();
  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/flagged/i, {
    timeout: 30_000,
  });

  await overrideViaDialog(rowId, "Student arrived without a working camera; verified in person.");
  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/verified/i, {
    timeout: 30_000,
  });
});

test("spot re-check: targeted and random requests reach the student", async () => {
  test.setTimeout(180_000);

  // Fresh session: the previous override settled the previous session, so
  // check in here first — a spot re-check targets a verified student.
  await rotateFacultySession();
  const token = await nextFreshToken();
  await openScannerAt(studentContext, studentPage, LH1_COORDS);
  await submitCode(studentPage, token);
  await expect(studentPage.getByTestId("checkin-outcome")).toContainText(/checked in/i, {
    timeout: 30_000,
  });

  const rowId = await studentRowId();
  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/verified/i, {
    timeout: 30_000,
  });
  const banner = studentPage.getByTestId("pending-challenge");

  // Settle any stale pending challenge left by earlier specs so the banner
  // assertions below observe exactly the re-check requested here.
  await studentPage.goto("/student");
  const hasStaleBanner = await banner
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (hasStaleBanner) {
    await captureFace(studentPage);
    // Settled challenges freeze the banner until explicitly dismissed.
    await expect(studentPage.getByTestId("stepup-result")).toBeVisible({ timeout: 90_000 });
    await studentPage.getByTestId("stepup-done").click();
    await expect(banner).toHaveCount(0);
  }

  const recheckButton = facultyPage.getByTestId(`spot-recheck-${rowId}`);
  await expect(recheckButton).toBeVisible({ timeout: 15_000 });
  await recheckButton.click();
  await expect(facultyPage.getByTestId(`spot-pending-${rowId}`)).toBeVisible({ timeout: 30_000 });

  await studentPage.goto("/student");
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await captureFace(studentPage);
  await expect
    .poll(
      async () => {
        if (!(await banner.isVisible().catch(() => false))) return true;
        const text = ((await banner.textContent()) ?? "").trim();
        return /verified|passed|thank/i.test(text);
      },
      { timeout: 90_000, message: "waiting for the spot re-check confirmation" },
    )
    .toBe(true);

  await expect(facultyPage.getByTestId(`board-row-${rowId}`)).toContainText(/verified/i, {
    timeout: 30_000,
  });
  await expect(facultyPage.getByTestId(`spot-pending-${rowId}`)).toHaveCount(0);

  await facultyPage.getByTestId("spot-recheck-random").click();
  await expect(facultyPage.locator('[data-testid^="spot-pending-"]').first()).toBeVisible({
    timeout: 30_000,
  });
});
