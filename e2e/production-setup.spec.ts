import { execSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The real-deployment path: an operator bootstraps an institution from the
 * CLI, its first admin activates with a passkey, then builds the schedule
 * that faculty start sessions from. No fixture shortcuts on the admin side.
 */

test.describe.configure({ mode: "serial" });

function bootstrapInstitution(): { invitePath: string; adminEmail: string } {
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const args = JSON.stringify({
    institutionName: `E2E College ${suffix}`,
    institutionCode: `E2E-${suffix}`,
    adminName: "First Admin",
    adminEmail: `first.admin.${suffix.toLowerCase()}@e2e.test`,
  });
  const output = execSync(`bunx convex run setup:bootstrap '${args}'`, { encoding: "utf8" });
  return JSON.parse(output.slice(output.indexOf("{"))) as {
    invitePath: string;
    adminEmail: string;
  };
}

async function addVirtualAuthenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test("a bootstrapped admin activates with a passkey and signs back in with it", async ({
  page,
}) => {
  const { invitePath, adminEmail } = bootstrapInstitution();
  await addVirtualAuthenticator(page);

  await page.goto(invitePath);
  await expect(page.getByRole("heading", { name: "Activate your account" })).toBeVisible();
  await expect(page.getByText(adminEmail)).toBeVisible();
  await page.getByRole("button", { name: "Register passkey" }).click();
  await expect(page.getByText("Account activated")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });

  // The invite link is single-use.
  await page.goto(invitePath);
  await expect(page.getByText("This invite has already been used.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
});

test("admins build venues and the timetable that faculty start sessions from", async ({
  browser,
}) => {
  const admin = await browser.newPage();
  const faculty = await browser.newPage();
  expect((await admin.request.post("/api/dev-session", { data: { role: "admin" } })).ok()).toBe(
    true,
  );
  expect((await faculty.request.post("/api/dev-session", { data: { role: "faculty" } })).ok()).toBe(
    true,
  );

  const venueName = `E2E Room ${Date.now().toString(36)}`;
  await admin.goto("/admin/schedule");
  await expect(admin.getByRole("heading", { name: "Venues & timetable" })).toBeVisible();

  const venues = admin.locator('section[aria-labelledby="venues-heading"]');
  const timetable = admin.locator('section[aria-labelledby="timetable-heading"]');
  const venueForm = admin.getByTestId("venue-form");
  await venueForm.getByLabel("Name").fill(venueName);
  await venueForm.getByLabel("Capacity").fill("40");
  await venueForm.getByLabel("Latitude").fill("12.9716");
  await venueForm.getByLabel("Longitude").fill("77.5946");
  await venueForm.getByRole("button", { name: "Add venue" }).click();
  await expect(admin.getByRole("cell", { name: venueName, exact: true })).toBeVisible();

  // Half-filled coordinates are refused with a readable message.
  await venueForm.getByLabel("Name").fill(`${venueName} B`);
  await venueForm.getByLabel("Latitude").fill("12.9");
  await venueForm.getByRole("button", { name: "Add venue" }).click();
  await expect(venues.getByRole("alert")).toContainText("Enter both latitude and longitude");
  await venueForm.getByLabel("Name").fill("");
  await venueForm.getByLabel("Latitude").fill("");

  // Schedule today (institution time), late enough to avoid fixture slots.
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(new Date());
  const slotForm = admin.getByTestId("slot-form");
  await slotForm.getByLabel("Section").selectOption({ label: "MA201 - Section A" });
  await slotForm.getByLabel("Venue").selectOption({ label: venueName });
  await slotForm.getByLabel("Day").selectOption({ label: today });
  await slotForm.getByLabel("Starts").fill("22:00");
  await slotForm.getByLabel("Ends").fill("23:00");
  await slotForm.getByLabel("Faculty").selectOption({ label: "Priya Menon" });
  await slotForm.getByRole("button", { name: "Add to timetable" }).click();
  await expect(admin.getByText("22:00–23:00")).toBeVisible();

  // A double booking of the same room is refused.
  await slotForm.getByLabel("Section").selectOption({ label: "PH105 - Section A" });
  await slotForm.getByLabel("Faculty").selectOption({ label: "Unassigned" });
  await slotForm.getByLabel("Starts").fill("22:30");
  await slotForm.getByLabel("Ends").fill("23:30");
  await slotForm.getByRole("button", { name: "Add to timetable" }).click();
  await expect(timetable.getByRole("alert")).toContainText("already booked");

  await faculty.goto("/faculty/sessions");
  await expect(faculty.getByText(venueName)).toBeVisible();

  // A venue in use cannot be deleted until its slots go.
  await admin.getByRole("button", { name: `Delete ${venueName}` }).click();
  await admin.getByRole("button", { name: "Confirm delete" }).click();
  await expect(venues.getByRole("alert")).toContainText(
    "Remove this venue's timetable slots first",
  );

  await admin.getByRole("button", { name: /^Remove MA201 - Section A on \w+ at 22:00$/ }).click();
  await admin.getByRole("button", { name: "Confirm remove" }).click();
  await expect(admin.getByText("22:00–23:00")).toHaveCount(0);
  await admin.getByRole("button", { name: `Delete ${venueName}` }).click();
  await admin.getByRole("button", { name: "Confirm delete" }).click();
  await expect(admin.getByRole("cell", { name: venueName, exact: true })).toHaveCount(0);

  await admin.close();
  await faculty.close();
});
