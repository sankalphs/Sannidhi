import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("skip link is the first Tab stop and jumps to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  const main = page.locator("#main-content");
  await expect(main).toBeVisible();
  await expect(page).toHaveURL(/\/#main-content$/);
});

test("marketing anchors collapse behind a menu toggle on phone viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // Scoped to the banner: the footer repeats these anchors and the hidden
  // desktop nav never enters the accessibility tree at phone widths.
  const headerHowItWorks = page.getByRole("banner").getByRole("link", { name: "How it works" });
  await expect(headerHowItWorks).toBeHidden();

  const menuToggle = page.getByRole("button", { name: /menu/i });
  await menuToggle.click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  await expect(headerHowItWorks).toBeVisible();

  await headerHowItWorks.click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#site-nav-menu")).toHaveCount(0);
  await expect(headerHowItWorks).toBeHidden();
});

test("login tabs move selection with keyboard arrows and Home", async ({ page }) => {
  await page.goto("/login");

  const passkeyTab = page.getByRole("tab", { name: "Passkey" });
  const passwordTab = page.getByRole("tab", { name: "USN / Email" });
  await passkeyTab.focus();

  await page.keyboard.press("ArrowRight");
  await expect(passwordTab).toHaveAttribute("aria-selected", "true");
  await expect(passwordTab).toBeFocused();
  await expect(page.getByTestId("password-login-form")).toBeVisible();

  await page.keyboard.press("Home");
  await expect(passkeyTab).toHaveAttribute("aria-selected", "true");
  await expect(passkeyTab).toBeFocused();
  await expect(page.getByTestId("password-login-form")).toBeHidden();
});

test("marketing and auth surfaces pass an axe serious/critical scan", async ({ page }) => {
  for (const path of ["/", "/login", "/request-access", "/signup"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    const summary = serious.map((violation) => `${violation.id}(${violation.impact})`).join(", ");
    expect(serious, `${path} axe violations: ${summary}`).toEqual([]);
  }
});
