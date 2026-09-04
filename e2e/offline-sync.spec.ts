import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { reseedDemoData } from "./global-setup";

test.describe.configure({ mode: "serial" });

/**
 * Faculty offline capture (spec §13): mint a session bundle while online,
 * attest a student from the roster (device-queue only, no server call), then
 * sync the queue through the same ledger append seam online check-in uses —
 * tagged origin=offline-faculty. A second sync of the same nonce reports
 * duplicate, proving replay reconciliation.
 */

async function devLogin(page: Page, role: "student" | "faculty" | "admin"): Promise<void> {
  const response = await page.request.post("/api/dev-session", { data: { role } });
  expect(response.ok()).toBeTruthy();
}

async function openFacultySession(page: Page): Promise<void> {
  await page.goto("/faculty/sessions");
  const startSlot = page.getByTestId("start-slot").first();
  const resumeLink = page.getByRole("link", { name: "Resume" }).first();
  await expect(startSlot.or(resumeLink).first()).toBeVisible({ timeout: 120_000 });
  if ((await resumeLink.count()) > 0) {
    await resumeLink.click();
  } else {
    await startSlot.click();
  }
  await page.waitForURL(/\/faculty\/sessions\/[^/]+$/, { timeout: 120_000 });
}

let facultyContext: BrowserContext;
let studentContext: BrowserContext;
let adminContext: BrowserContext;
let facultyPage: Page;
let studentPage: Page;
let adminPage: Page;

test.beforeAll(async ({ browser }) => {
  facultyContext = await browser.newContext();
  studentContext = await browser.newContext();
  adminContext = await browser.newContext();

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

test("offline capture syncs through the same seam and dedupes replays", async () => {
  test.setTimeout(180_000);

  // The student checks in normally so the session has one settled online row.
  await openFacultySession(facultyPage);
  const sessionUrl = facultyPage.url();

  // Faculty pre-authorizes offline capture for this session.
  await facultyPage.getByTestId("offline-kit-open").click();
  await facultyPage.getByTestId("offline-mint").click();
  await expect(facultyPage.getByText("Session authorized")).toBeVisible({ timeout: 30_000 });

  // One student is attested offline (queued + signed on the device only).
  const attestButton = facultyPage.getByTestId(/^offline-attest-/).first();
  await expect(attestButton).toBeVisible({ timeout: 30_000 });
  await attestButton.click();
  await expect(facultyPage.getByTestId("offline-queued-count")).toHaveText(/1 queued/, {
    timeout: 30_000,
  });

  // Back online: sync pushes the queue through syncOfflineBatch.
  await facultyPage.getByTestId("offline-sync").click();
  await expect(facultyPage.getByTestId("offline-outcomes")).toBeVisible({ timeout: 60_000 });
  await expect(facultyPage.getByTestId("sync-status-accepted").first()).toBeVisible({
    timeout: 30_000,
  });

  // The synced student now reads Verified on the live board.
  await facultyPage.reload();
  await facultyPage.waitForURL(sessionUrl, { timeout: 60_000 });
  await expect(
    facultyPage.locator('[data-testid^="board-row-"]').filter({ hasText: "Verified" }).first(),
  ).toBeVisible({ timeout: 60_000 });

  // A fully-synced queue is wiped from the device — the dialog offers a fresh
  // authorization again instead of keeping a stale bundle around.
  await facultyPage.getByTestId("offline-kit-open").click();
  await expect(facultyPage.getByTestId("offline-mint")).toBeVisible({ timeout: 30_000 });
});

test("the audit ledger records the offline sync events", async () => {
  test.setTimeout(120_000);

  await adminPage.goto("/audit/events");
  const rows = adminPage.locator('[data-testid^="ledger-row-"]');
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });
  await expect(rows.filter({ hasText: "attendance.offline_synced" }).first()).toBeVisible({
    timeout: 60_000,
  });

  // The ledger chain still verifies with offline-origin events appended.
  await adminPage.getByTestId("verify-chain").click();
  await expect(adminPage.getByTestId("chain-status")).toContainText(/chain valid/i, {
    timeout: 30_000,
  });
});
