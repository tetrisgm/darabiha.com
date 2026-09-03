# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webmcp.spec.ts >> the page registers its WebMCP tools with the browser agent
- Location: tests/browser/webmcp.spec.ts:41:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: "show_person_on_canvas"
Received array: []

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - navigation "Archive view" [ref=e4]:
      - button "Tree" [ref=e5] [cursor=pointer]
      - button "Family" [ref=e6] [cursor=pointer]
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
      - button "Account menu" [ref=e20] [cursor=pointer]: ···
  - generic [ref=e21]:
    - complementary "Family chat" [ref=e22]:
      - generic [ref=e23]:
        - button "Collapse family chat" [ref=e26] [cursor=pointer]
        - generic [ref=e30]:
          - generic [ref=e31]:
            - paragraph [ref=e32]: Who are you in the tree?
            - button "Not now" [ref=e33] [cursor=pointer]: ×
          - paragraph [ref=e34]: Type your name. Once the archive knows where you stand, it opens on you rather than on the founders.
          - textbox "Your name in the family tree" [ref=e35]:
            - /placeholder: Your name
        - generic [ref=e36]:
          - generic [ref=e37]:
            - heading "The Darabiha family tree" [level=3] [ref=e38]
            - paragraph [ref=e39]: Explore our family history, ask about the people and relationships in the tree, and discover the stories recorded here.
            - button "From the archive 415 people are recorded here, spanning roughly 8 generations." [disabled] [ref=e40]:
              - generic [ref=e41]: From the archive
              - generic [ref=e42]: 415 people are recorded here, spanning roughly 8 generations.
            - generic [ref=e43]:
              - button "The archive holds 14 family stories, kept in the language they were written in with an English translation beside them. What stories does the archive hold, and who is in them?" [ref=e44] [cursor=pointer]:
                - generic [ref=e45]: The archive holds 14 family stories, kept in the language they were written in with an English translation beside them.
                - generic [ref=e46]: What stories does the archive hold, and who is in them?
              - button "Half of the 11 completed lives in the archive reached 83 years or more. Which lives in the family were the longest, and which ended early?" [ref=e47] [cursor=pointer]:
                - generic [ref=e48]: Half of the 11 completed lives in the archive reached 83 years or more.
                - generic [ref=e49]: Which lives in the family were the longest, and which ended early?
              - 'button "Two family names run through the archive: Darabi, carried by 54 people, and Jaberian, carried by 38. How did the Darabi and Jaberian families come together?" [ref=e50] [cursor=pointer]':
                - generic [ref=e51]: "Two family names run through the archive: Darabi, carried by 54 people, and Jaberian, carried by 38."
                - generic [ref=e52]: How did the Darabi and Jaberian families come together?
            - paragraph [ref=e53]: You're signed in, but this Apple account isn't authorized to edit this family tree.
          - generic [ref=e55]:
            - textbox "Search the family archive" [ref=e56]:
              - /placeholder: Who are the children of…?
            - button "Send message" [disabled] [ref=e57]: ↑
    - button "Show family chat": ›
    - application "Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." [ref=e63]:
      - generic: parent marriage
      - group "Canvas zoom controls" [ref=e65]:
        - button "Zoom out" [ref=e66] [cursor=pointer]: −
        - button "Zoom in" [ref=e67] [cursor=pointer]: ＋
      - generic:
        - button "Open Abbas Darabi" [ref=e68]:
          - generic [ref=e70]:
            - strong [ref=e71]: Abbas Darabi
            - generic [ref=e72]: Birth date unknown
        - button "Open Ategheh Khanom" [ref=e73]:
          - generic [ref=e79]:
            - strong [ref=e80]: Ategheh Khanom
            - generic [ref=e81]: Birth date unknown
        - button "Open Ebrahim Masoudi" [ref=e82]:
          - generic [ref=e88]:
            - strong [ref=e89]: Ebrahim Masoudi
            - generic [ref=e90]: Birth date unknown
        - button "Open Esmail Masoudi" [ref=e91]:
          - generic [ref=e97]:
            - strong [ref=e98]: Esmail Masoudi
            - generic [ref=e99]: Birth date unknown
        - button "Open Farrokhandeh" [ref=e100]:
          - generic [ref=e106]:
            - strong [ref=e107]: Farrokhandeh
            - generic [ref=e108]: Birth date unknown
        - button "Open Fatemeh Darabi" [ref=e109]:
          - generic [ref=e115]:
            - strong [ref=e116]: Fatemeh Darabi
            - generic [ref=e117]: Born 1889 · Qazvin, Iran
        - button "Open Fatemeh Massoudi" [ref=e118]:
          - generic [ref=e124]:
            - strong [ref=e125]: Fatemeh Massoudi
            - generic [ref=e126]: Birth date unknown
        - button "Open Ghassem Darabi" [ref=e127]:
          - generic [ref=e129]:
            - strong [ref=e130]: Ghassem Darabi
            - generic [ref=e131]: Born 1903 · Qazvin, Iran
        - button "Open Haj Agha" [ref=e132]:
          - generic [ref=e138]:
            - strong [ref=e139]: Haj Agha
            - generic [ref=e140]: Birth date unknown
        - button "Open Haj Chorok" [ref=e141]:
          - generic [ref=e147]:
            - strong [ref=e148]: Haj Chorok
            - generic [ref=e149]: Born 1720 · Darab, Iran
        - button "Open Haj Khalil" [ref=e150]:
          - generic [ref=e156]:
            - strong [ref=e157]: Haj Khalil
            - generic [ref=e158]: Birth date unknown
        - button "Open Haj Mirza Agha Masoudi" [ref=e159]:
          - generic [ref=e165]:
            - strong [ref=e166]: Haj Mirza Agha Masoudi
            - generic [ref=e167]: Birth date unknown
        - button "Open Haj Ramazan Jaberian" [ref=e168]:
          - generic [ref=e174]:
            - strong [ref=e175]: Haj Ramazan Jaberian
            - generic [ref=e176]: Birth date unknown
        - button "Open Hossein Zehtab Darabi" [ref=e177]:
          - generic [ref=e179]:
            - strong [ref=e180]: Hossein Zehtab Darabi
            - generic [ref=e181]: Born 1882 · Qazvin, Iran
        - button "Open Mahmoud Masoudi" [ref=e182]:
          - generic [ref=e188]:
            - strong [ref=e189]: Mahmoud Masoudi
            - generic [ref=e190]: Birth date unknown
        - button "Open Masoumeh Masoudi" [ref=e191]:
          - generic [ref=e197]:
            - strong [ref=e198]: Masoumeh Masoudi
            - generic [ref=e199]: Birth date unknown
        - button "Open Mehdi Zehtab" [ref=e200]:
          - generic [ref=e206]:
            - strong [ref=e207]: Mehdi Zehtab
            - generic [ref=e208]: Birth date unknown
        - button "Open Mohammad Zehtab Darabi" [ref=e209]:
          - generic [ref=e215]:
            - strong [ref=e216]: Mohammad Zehtab Darabi
            - generic [ref=e217]: Born 1856 · Qazvin, Iran
        - button "Open Ramazan Darabi" [ref=e218]:
          - generic [ref=e224]:
            - strong [ref=e225]: Ramazan Darabi
            - generic [ref=e226]: Born 1893 · Qazvin, Iran
        - button "Open Robabeh Masoudi" [ref=e227]:
          - generic [ref=e233]:
            - strong [ref=e234]: Robabeh Masoudi
            - generic [ref=e235]: Born 1912
        - button "Open Sakineh Khanom" [ref=e236]:
          - generic [ref=e242]:
            - strong [ref=e243]: Sakineh Khanom
            - generic [ref=e244]: Birth date unknown
        - button "Open Salameh" [ref=e245]:
          - generic [ref=e251]:
            - strong [ref=e252]: Salameh
            - generic [ref=e253]: Birth date unknown
        - button "Hide this branch" [ref=e254]: Hide branch
        - button "Hide this branch" [ref=e255]: Hide branch
        - button "Hide this branch" [ref=e256]: Hide branch
        - button "Hide this branch" [ref=e257]: Hide branch
        - button "Show 4 hidden family members" [ref=e258]: Show 4 more
        - button "Show 141 hidden family members" [ref=e259]: Show 141 more
        - button "Show 151 hidden family members" [ref=e260]: Show 151 more
        - button "Show 97 hidden family members" [ref=e261]: Show 97 more
        - button "Hide this branch" [ref=e262]: Hide branch
        - button "Hide this branch" [ref=e263]: Hide branch
  - generic "Archive version 211": Version 211
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import { execFileSync } from "node:child_process";
  3   | import { createHmac } from "node:crypto";
  4   | 
  5   | /** The page offers WebMCP tools to a browser-side agent
  6   |  * (navigator.modelContext). This installs a mock model-context BEFORE any app
  7   |  * script runs, so the registration the app performs on mount is captured
  8   |  * deterministically, then drives a tool and checks it moves the real UI -
  9   |  * the thing a hosted MCP server cannot do. */
  10  | 
  11  | function session(email: string): string {
  12  |   const secret = process.env.PLAYWRIGHT_SESSION_SECRET
  13  |     || execFileSync("security", ["find-generic-password", "-s", "darabiha-session-secret", "-w"]).toString().trim();
  14  |   const b64 = (input: Buffer | string) => Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  15  |   const payload = b64(JSON.stringify({ subject: "browser-suite", email, displayName: "Browser suite", exp: Math.floor(Date.now() / 1000) + 3600 }));
  16  |   return `${payload}.${b64(createHmac("sha256", secret).update(payload).digest())}`;
  17  | }
  18  | 
  19  | // runs before every app script on every navigation - the deterministic slot.
  20  | // Installed on document.modelContext (the surface the WebMCP Challenge rules
  21  | // name) to prove registration works there, not only on navigator.
  22  | async function installMockModelContext(page: Page) {
  23  |   await page.addInitScript(() => {
  24  |     const registry: Record<string, unknown> = {};
  25  |     (window as unknown as { __webmcp: Record<string, unknown> }).__webmcp = registry;
  26  |     Object.defineProperty(document, "modelContext", {
  27  |       configurable: true,
  28  |       value: {
  29  |         registerTool: (tool: { name: string }) => { registry[tool.name] = tool; },
  30  |         unregisterTool: (name: string) => { delete registry[name]; },
  31  |       },
  32  |     });
  33  |   });
  34  | }
  35  | 
  36  | test.beforeEach(async ({ context, page, baseURL }) => {
  37  |   await context.addCookies([{ name: "darabiha_session", value: session(process.env.PLAYWRIGHT_MEMBER_EMAIL || "browser-suite@darabiha.com"), url: baseURL ?? "https://darabiha.com" }]);
  38  |   await installMockModelContext(page);
  39  | });
  40  | 
  41  | test("the page registers its WebMCP tools with the browser agent", async ({ page }) => {
  42  |   await page.goto("/");
  43  |   await expect(page.locator('main[data-hydrated="true"]')).toBeAttached();
> 44  |   await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __webmcp: Record<string, unknown> }).__webmcp))).toContain("show_person_on_canvas");
      |                                                                                                                                    ^ Error: expect(received).toContain(expected) // indexOf
  45  |   const names = await page.evaluate(() => Object.keys((window as unknown as { __webmcp: Record<string, unknown> }).__webmcp).sort());
  46  |   expect(names).toEqual(["ask_the_archivist", "family_in_year", "family_origins", "how_am_i_related", "how_are_they_related", "life_of", "namesakes", "overview_of_family_tree", "person_details", "search_family", "show_person_on_canvas", "switch_view", "upcoming_family_dates"]);
  47  | });
  48  | 
  49  | test("a WebMCP tool call moves the real UI", async ({ page }) => {
  50  |   await page.goto("/");
  51  |   await expect(page.locator('main[data-hydrated="true"]')).toBeAttached();
  52  |   await page.locator(".tree-card").first().waitFor();
  53  | 
  54  |   // pick a real recorded name via the search tool, then show them on the canvas
  55  |   const someone = await page.evaluate(async () => {
  56  |     const tools = (window as unknown as { __webmcp: Record<string, { execute: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcp;
  57  |     const overview = await tools.overview_of_family_tree.execute({});
  58  |     return overview.content[0].text;
  59  |   });
  60  |   expect(someone).toContain("people");
  61  | 
  62  |   const opened = await page.evaluate(async () => {
  63  |     const tools = (window as unknown as { __webmcp: Record<string, { execute: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }> }).__webmcp;
  64  |     // first card's name from the DOM, then drive the tool to open it
  65  |     const name = document.querySelector(".tree-card [class]")?.textContent?.trim() || document.querySelector(".tree-card")?.textContent?.trim() || "";
  66  |     const result = await tools.show_person_on_canvas.execute({ name });
  67  |     return { name, result };
  68  |   });
  69  |   // the tool either opened a real person (record modal appears) or returned a
  70  |   // clear disambiguation/`not found` message - never a silent failure
  71  |   if (!opened.result.isError) {
  72  |     await expect(page.getByRole("dialog")).toBeVisible();
  73  |   } else {
  74  |     expect(opened.result.content[0].text).toMatch(/No one named|Several people/);
  75  |   }
  76  | });
  77  | 
  78  | test("in the sandbox, an agent builds the family the human is watching", async ({ page }) => {
  79  |   await page.goto("/demo");
  80  |   await page.locator(".tree-card").first().waitFor();
  81  |   const before = await page.locator(".tree-card").count();
  82  | 
  83  |   const built = await page.evaluate(async () => {
  84  |     const tools = (window as unknown as { __webmcp: Record<string, { execute: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }> }).__webmcp;
  85  |     const added = await tools.add_person.execute({ name: "Iris Rowan", birth_year: "1980", gender: "female" });
  86  |     const linked = await tools.link_parent.execute({ parent: "Maya Rowan", child: "Iris Rowan" });
  87  |     const family = await tools.list_family.execute({});
  88  |     return { added: added.content[0].text, linked: linked.content[0].text, family: family.content[0].text };
  89  |   });
  90  |   expect(built.added).toContain("Iris Rowan");
  91  |   expect(built.linked).toContain("parent of Iris Rowan");
  92  |   expect(built.family).toContain("Iris Rowan (1980)");
  93  | 
  94  |   // the canvas the human watches grew, and the sidebar narrates the agent
  95  |   await expect.poll(() => page.locator(".tree-card").count()).toBeGreaterThan(before);
  96  |   await expect(page.locator("[data-demo-message]")).toContainText("🤖");
  97  | 
  98  |   // and the human's undo takes the agent's work back out
  99  |   const undone = await page.evaluate(async () => {
  100 |     const tools = (window as unknown as { __webmcp: Record<string, { execute: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> }).__webmcp;
  101 |     await tools.undo.execute({});
  102 |     await tools.undo.execute({});
  103 |     return (await tools.list_family.execute({})).content[0].text;
  104 |   });
  105 |   expect(undone).not.toContain("Iris");
  106 | });
  107 | 
```