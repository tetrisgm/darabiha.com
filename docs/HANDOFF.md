# Darabiha handoff

## Current state

- Commit `4c5df47` adds clickable person cards, relationship-aware detail dialogs, editor-only person editing, and private photo upload/public image delivery. Commit `90a4074` registers the Sites project in `.openai/hosting.json`.

- Public GitHub repository: `https://github.com/tetrisgm/darabiha.com`.
- The public tree is backed by D1. Uploaded evidence is stored privately in R2.
- Family editors authenticate with Sign in with Apple and are allowlisted through the `EDITOR_EMAILS` runtime variable.
- The sidebar uses the OpenAI Responses API with function tools. It creates reviewable proposals; a separate authenticated endpoint applies approved changes and records an audit entry.
- Raw uploads are available only to allowlisted editors. The OpenAI key is server-side only.
- The current tree intentionally contains no invented family data.

## Deployment inputs still needed

- Sites version creation is currently blocked because the newly issued short-lived source-repository credential is rejected by the bound Git endpoint (HTTP 403). No runtime secrets were changed.

- An `OPENAI_API_KEY` created through the OpenAI Developers integration and saved as a Sites secret.
- Apple web authentication values (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `AUTH_SESSION_SECRET`, and `PUBLIC_ORIGIN`).
- The comma-separated Apple Account emails that may edit the tree, saved as `EDITOR_EMAILS`.
- The Apple Services ID and `https://darabiha.com/api/auth/apple/callback` return URL still need to be registered in the Apple Developer console. The currently available browser is logged out of that console.
- Public deployment approval after the resolved Sites access level is shown.

## Validation

- `npm run lint` passes.
- `npm run build` passes.
- Public tree reads return 200 and anonymous mutation requests return 401 in local preview.
