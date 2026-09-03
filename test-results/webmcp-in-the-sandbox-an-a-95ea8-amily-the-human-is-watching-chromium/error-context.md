# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webmcp.spec.ts >> in the sandbox, an agent builds the family the human is watching
- Location: tests/browser/webmcp.spec.ts:78:1

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'execute')
    at eval (eval at evaluate (:311:30), <anonymous>:3:42)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- main [ref=e2]:
  - complementary [ref=e3]:
    - link "← Back to the archive" [ref=e4] [cursor=pointer]:
      - /url: /
    - generic [ref=e5]:
      - paragraph [ref=e6]: Safe sample
      - heading "Meet the family archivist." [level=1] [ref=e7]
      - paragraph [ref=e8]: "Try the core loop with synthetic records: import a structured family file, inspect the graph, and undo it."
    - generic [ref=e9]:
      - strong [ref=e10]: Archivist
      - paragraph [ref=e11]: This sandbox uses invented people and resets in your browser.
    - generic [ref=e12]:
      - button "Import sample GEDCOM" [ref=e13] [cursor=pointer]
      - button "Reset" [ref=e14] [cursor=pointer]
  - region "Synthetic family tree" [ref=e15]:
    - application "Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." [ref=e16]:
      - generic: parent marriage
      - group "Canvas zoom controls" [ref=e18]:
        - button "Zoom out" [ref=e19] [cursor=pointer]: −
        - button "Zoom in" [ref=e20] [cursor=pointer]: ＋
      - generic:
        - button "Open Maya Rowan" [ref=e21]:
          - generic [ref=e27]:
            - strong [ref=e28]: Maya Rowan
            - generic [ref=e29]: Born 1952
        - button "Open Leo Rowan" [ref=e30]:
          - generic [ref=e36]:
            - strong [ref=e37]: Leo Rowan
            - generic [ref=e38]: Born 1950
```