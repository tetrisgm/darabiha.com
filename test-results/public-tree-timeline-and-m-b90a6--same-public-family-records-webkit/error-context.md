# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-tree.spec.ts >> timeline and map are generated from the same public family records
- Location: tests/browser/public-tree.spec.ts:125:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Object {
-   "dx": 80,
-   "dy": 40,
+   "dx": -198,
+   "dy": 270,
  }

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - button "Go to the Family view" [ref=e4] [cursor=pointer]: Darabiha
    - navigation "Archive view" [ref=e5]:
      - button "Family" [ref=e6] [cursor=pointer]
      - button "Tree" [ref=e7] [cursor=pointer]
      - button "List" [ref=e8] [cursor=pointer]
      - button "Timeline" [ref=e9] [cursor=pointer]
      - button "Calendar" [ref=e10] [cursor=pointer]
      - button "Map" [ref=e11] [cursor=pointer]
      - button "Numbers" [ref=e12] [cursor=pointer]
    - generic [ref=e13]:
      - group "Language" [ref=e14]:
        - button "English" [pressed] [ref=e15] [cursor=pointer]:
          - generic [ref=e16]: 🇬🇧
        - button "فارسی" [ref=e17] [cursor=pointer]:
          - generic [ref=e18]: 🇮🇷
        - button "Français" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: 🇫🇷
      - searchbox "Find a person…" [ref=e22]
      - button "Account menu" [ref=e23] [cursor=pointer]: ···
  - generic [ref=e24]:
    - complementary "Family chat" [ref=e25]:
      - generic [ref=e26]:
        - button "Collapse family chat" [ref=e29] [cursor=pointer]
        - generic [ref=e33]:
          - generic [ref=e34]:
            - heading "The Darabiha family tree" [level=3] [ref=e35]
            - paragraph [ref=e36]: Explore our family history, ask about the people and relationships in the tree, and discover the stories recorded here.
            - button "From the archive The archive holds 14 family stories, kept in the Persian they were written in with an English translation beside them." [disabled] [ref=e37]:
              - generic [ref=e38]: From the archive
              - generic [ref=e39]: The archive holds 14 family stories, kept in the Persian they were written in with an English translation beside them.
            - generic [ref=e40]:
              - button "Tell me the story of The dedication" [ref=e41] [cursor=pointer]
              - button "How is Abbas Darabi related to Asadollah Jaberian?" [ref=e42] [cursor=pointer]
              - button "Which records are missing birth dates?" [ref=e43] [cursor=pointer]
            - paragraph [ref=e44]: You're signed in, but this Apple account isn't authorized to edit this family tree.
          - generic [ref=e46]:
            - textbox "Search the family archive" [ref=e47]:
              - /placeholder: Who are the children of…?
            - button "Send message" [disabled] [ref=e48]: ↑
    - button "Show family chat": ›
    - region "Family places" [ref=e54]:
      - img "World map with recorded family locations" [ref=e55]:
        - group "Map zoom controls" [ref=e56]:
          - button "Zoom out" [ref=e57] [cursor=pointer]: −
          - button "Zoom in" [ref=e58] [cursor=pointer]: ＋
        - generic [ref=e60]:
          - 'button "Darab, Iran: Haj Chorok" [ref=e238] [cursor=pointer]':
            - generic [ref=e239]: "1"
            - strong [ref=e240]: Darab, Iran
          - 'button "Paris: Parissima Darabiha, Ramine Darabiha" [ref=e241] [cursor=pointer]':
            - generic [ref=e242]: "2"
            - strong [ref=e243]: Paris
          - 'button "Qazvin, Iran: Fatemeh Darabi, Ghassem Darabi, Hossein Zehtab Darabi, Mohammad Zehtab Darabi, Nasser Darabiha, Ramazan Darabi" [ref=e244] [cursor=pointer]':
            - generic [ref=e245]: "6"
            - strong [ref=e246]: Qazvin, Iran
          - 'button "Tehran, Iran: Ghassem Darabi, Majid Darabiha" [ref=e247] [cursor=pointer]':
            - generic [ref=e248]: "2"
            - strong: Tehran, Iran
  - generic "Darabiha version 120": Version 120
```

# Test source

```ts
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
  62  |   await expect(sidebar).toHaveClass(/is-collapsed/);
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
  118 |   expect(version).toBe("120");
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
  131 |   // the map pans and zooms like the other canvases
  132 |   const mapScale = () => page.locator(".world-map-layer").evaluate((element) => Number((element as HTMLElement).style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1));
  133 |   await page.getByRole("group", { name: "Map zoom controls" }).getByRole("button", { name: "Zoom in" }).click();
  134 |   await expect.poll(mapScale).toBeGreaterThan(1.05);
  135 |   // the map opens framed on the family's places, so the pan is a delta from
  136 |   // wherever that framing put it, not an absolute offset
  137 |   const panOf = () => page.locator(".world-map-layer").evaluate((element) => {
  138 |     const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((element as HTMLElement).style.transform);
  139 |     return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) };
  140 |   });
  141 |   const beforePan = await panOf();
  142 |   const mapBox = await page.locator(".world-map").boundingBox();
  143 |   await page.mouse.move(mapBox!.x + mapBox!.width / 2, mapBox!.y + mapBox!.height / 2);
  144 |   await page.mouse.down();
  145 |   await page.mouse.move(mapBox!.x + mapBox!.width / 2 + 80, mapBox!.y + mapBox!.height / 2 + 40, { steps: 3 });
  146 |   await page.mouse.up();
  147 |   await expect.poll(async () => {
  148 |     const now = await panOf();
  149 |     return { dx: Math.round(now.x - beforePan.x), dy: Math.round(now.y - beforePan.y) };
> 150 |   }).toEqual({ dx: 80, dy: 40 });
      |      ^ Error: expect(received).toEqual(expected) // deep equality
  151 |   // a city opens as a list of its people; a row opens the profile; closing it returns to the list
  152 |   await page.locator(".map-marker").first().click();
  153 |   await expect(page.locator(".place-panel")).toBeVisible();
  154 |   expect(await page.locator(".place-person-row").count()).toBeGreaterThan(0);
  155 |   await page.locator(".place-person-row").first().click();
  156 |   await expect(page.locator(".person-modal-v2 h2")).toBeVisible();
  157 |   await page.locator(".person-panel-bar .person-nav-close").click();
  158 |   await expect(page.locator(".place-panel")).toBeVisible();
  159 |   await page.getByRole("button", { name: "Tree" }).click();
  160 |   await expect(page.locator(".family-canvas")).toBeVisible();
  161 | });
  162 | 
  163 | test("Safari gets a visible custom grab cursor and clickable-card cursor", async ({ page }) => {
  164 |   await openFullTree(page);
  165 |   const canvas = page.locator(".family-canvas");
  166 |   await expect(canvas).toHaveAttribute("data-interactive", "true");
  167 |   await expect(canvas).toBeVisible();
  168 |   const emptyPoint = await emptyCanvasPoint(page);
  169 |   await page.mouse.move(emptyPoint.x, emptyPoint.y);
  170 |   expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("canvas-hit-surface"), emptyPoint)).toBe(true);
  171 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "grab");
  172 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "true");
  173 |   await expect(page.locator(".tree-custom-cursor")).toHaveCSS("opacity", "1");
  174 |   const card = await onCameraCard(page);
  175 |   await card.hover();
  176 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "pointer");
  177 |   // branch chips carry their own cursor rule and once showed the native hand
  178 |   // on top of the app-drawn one; they must behave exactly like cards
  179 |   const chips = page.locator(".branch-chip");
  180 |   for (let index = 0; index < await chips.count(); index += 1) {
  181 |     const chipBox = await chips.nth(index).boundingBox();
  182 |     const canvasBox = await canvas.boundingBox();
  183 |     if (!chipBox || !canvasBox || chipBox.y < canvasBox.y + 64 || chipBox.y + chipBox.height > canvasBox.y + canvasBox.height) continue;
  184 |     await expect(chips.nth(index)).toHaveCSS("cursor", "none");
  185 |     await chips.nth(index).hover();
  186 |     await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "pointer");
  187 |     await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "true");
  188 |     break;
  189 |   }
  190 |   const text = card.locator("strong");
  191 |   const box = await text.boundingBox();
  192 |   expect(box).not.toBeNull();
  193 |   await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  194 |   expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".tree-card") !== null, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 })).toBe(true);
  195 | });
  196 | 
  197 | test("dragging the dedicated surface pans while a card remains clickable", async ({ page }) => {
  198 |   await openFullTree(page);
  199 |   await expect(page.locator(".family-canvas")).toHaveAttribute("data-interactive", "true");
  200 |   await expect(page.locator(".family-canvas")).toBeVisible();
  201 |   const viewport = page.locator(".tree-viewport");
  202 |   const before = await viewport.getAttribute("style");
  203 |   const start = await emptyCanvasPoint(page);
  204 |   await page.mouse.move(start.x, start.y);
  205 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-visible", "true");
  206 |   await page.mouse.down();
  207 |   await page.mouse.move(start.x + 100, start.y + 70, { steps: 4 });
  208 |   await expect(page.locator(".family-canvas")).toHaveAttribute("data-panning", "true");
  209 |   await expect(page.locator(".tree-custom-cursor")).toHaveAttribute("data-mode", "grabbing");
  210 |   await page.mouse.up();
  211 |   await expect(viewport).not.toHaveAttribute("style", before!);
  212 |   await expect(page.locator(".family-canvas")).toHaveAttribute("data-panning", "false");
  213 |   await (await onCameraCard(page)).click();
  214 |   await expect(page.getByRole("dialog")).toBeVisible();
  215 | });
  216 | 
  217 | test("the settings page offers sign-in and explains member roles", async ({ browser, baseURL }) => {
  218 |   const anonymous = await browser.newContext({ baseURL: baseURL ?? "https://darabiha.com" });
  219 |   const page = await anonymous.newPage();
  220 |   await page.goto("/settings");
  221 |   await expect(page.locator("h1")).toHaveText("Settings");
  222 |   await expect(page.getByText("Sign in with Apple")).toBeVisible();
  223 |   await anonymous.close();
  224 | });
  225 | 
  226 | test("the members-only gate covers the tree and its APIs", async ({ request }) => {
  227 |   const tree = await request.get("/api/tree");
  228 |   test.skip(tree.status() === 200, "the site is currently in public visibility");
  229 |   expect(tree.status()).toBe(401);
  230 | });
  231 | 
  232 | test("member management refuses anonymous requests", async ({ request }) => {
  233 |   const listing = await request.get("/api/members");
  234 |   expect(listing.status()).toBe(401);
  235 |   // the Fill-in review queue is editor-gated the same way
  236 |   expect((await request.get("/api/questions")).status()).toBe(401);
  237 |   expect((await request.post("/api/questions", { data: { id: "oq-x", verdict: "confirm" } })).status()).toBe(401);
  238 |   const mutation = await request.post("/api/members", { data: { action: "set", email: "intruder@example.com", role: "admin" } });
  239 |   expect(mutation.status()).toBe(401);
  240 | });
  241 | 
  242 | test("site access settings are admin-gated", async ({ request }) => {
  243 |   const mutation = await request.post("/api/site", { data: { visibility: "members" } });
  244 |   expect(mutation.status()).toBe(401);
  245 |   // the tree endpoint answers deliberately in either visibility mode
  246 |   expect([200, 401]).toContain((await request.get("/api/tree")).status());
  247 | });
  248 | 
```