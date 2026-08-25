# Darabiha handoff

## Current state

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
