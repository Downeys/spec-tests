import { test, expect } from "@playwright/test";

test("loads, sends a message, sees the context panel update", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PRD 2 Agent")).toBeVisible();

  const composer = page.getByPlaceholder("Send a message...");
  await expect(composer).toBeVisible();

  await expect(page.getByLabel(/token usage/i)).toBeVisible();

  await page.getByLabel("Open menu").click();
  await expect(page.getByText("Compact conversation")).toBeVisible();
  await expect(page.getByText("New conversation")).toBeVisible();
});
