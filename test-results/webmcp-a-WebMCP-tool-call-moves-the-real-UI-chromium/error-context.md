# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webmcp.spec.ts >> a WebMCP tool call moves the real UI
- Location: tests/browser/webmcp.spec.ts:49:1

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'execute')
    at eval (eval at evaluate (:311:30), <anonymous>:3:58)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
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
            - paragraph [ref=e40]: You're signed in, but this Apple account isn't authorized to edit this family tree.
          - generic [ref=e42]:
            - textbox "Search the family archive" [ref=e43]:
              - /placeholder: Who are the children of…?
            - button "Send message" [disabled] [ref=e44]: ↑
    - button "Show family chat": ›
    - application "Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." [ref=e50]:
      - generic: parent marriage
      - group "Canvas zoom controls" [ref=e52]:
        - button "Zoom out" [ref=e53] [cursor=pointer]: −
        - button "Zoom in" [ref=e54] [cursor=pointer]: ＋
      - generic:
        - button "Open Abbas Darabi" [ref=e55]:
          - generic [ref=e57]:
            - strong [ref=e58]: Abbas Darabi
            - generic [ref=e59]: Birth date unknown
        - button "Open Ategheh Khanom" [ref=e60]:
          - generic [ref=e66]:
            - strong [ref=e67]: Ategheh Khanom
            - generic [ref=e68]: Birth date unknown
        - button "Open Ebrahim Masoudi" [ref=e69]:
          - generic [ref=e75]:
            - strong [ref=e76]: Ebrahim Masoudi
            - generic [ref=e77]: Birth date unknown
        - button "Open Esmail Masoudi" [ref=e78]:
          - generic [ref=e84]:
            - strong [ref=e85]: Esmail Masoudi
            - generic [ref=e86]: Birth date unknown
        - button "Open Farrokhandeh" [ref=e87]:
          - generic [ref=e93]:
            - strong [ref=e94]: Farrokhandeh
            - generic [ref=e95]: Birth date unknown
        - button "Open Fatemeh Darabi" [ref=e96]:
          - generic [ref=e102]:
            - strong [ref=e103]: Fatemeh Darabi
            - generic [ref=e104]: Born 1889 · Qazvin, Iran
        - button "Open Fatemeh Massoudi" [ref=e105]:
          - generic [ref=e111]:
            - strong [ref=e112]: Fatemeh Massoudi
            - generic [ref=e113]: Birth date unknown
        - button "Open Ghassem Darabi" [ref=e114]:
          - generic [ref=e116]:
            - strong [ref=e117]: Ghassem Darabi
            - generic [ref=e118]: Born 1903 · Qazvin, Iran
        - button "Open Haj Agha" [ref=e119]:
          - generic [ref=e125]:
            - strong [ref=e126]: Haj Agha
            - generic [ref=e127]: Birth date unknown
        - button "Open Haj Chorok" [ref=e128]:
          - generic [ref=e134]:
            - strong [ref=e135]: Haj Chorok
            - generic [ref=e136]: Born 1720 · Darab, Iran
        - button "Open Haj Khalil" [ref=e137]:
          - generic [ref=e143]:
            - strong [ref=e144]: Haj Khalil
            - generic [ref=e145]: Birth date unknown
        - button "Open Haj Mirza Agha Masoudi" [ref=e146]:
          - generic [ref=e152]:
            - strong [ref=e153]: Haj Mirza Agha Masoudi
            - generic [ref=e154]: Birth date unknown
        - button "Open Haj Ramazan Jaberian" [ref=e155]:
          - generic [ref=e161]:
            - strong [ref=e162]: Haj Ramazan Jaberian
            - generic [ref=e163]: Birth date unknown
        - button "Open Hossein Zehtab Darabi" [ref=e164]:
          - generic [ref=e166]:
            - strong [ref=e167]: Hossein Zehtab Darabi
            - generic [ref=e168]: Born 1882 · Qazvin, Iran
        - button "Open Mahmoud Masoudi" [ref=e169]:
          - generic [ref=e175]:
            - strong [ref=e176]: Mahmoud Masoudi
            - generic [ref=e177]: Birth date unknown
        - button "Open Masoumeh Masoudi" [ref=e178]:
          - generic [ref=e184]:
            - strong [ref=e185]: Masoumeh Masoudi
            - generic [ref=e186]: Birth date unknown
        - button "Open Mehdi Zehtab" [ref=e187]:
          - generic [ref=e193]:
            - strong [ref=e194]: Mehdi Zehtab
            - generic [ref=e195]: Birth date unknown
        - button "Open Mohammad Zehtab Darabi" [ref=e196]:
          - generic [ref=e202]:
            - strong [ref=e203]: Mohammad Zehtab Darabi
            - generic [ref=e204]: Born 1856 · Qazvin, Iran
        - button "Open Ramazan Darabi" [ref=e205]:
          - generic [ref=e211]:
            - strong [ref=e212]: Ramazan Darabi
            - generic [ref=e213]: Born 1893 · Qazvin, Iran
        - button "Open Robabeh Masoudi" [ref=e214]:
          - generic [ref=e220]:
            - strong [ref=e221]: Robabeh Masoudi
            - generic [ref=e222]: Born 1912
        - button "Open Sakineh Khanom" [ref=e223]:
          - generic [ref=e229]:
            - strong [ref=e230]: Sakineh Khanom
            - generic [ref=e231]: Birth date unknown
        - button "Open Salameh" [ref=e232]:
          - generic [ref=e238]:
            - strong [ref=e239]: Salameh
            - generic [ref=e240]: Birth date unknown
        - button "Hide this branch" [ref=e241]: Hide branch
        - button "Hide this branch" [ref=e242]: Hide branch
        - button "Hide this branch" [ref=e243]: Hide branch
        - button "Hide this branch" [ref=e244]: Hide branch
        - button "Show 4 hidden family members" [ref=e245]: Show 4 more
        - button "Show 141 hidden family members" [ref=e246]: Show 141 more
        - button "Show 151 hidden family members" [ref=e247]: Show 151 more
        - button "Show 97 hidden family members" [ref=e248]: Show 97 more
        - button "Hide this branch" [ref=e249]: Hide branch
        - button "Hide this branch" [ref=e250]: Hide branch
  - generic "Archive version 211": Version 211
```