import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { reseedDemoData } from "./global-setup";

test.describe.configure({ mode: "serial" });

/**
 * Faculty offline capture (spec §13): mint a session bundle while online,
 * attest a student from the roster (device-queue only, no server call), then
 * sync the queue through the same ledger append seam online check-in uses —
 * tagged origin=offline-faculty.
 */

async function devLogin(page: Page, role: "faculty" | "admin"): Promise<void> {
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
let adminContext: BrowserContext;
let facultyPage: Page;
let adminPage: Page;

test.beforeAll(async ({ browser }) => {
  facultyContext = await browser.newContext();
  adminContext = await browser.newContext();

  facultyPage = await facultyContext.newPage();
  adminPage = await adminContext.newPage();

  await devLogin(facultyPage, "faculty");
  await devLogin(adminPage, "admin");
});

test.afterAll(async () => {
  await facultyContext.close().catch(() => {});
  await adminContext.close().catch(() => {});
  reseedDemoData();
});

test("offline capture syncs through the same seam and dedupes replays", async () => {
  test.setTimeout(180_000);

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

test("a second sync of an already-settled student reports duplicate", async () => {
  test.setTimeout(180_000);

  await openFacultySession(facultyPage);

  // Re-mint (rotates the key) and attest one still-pending student.
  await facultyPage.getByTestId("offline-kit-open").click();
  await facultyPage.getByTestId("offline-mint").click();
  await expect(facultyPage.getByText("Session authorized")).toBeVisible({ timeout: 30_000 });

  const attestButton = facultyPage.getByTestId(/^offline-attest-/).first();
  await expect(attestButton).toBeVisible({ timeout: 30_000 });
  await attestButton.click();
  await expect(facultyPage.getByTestId("offline-queued-count")).toHaveText(/1 queued/, {
    timeout: 30_000,
  });

  // Duplicate the queued record in storage with a fresh nonce and a matching
  // signature — the exact shape a second tab's stale attestation produces
  // (two valid records, one student). Both ride one sync; the second must
  // settle as duplicate via the settled-state echo.
  await facultyPage.evaluate(async () => {
    const key = "sannidhi.offline-queue";
    const state = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (state === null || state.queued?.length !== 1) return;
    const record = state.queued[0];
    const nonce = crypto.randomUUID();
    const unsigned = {
      sessionId: record.sessionId,
      sectionId: record.sectionId,
      studentId: record.studentId,
      capturedAt: record.capturedAt,
      nonce,
      ...(record.note !== undefined ? { note: record.note } : {}),
    };
    const keyBytes = new Uint8Array(
      (state.bundle.key.match(/../g) ?? []).map((byte: string) => Number.parseInt(byte, 16)),
    );
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    // Canonical field order mirrors canonicalEventJson: recursively sorted
    // keys (plain < comparison), compact JSON.
    const canonical = JSON.stringify(
      Object.fromEntries(Object.entries(unsigned).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    );
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(canonical)),
    );
    const signature = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
    state.queued.push({ ...record, nonce, signature });
    window.localStorage.setItem(key, JSON.stringify(state));
  });

  await facultyPage.reload();
  await facultyPage.getByTestId("offline-kit-open").click();
  await expect(facultyPage.getByTestId("offline-queued-count")).toHaveText(/2 queued/, {
    timeout: 30_000,
  });

  await facultyPage.getByTestId("offline-sync").click();
  await expect(facultyPage.getByTestId("offline-outcomes")).toBeVisible({ timeout: 60_000 });
  // Exactly one accepted outcome, and the replay reports duplicate.
  await expect(facultyPage.getByTestId("sync-status-accepted")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(facultyPage.getByTestId("sync-status-duplicate")).toHaveCount(1, {
    timeout: 30_000,
  });
  // A fully-settled queue is wiped.
  await expect(facultyPage.getByTestId("offline-queued-count")).toHaveText(/0 queued/, {
    timeout: 30_000,
  });
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
