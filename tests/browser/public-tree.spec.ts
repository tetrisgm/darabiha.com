import { expect, test } from "@playwright/test";

test("public tree renders as an interactive canvas beside the archive chat", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".family-canvas")).toBeVisible();
  await expect(page.locator(".chat-sidebar")).toBeVisible();
  await expect(page.locator(".tree-card")).toHaveCount(4);
  await expect(page.locator(".tree-connectors line")).not.toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in with Apple/ })).toBeVisible();
});

test("chat sidebar collapses and returns from the left edge", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".chat-sidebar");
  await sidebar.getByRole("button", { name: "Collapse family chat" }).click();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await expect(page.locator(".chat-edge-reveal")).not.toHaveClass(/is-visible/);
  await page.mouse.move(10, 300);
  await expect(page.locator(".chat-edge-reveal")).toHaveClass(/is-visible/);
  await page.locator(".chat-edge-reveal").click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
});

test("a person card opens a navigable record", async ({ page }) => {
  await page.goto("/");
  await page.locator(".tree-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".person-drawer-backdrop")).toBeVisible();
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

test("canvas zoom controls change and reset the zoom percentage", async ({ page }) => {
  await page.goto("/");
  const level = page.locator(".canvas-zoom-level");
  await expect(level).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(level).toHaveText("110%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(level).toHaveText("99%");
  await level.click();
  await expect(level).toHaveText("100%");
});

test("zoom controls do not show the canvas hand cursor", async ({ page }) => {
  await page.goto("/");
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await zoomIn.hover();
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "false");
});

test("canvas and cards expose distinct cursor affordances", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".family-canvas")).toHaveAttribute("data-interactive", "true");
  await expect(page.locator(".family-canvas")).toHaveCSS("cursor", "none");
  await expect(page.locator(".canvas-hit-surface")).toHaveCSS("cursor", "none");
  await expect(page.locator(".tree-card").first()).toHaveCSS("cursor", "none");
});

test("live page exposes an uncached deployment identity", async ({ page }) => {
  await page.goto("/");
  const build = await page.locator("main[data-build-id]").getAttribute("data-build-id");
  const version = await page.locator("main[data-version]").getAttribute("data-version");
  expect(build).toMatch(/^[0-9a-f]{7,}$/);
  expect(version).toBe("34");
  const response = await page.request.get("/api/version");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).build).toBe(build);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("Safari gets a visible custom grab cursor and clickable-card cursor", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator(".family-canvas");
  await expect(canvas).toHaveAttribute("data-interactive", "true");
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const emptyPoint = { x: canvasBox!.x + 20, y: canvasBox!.y + 20 };
  await page.mouse.move(emptyPoint.x, emptyPoint.y);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("canvas-hit-surface"), emptyPoint)).toBe(true);
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "grab");
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "true");
  await expect(page.locator(".tree-custom-cursor")).toHaveCSS("opacity", "1");
  await page.locator(".tree-card").first().hover();
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "pointer");
  const text = page.locator(".tree-card strong").first();
  const box = await text.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".tree-card") !== null, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 })).toBe(true);
});

test("dragging the dedicated surface pans while a card remains clickable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".family-canvas")).toHaveAttribute("data-interactive", "true");
  await expect(page.locator(".family-canvas")).toBeVisible();
  const viewport = page.locator(".tree-viewport");
  const before = await viewport.getAttribute("style");
  const box = await page.locator(".family-canvas").boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + 80, y: box!.y + 180 };
  await page.mouse.move(start.x, start.y);
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "true");
  await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y + 70, { steps: 4 });
  await expect(page.locator(".family-canvas")).toHaveAttribute("data-panning", "true");
  await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "grabbing");
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("style", before!);
  await expect(page.locator(".family-canvas")).toHaveAttribute("data-panning", "false");
  await page.locator(".tree-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
