# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-tree.spec.ts >> chat sidebar collapses and returns from the left edge
- Location: tests/browser/public-tree.spec.ts:58:1

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('.chat-sidebar')
Expected pattern: /is-collapsed/
Received string:  "chat-sidebar flex min-h-0 flex-col border-b border-[var(--line)] bg-[var(--sidebar)] lg:border-b-0 lg:border-r "
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" with timeout 5000ms
  - waiting for locator('.chat-sidebar')
    14 × locator resolved to <aside aria-label="Family chat" class="chat-sidebar flex min-h-0 flex-col border-b border-[var(--line)] bg-[var(--sidebar)] lg:border-b-0 lg:border-r ">…</aside>
       - unexpected value "chat-sidebar flex min-h-0 flex-col border-b border-[var(--line)] bg-[var(--sidebar)] lg:border-b-0 lg:border-r "

```

```yaml
- complementary "Family chat":
  - button "Collapse family chat"
  - heading "The Darabiha family tree" [level=3]
  - paragraph: Explore our family history, ask about the people and relationships in the tree, and discover the stories recorded here.
  - button "From the archive Mohammad is the most repeated given name in the family — 12 people carry it." [disabled]
  - 'button "Two family names run through the archive: Darabi, carried by 54 people, and Jaberian, carried by 38. How did the Darabi and Jaberian families come together?"'
  - button "197 women and 208 men are recorded in the archive. Tell me about the women in the family — what does the archive record about them?"
  - button "Ezatollah (Ahmad) Jaberian lived the longest life the archive records — 95 years, from 1931 to 2026. Tell me about Ezatollah (Ahmad) Jaberian and the years they lived through."
  - paragraph: You're signed in, but this Apple account isn't authorized to edit this family tree.
  - textbox "Search the family archive":
    - /placeholder: Who are the children of…?
  - button "Send message" [disabled]: ↑
```

# Test source

```ts
  1   | import { expect, test, type Locator, type Page } from "@playwright/test";
  2   | import { execFileSync } from "node:child_process";
  3   | import { createHmac } from "node:crypto";
  4   | 
  5   | // The live site is members-only, so every UI test carries a minted session
  6   | // for the dedicated browser-suite viewer member. The session secret's
  7   | // durable copy lives in the Mac login Keychain (fleet rule).
  8   | function viewerSessionCookie(): string {
  9   |   const secret = execFileSync("security", ["find-generic-password", "-s", "darabiha-session-secret", "-w"]).toString().trim();
  10  |   const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  11  |   const payload = b64url(JSON.stringify({ subject: "browser-suite", email: "browser-suite@darabiha.com", displayName: "Browser suite", exp: Math.floor(Date.now() / 1000) + 3600 }));
  12  |   const signature = b64url(createHmac("sha256", secret).update(payload).digest());
  13  |   return `${payload}.${signature}`;
  14  | }
  15  | 
  16  | test.beforeEach(async ({ context, baseURL }) => {
  17  |   await context.addCookies([{ name: "darabiha_session", value: viewerSessionCookie(), url: baseURL ?? "https://darabiha.com" }]);
  18  | });
  19  | 
  20  | async function openFullTree(page: Page) {
  21  |   await page.goto("/");
  22  |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  23  |   await page.locator(".tree-card").first().waitFor();
  24  | }
  25  | 
  26  | async function onCameraCard(page: Page): Promise<Locator> {
  27  |   const canvas = await page.locator(".family-canvas").boundingBox();
  28  |   if (!canvas) throw new Error("Family canvas is not visible");
  29  |   const cards = page.locator(".tree-card");
  30  |   for (let index = 0; index < await cards.count(); index += 1) {
  31  |     const box = await cards.nth(index).boundingBox();
  32  |     if (box && box.x + box.width > canvas.x && box.x < canvas.x + canvas.width && box.y + box.height > canvas.y + 64 && box.y < canvas.y + canvas.height) return cards.nth(index);
  33  |   }
  34  |   throw new Error("No family card is currently on camera");
  35  | }
  36  | 
  37  | async function emptyCanvasPoint(page: Page) {
  38  |   return page.locator(".family-canvas").evaluate((canvas) => {
  39  |     const rect = canvas.getBoundingClientRect();
  40  |     for (let y = rect.top + 90; y < rect.bottom - 80; y += 40) {
  41  |       for (let x = rect.left + 40; x < rect.right - 40; x += 40) {
  42  |         if (document.elementFromPoint(x, y)?.classList.contains("canvas-hit-surface")) return { x, y };
  43  |       }
  44  |     }
  45  |     throw new Error("No empty canvas point is on camera");
  46  |   });
  47  | }
  48  | 
  49  | test("public tree renders as an interactive canvas beside the archive chat", async ({ page }) => {
  50  |   await openFullTree(page);
  51  |   await expect(page.locator(".family-canvas")).toBeVisible();
  52  |   await expect(page.locator(".chat-sidebar")).toBeVisible();
  53  |   expect(await page.locator(".tree-card").count()).toBeGreaterThan(0);
  54  |   await expect(page.locator(".tree-connectors line")).not.toHaveCount(0);
  55  |   await expect(page.locator(".public-chat")).toBeVisible();
  56  | });
  57  | 
  58  | test("chat sidebar collapses and returns from the left edge", async ({ page }) => {
  59  |   await page.goto("/");
  60  |   const sidebar = page.locator(".chat-sidebar");
  61  |   await sidebar.getByRole("button", { name: "Collapse family chat" }).click();
> 62  |   await expect(sidebar).toHaveClass(/is-collapsed/);
      |                         ^ Error: expect(locator).toHaveClass(expected) failed
  63  |   await expect(page.locator(".chat-edge-reveal")).toHaveClass(/is-visible/);
  64  |   await page.locator(".chat-edge-reveal").click();
  65  |   await expect(sidebar).not.toHaveClass(/is-collapsed/);
  66  | });
  67  | 
  68  | test("a person card opens a navigable record", async ({ page }) => {
  69  |   await openFullTree(page);
  70  |   await (await onCameraCard(page)).click();
  71  |   await expect(page.getByRole("dialog")).toBeVisible();
  72  |   await expect(page.locator(".person-panel")).toBeVisible();
  73  |   await expect(page.locator(".person-modal-v2 h2")).toBeVisible();
  74  | });
  75  | 
  76  | test("canvas wheel pans the camera without scrolling the document", async ({ page }) => {
  77  |   await openFullTree(page);
  78  |   const canvas = page.locator(".family-canvas");
  79  |   await canvas.hover();
  80  |   const before = await page.locator(".tree-viewport").evaluate((element) => element.style.transform);
  81  |   await page.mouse.wheel(0, -300);
  82  |   await expect.poll(() => page.locator(".tree-viewport").evaluate((element) => element.style.transform)).not.toBe(before);
  83  |   await expect(canvas).toHaveCSS("touch-action", "none");
  84  |   await expect(page.locator("html")).toHaveCSS("overscroll-behavior", "none");
  85  | });
  86  | 
  87  | test("canvas zoom buttons scale the viewport", async ({ page }) => {
  88  |   await openFullTree(page);
  89  |   const scaleOf = () => page.locator(".tree-viewport").evaluate((element) => Number(element.style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1));
  90  |   expect(await scaleOf()).toBeCloseTo(1, 5);
  91  |   await page.getByRole("button", { name: "Zoom in" }).first().click();
  92  |   await expect.poll(scaleOf).toBeGreaterThan(1.05);
  93  |   await page.getByRole("button", { name: "Zoom out" }).first().click();
  94  |   await page.getByRole("button", { name: "Zoom out" }).first().click();
  95  |   await expect.poll(scaleOf).toBeLessThan(1);
  96  | });
  97  | 
  98  | test("zoom controls do not show the canvas hand cursor", async ({ page }) => {
  99  |   await openFullTree(page);
  100 |   const zoomIn = page.getByRole("button", { name: "Zoom in" });
  101 |   await zoomIn.hover();
  102 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "false");
  103 | });
  104 | 
  105 | test("canvas and cards expose distinct cursor affordances", async ({ page }) => {
  106 |   await openFullTree(page);
  107 |   await expect(page.locator(".family-canvas")).toHaveAttribute("data-interactive", "true");
  108 |   await expect(page.locator(".family-canvas")).toHaveCSS("cursor", "none");
  109 |   await expect(page.locator(".canvas-hit-surface")).toHaveCSS("cursor", "none");
  110 |   await expect(page.locator(".tree-card").first()).toHaveCSS("cursor", "none");
  111 | });
  112 | 
  113 | test("live page exposes an uncached deployment identity", async ({ page }) => {
  114 |   await page.goto("/");
  115 |   const build = await page.locator("main[data-build-id]").getAttribute("data-build-id");
  116 |   const version = await page.locator("main[data-version]").getAttribute("data-version");
  117 |   expect(build).toMatch(/^[0-9a-f]{7,}$/);
  118 |   expect(version).toBe("138");
  119 |   const response = await page.request.get("/api/version");
  120 |   expect(response.ok()).toBeTruthy();
  121 |   expect((await response.json()).build).toBe(build);
  122 |   expect(response.headers()["cache-control"]).toContain("no-store");
  123 | });
  124 | 
  125 | test("timeline and map are generated from the same public family records", async ({ page }) => {
  126 |   await page.goto("/");
  127 |   await page.getByRole("button", { name: "Timeline" }).click();
  128 |   await expect(page.getByRole("region", { name: "Family timeline" })).toBeVisible();
  129 |   await page.getByRole("button", { name: "Map" }).click();
  130 |   await expect(page.getByRole("region", { name: "Family places" })).toBeVisible();
  131 |   // the map opens by framing itself on the family's places; measuring a pan
  132 |   // before that lands measures the framing instead
  133 |   await expect(page.locator(".world-map")).toHaveAttribute("data-framed", "true");
  134 |   // the map pans and zooms like the other canvases
  135 |   const mapScale = () => page.locator(".world-map-layer").evaluate((element) => Number((element as HTMLElement).style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1));
  136 |   await page.getByRole("group", { name: "Map zoom controls" }).getByRole("button", { name: "Zoom in" }).click();
  137 |   await expect.poll(mapScale).toBeGreaterThan(1.05);
  138 |   // the map opens framed on the family's places, so the pan is a delta from
  139 |   // wherever that framing put it, not an absolute offset
  140 |   const panOf = () => page.locator(".world-map-layer").evaluate((element) => {
  141 |     const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((element as HTMLElement).style.transform);
  142 |     return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) };
  143 |   });
  144 |   const beforePan = await panOf();
  145 |   const mapBox = await page.locator(".world-map").boundingBox();
  146 |   await page.mouse.move(mapBox!.x + mapBox!.width / 2, mapBox!.y + mapBox!.height / 2);
  147 |   await page.mouse.down();
  148 |   await page.mouse.move(mapBox!.x + mapBox!.width / 2 + 80, mapBox!.y + mapBox!.height / 2 + 40, { steps: 3 });
  149 |   await page.mouse.up();
  150 |   await expect.poll(async () => {
  151 |     const now = await panOf();
  152 |     return { dx: Math.round(now.x - beforePan.x), dy: Math.round(now.y - beforePan.y) };
  153 |   }).toEqual({ dx: 80, dy: 40 });
  154 |   // a city opens as a list of its people; a row opens the profile; closing it returns to the list
  155 |   await page.locator(".map-marker").first().click();
  156 |   await expect(page.locator(".place-panel")).toBeVisible();
  157 |   expect(await page.locator(".place-person-row").count()).toBeGreaterThan(0);
  158 |   await page.locator(".place-person-row").first().click();
  159 |   await expect(page.locator(".person-modal-v2 h2")).toBeVisible();
  160 |   await page.locator(".person-panel-bar .person-nav-close").click();
  161 |   await expect(page.locator(".place-panel")).toBeVisible();
  162 |   await page.getByRole("button", { name: "Tree" }).click();
```