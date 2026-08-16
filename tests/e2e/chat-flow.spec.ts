import { expect, test } from "@playwright/test";

/**
 * E2E happy-path tests. Run with AI_MODE=mock so every LLM/embedding call
 * returns deterministic fixtures (see src/lib/server/ai/__mocks__/responses.ts)
 * — these specs should be quick, network-free, and free of paid token usage.
 */
test.describe("Chat flow (mock mode)", () => {
  test("loads the app with initial electorate question", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "AI Voting Advisor" }),
    ).toBeVisible();
    await expect(page.locator("text=Confidence: 0%")).toBeVisible();
    await expect(
      page.locator("text=Which electorate do you live in?"),
    ).toBeVisible();
  });

  test("electorate selection advances to the next component", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator("text=Which electorate do you live in?"),
    ).toBeVisible();

    // Open electorate dropdown and pick the first option.
    await page
      .locator("button")
      .filter({ hasText: "Select your electorate..." })
      .first()
      .click();
    await page.locator('div[role="option"]').first().click();

    await page.locator("button").filter({ hasText: "Continue" }).click();

    // The mock COMPONENT_SELECTOR fixture returns a multiselect about issues.
    await expect(
      page.locator("text=Which issues matter most to you?"),
    ).toBeVisible();
  });

  test("completes a multi-step flow without server errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/");

    // Electorate
    await page
      .locator("button")
      .filter({ hasText: "Select your electorate..." })
      .first()
      .click();
    await page.locator('div[role="option"]').first().click();
    await page.locator("button").filter({ hasText: "Continue" }).click();

    // Issues multiselect (from mock fixture)
    const checkboxes = page.locator('[data-slot="checkbox"]');
    await expect(checkboxes.first()).toBeVisible();
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.locator("button").filter({ hasText: "Continue" }).click();

    // Should land on the chat / follow-up component without 500s.
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("party details support keyboard open, close, and focus return", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator("button")
      .filter({ hasText: "Select your electorate..." })
      .first()
      .click();
    await page.locator('div[role="option"]').first().click();
    await page.locator("button").filter({ hasText: "Continue" }).click();

    const trigger = page
      .getByRole("button", { name: /View evidence for/ })
      .first();
    await expect(trigger).toBeVisible();
    const partyName = (await trigger.getAttribute("aria-label"))?.replace(
      "View evidence for ",
      "",
    );

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: partyName }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Space");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: partyName }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("candidate details open with Enter and Space", async ({ page }) => {
    await page.goto("/");
    await page
      .locator("button")
      .filter({ hasText: "Select your electorate..." })
      .first()
      .click();
    await page.locator('div[role="option"]').first().click();
    await page.locator("button").filter({ hasText: "Continue" }).click();

    const trigger = page
      .getByRole("button", { name: /View details for/ })
      .first();
    await expect(trigger).toBeVisible();
    const candidateName = (await trigger.getAttribute("aria-label"))?.replace(
      "View details for ",
      "",
    );

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: candidateName }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: candidateName }),
    ).toBeVisible();
  });
});
