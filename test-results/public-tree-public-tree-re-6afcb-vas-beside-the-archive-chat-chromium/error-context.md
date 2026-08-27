# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-tree.spec.ts >> public tree renders as an interactive canvas beside the archive chat
- Location: tests/browser/public-tree.spec.ts:49:1

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.waitFor: Test timeout of 20000ms exceeded.
Call log:
  - waiting for locator('.tree-card').first() to be visible

```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - navigation "Archive view" [ref=e4]:
      - button "Family" [ref=e5] [cursor=pointer]
      - button "Tree" [active] [ref=e6] [cursor=pointer]
      - button "List" [ref=e7] [cursor=pointer]
      - button "Timeline" [ref=e8] [cursor=pointer]
      - button "Calendar" [ref=e9] [cursor=pointer]
      - button "Map" [ref=e10] [cursor=pointer]
      - button "Numbers" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - group "Language" [ref=e13]:
        - button "English" [pressed] [ref=e14] [cursor=pointer]:
          - generic [ref=e15]: 🇬🇧
        - button "فارسی" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]: 🇮🇷
        - button "Français" [ref=e18] [cursor=pointer]:
          - generic [ref=e19]: 🇫🇷
      - searchbox "Find a person…" [ref=e21]
      - button "Account menu" [ref=e22] [cursor=pointer]: ···
  - generic [ref=e23]:
    - complementary "Family chat" [ref=e24]:
      - generic [ref=e25]:
        - button "Collapse family chat" [ref=e28] [cursor=pointer]
        - generic [ref=e32]:
          - generic [ref=e33]:
            - heading "The Darabiha family tree" [level=3] [ref=e34]
            - paragraph [ref=e35]: Explore our family history, ask about the people and relationships in the tree, and discover the stories recorded here.
            - button "From the archive The archive holds 14 family stories, kept in the Persian they were written in with an English translation beside them." [disabled] [ref=e36]:
              - generic [ref=e37]: From the archive
              - generic [ref=e38]: The archive holds 14 family stories, kept in the Persian they were written in with an English translation beside them.
            - generic [ref=e39]:
              - button "Tell me the story of The dedication" [ref=e40] [cursor=pointer]
              - button "How is Abbas Darabi related to Asadollah Jaberian?" [ref=e41] [cursor=pointer]
              - button "Which records are missing birth dates?" [ref=e42] [cursor=pointer]
            - paragraph [ref=e43]: You're signed in, but this Apple account isn't authorized to edit this family tree.
          - generic [ref=e45]:
            - textbox "Search the family archive" [ref=e46]:
              - /placeholder: Who are the children of…?
            - button "Send message" [disabled] [ref=e47]: ↑
    - button "Show family chat": ›
    - region "Family around one person" [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]:
          - button "Back" [ref=e56] [cursor=pointer]: ←
          - button "Forward" [ref=e57] [cursor=pointer]: →
        - paragraph: Click a person to center the tree on them and open their record.
      - group "Family zoom controls" [ref=e58]:
        - button "Zoom out" [ref=e59] [cursor=pointer]: −
        - button "Zoom in" [ref=e60] [cursor=pointer]: ＋
      - generic [ref=e63]:
        - generic [ref=e65]:
          - button "Children" [ref=e66]
          - generic [ref=e67]:
            - button "Ramine Darabiha b. 1983" [ref=e69]:
              - generic [ref=e74]:
                - strong [ref=e75]: Ramine Darabiha
                - generic [ref=e76]: b. 1983
            - button "Parissima Darabiha b. 1987" [ref=e78]:
              - generic [ref=e83]:
                - strong [ref=e84]: Parissima Darabiha
                - generic [ref=e85]: b. 1987
        - generic [ref=e87]:
          - button "Nasser Darabiha b. 1952" [ref=e89]:
            - generic [ref=e91]:
              - strong [ref=e92]: Nasser Darabiha
              - generic [ref=e93]: b. 1952
          - generic [ref=e94]:
            - generic [ref=e95]:
              - generic [ref=e96]: ⚭
              - button [ref=e98]:
                - strong [ref=e104]: Jila Darabiha
            - group [ref=e105]:
              - generic "Siblings (7)" [ref=e106]
              - button "Ashraf Darabi 1934–2019 6 more relatives - click to see them" [ref=e108]:
                - generic [ref=e113]:
                  - strong [ref=e114]: Ashraf Darabi
                  - generic [ref=e115]: 1934–2019
                - generic "6 more relatives - click to see them" [ref=e116]: "+6"
              - button "Effat Darabiha b. 1945 3 more relatives - click to see them" [ref=e118]:
                - generic [ref=e123]:
                  - strong [ref=e124]: Effat Darabiha
                  - generic [ref=e125]: b. 1945
                - generic "3 more relatives - click to see them" [ref=e126]: "+3"
              - button "Mohammad Karim Darabiha 1942–2012 5 more relatives - click to see them" [ref=e128]:
                - generic [ref=e133]:
                  - strong [ref=e134]: Mohammad Karim Darabiha
                  - generic [ref=e135]: 1942–2012
                - generic "5 more relatives - click to see them" [ref=e136]: "+5"
              - button "Kazem Darabiha 1931–2020 7 more relatives - click to see them" [ref=e138]:
                - generic [ref=e140]:
                  - strong [ref=e141]: Kazem Darabiha
                  - generic [ref=e142]: 1931–2020
                - generic "7 more relatives - click to see them" [ref=e143]: "+7"
              - button "Mohammad Rahim Darabi b. 1948 1 more relatives - click to see them" [ref=e145]:
                - generic [ref=e150]:
                  - strong [ref=e151]: Mohammad Rahim Darabi
                  - generic [ref=e152]: b. 1948
                - generic "1 more relatives - click to see them" [ref=e153]: "+1"
              - button "Reza Darabiha 1937–2020 6 more relatives - click to see them" [ref=e155]:
                - generic [ref=e160]:
                  - strong [ref=e161]: Reza Darabiha
                  - generic [ref=e162]: 1937–2020
                - generic "6 more relatives - click to see them" [ref=e163]: "+6"
              - button "Mohammad Taghi Darabi b. 1940 4 more relatives - click to see them" [ref=e165]:
                - generic [ref=e170]:
                  - strong [ref=e171]: Mohammad Taghi Darabi
                  - generic [ref=e172]: b. 1940
                - generic "4 more relatives - click to see them" [ref=e173]: "+4"
        - generic [ref=e175]:
          - button "Parents" [ref=e176]
          - button "Ghassem Darabi 1903–1979 4 more relatives - click to see them" [ref=e178]:
            - generic [ref=e180]:
              - strong [ref=e181]: Ghassem Darabi
              - generic [ref=e182]: 1903–1979
            - generic "4 more relatives - click to see them" [ref=e183]: "+4"
          - button "Robabeh Masoudi 1912–2003 4 more relatives - click to see them" [ref=e185]:
            - generic [ref=e190]:
              - strong [ref=e191]: Robabeh Masoudi
              - generic [ref=e192]: 1912–2003
            - generic "4 more relatives - click to see them" [ref=e193]: "+4"
        - generic [ref=e195]:
          - button "Grandparents" [ref=e196]
          - button "Mohammad Zehtab Darabi 1856–1939 4 more relatives - click to see them" [ref=e199]:
            - generic [ref=e204]:
              - strong [ref=e205]: Mohammad Zehtab Darabi
              - generic [ref=e206]: 1856–1939
            - generic "4 more relatives - click to see them" [ref=e207]: "+4"
          - button "Salmeh 4 more relatives - click to see them" [ref=e210]:
            - strong [ref=e216]: Salmeh
            - generic "4 more relatives - click to see them" [ref=e217]: "+4"
          - button "Haj Mirza Agha Masoudi 4 more relatives - click to see them" [ref=e220]:
            - strong [ref=e226]: Haj Mirza Agha Masoudi
            - generic "4 more relatives - click to see them" [ref=e227]: "+4"
          - button "＋ Add grandmother" [ref=e230]
        - generic [ref=e232]:
          - button "Great-grandparents" [ref=e233]
          - button "Haj Khalil 1 more relatives - click to see them" [ref=e235]:
            - strong [ref=e241]: Haj Khalil
            - generic "1 more relatives - click to see them" [ref=e242]: "+1"
  - generic "Darabiha version 128": Version 128
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
> 23  |   await page.locator(".tree-card").first().waitFor();
      |                                            ^ Error: locator.waitFor: Test timeout of 20000ms exceeded.
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
  118 |   expect(version).toBe("128");
  119 |   const response = await page.request.get("/api/version");
  120 |   expect(response.ok()).toBeTruthy();
  121 |   expect((await response.json()).build).toBe(build);
  122 |   expect(response.headers()["cache-control"]).toContain("no-store");
  123 | });
```