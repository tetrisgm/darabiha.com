import { expect, test } from "@playwright/test";

test("public tree renders as an interactive canvas beside the archive chat", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".family-canvas")).toBeVisible();
  await expect(page.locator(".tree-card")).toHaveCount(4);
  await expect(page.locator(".tree-connectors line")).not.toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in with Apple/ })).toBeVisible();
});

test("a person card opens a navigable record", async ({ page }) => {
  await page.goto("/");
  await page.locator(".tree-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Family member")).toBeVisible();
});

test("canvas accepts wheel zoom without scrolling the document", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator(".family-canvas");
  await canvas.hover();
  await page.mouse.wheel(0, -300);
  await expect(canvas).toHaveCSS("touch-action", "none");
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior", "none");
});

test("canvas and cards expose distinct cursor affordances", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".family-canvas")).toHaveCSS("cursor", "grab");
  await expect(page.locator(".tree-viewport")).toHaveCSS("cursor", "grab");
  await expect(page.locator(".tree-card").first()).toHaveCSS("cursor", "pointer");
});
