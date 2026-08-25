# Darabiha handoff

## Current state

### Temporary open-editor test mode (2026-08-25)

- `app/authz.ts` has `TEMPORARY_OPEN_EDITOR = true` so unauthenticated visitors can use the full editor and mutation APIs while Apple sign-in is unavailable for testing.
- The switch is intentionally isolated and documented; set it to `false` to restore Apple sign-in and the `EDITOR_EMAILS` allowlist. Do not leave this mode enabled for a public production launch.

### 2026-08-25 Safari cursor diagnosis and Version 6

- Production is Version 6 (`BUILD_ID=825a006`), deployment `4f0a007d-acac-419c-8440-89a0169fd852`, commit `8d3f6ba`.
- Versions 2–5 relied on Safari installing native `pointer`, `grab`, and `grabbing` cursors. Safari Web Inspector reported the correct computed values and Playwright WebKit passed, but real Safari on macOS continued to render an arrow. Those computed-style assertions were not a valid visual cursor test.
- The tree now uses a Figma-style DOM cursor layer for fine pointers: the native cursor is hidden only inside the canvas, and an SVG open hand, closed hand, or pointing hand follows pointer events. Touch input is unaffected. Real Safari screenshots verified both the empty-canvas hand and clickable-card hand on Version 6.
- Cursor hit testing is also simplified to one full-canvas interaction surface. The transformed viewport and SVG connectors cannot intercept pointer events; person cards are the only other targets. The obsolete 300 ms global post-drag click lockout was removed, so a card can be opened immediately after panning.
- Production browser coverage now verifies the custom cursor is visible and switches modes, pointer capture pans the transformed viewport, a card opens after a pan, and the live deployment identity is uncached. All 14 Chromium/WebKit tests pass.

### 2026-08-25 production interaction pass

- Current production deployment is `7db6d666-5907-49b9-8aea-97ce8074357e` on `https://darabiha.com`.
- The tree is a single full-height 2D viewport beside the editor/chat rail. Cards are laid out by generation; spouse links are horizontal/dashed, while parent links use a shared junction and vertical descent to children.
- Canvas input uses pointer capture for click-drag panning, `touch-action: none`/overscroll suppression for trackpad and touch gestures, cursor-centered wheel/pinch zoom clamped to 0.5–3×, keyboard arrows, +/- and 0 reset, and click-vs-drag suppression. Cards remain keyboard-focusable buttons.
- Person cards use a museum-style record view. Related people navigate to their own records. Allowlisted editors can toggle labeled inline fields, add existing relationships with date/place disambiguation, remove direct relationships, and upload/change/remove portraits.
- AI editor submissions auto-apply all extracted changes. The sidebar shows a lightweight thinking state and keeps the tree as the source of truth; guests retain read-only archive questions.
- `npm run build`, `npm test`, `npm run lint`, and `npm run test:browser` pass. Vitest covers relationship resolution, generation layout, and cursor-centered viewport math. Playwright smoke tests run against the live deployment in both Chromium and WebKit (Safari’s engine), covering canvas rendering, card activation, connectors, sign-in affordance, and scroll containment.

- Commit `4c5df47` adds clickable person cards, relationship-aware detail dialogs, editor-only person editing, and private photo upload/public image delivery. Commit `90a4074` registers the Sites project in `.openai/hosting.json`.

- Public GitHub repository: `https://github.com/tetrisgm/darabiha.com`.
- The public tree is backed by D1. Uploaded evidence is stored privately in R2.
- Family editors authenticate with Sign in with Apple and are allowlisted through the `EDITOR_EMAILS` runtime variable.
- The sidebar uses the OpenAI Responses API with function tools. It creates reviewable proposals; a separate authenticated endpoint applies approved changes and records an audit entry.
- Raw uploads are available only to allowlisted editors. The OpenAI key is server-side only.
- The current tree intentionally contains no invented family data.
- Person records now include structured birth/death city and country fields alongside dates and legacy place text, making timeline and map views straightforward to add later. Person dialogs show these values and extended relatives.
- Anonymous visitors can ask read-only questions through `/api/ask`; only allowlisted editors can use the mutation-capable archivist and apply reviewed proposals.
- Direct Cloudflare deployment is live as Worker `darabiha-family`, routed on `darabiha.com/*`, with D1 database `darabiha-family` and R2 bucket `darabiha-family-files`. Live public checks: `/` and `/api/tree` return 200.
- Current deployed version `c2149c09-3a5d-448d-95e1-ecfe8bf5b405`; anonymous `/api/ask` returns a grounded answer over HTTPS.

## Deployment inputs still needed

- The Sites connector was bypassed because its source endpoint rejected its own short-lived credentials. Cloudflare deployment is the active production path.

- `OPENAI_API_KEY` is saved as a Cloudflare Worker secret.
- Apple web authentication values (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `AUTH_SESSION_SECRET`, and `PUBLIC_ORIGIN`).
- The comma-separated Apple Account emails that may edit the tree, saved as `EDITOR_EMAILS`.
- Apple Sign in with Apple is configured for the Darabiha-specific App ID `com.darabiha.web` and Services ID `com.darabiha.family`; `https://darabiha.com/api/auth/apple/callback` is registered and the live start endpoint returns 302 to Apple.

## Validation

- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes (Vitest relationship coverage).
- Public tree reads return 200 and anonymous mutation requests return 401 in local preview.
