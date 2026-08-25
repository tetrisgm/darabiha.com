# Darabiha handoff

## Current state

- Public GitHub repository: `https://github.com/tetrisgm/darabiha.com`.
- The public tree is backed by D1. Uploaded evidence is stored privately in R2.
- Family editors authenticate with ChatGPT and are allowlisted through the `EDITOR_EMAILS` runtime variable.
- The sidebar uses the OpenAI Responses API with function tools. It creates reviewable proposals; a separate authenticated endpoint applies approved changes and records an audit entry.
- Raw uploads are available only to allowlisted editors. The OpenAI key is server-side only.
- The current tree intentionally contains no invented family data.

## Deployment inputs still needed

- An `OPENAI_API_KEY` created through the OpenAI Developers integration and saved as a Sites secret.
- The comma-separated ChatGPT account emails that may edit the tree, saved as `EDITOR_EMAILS`.
- Public deployment approval after the resolved Sites access level is shown.

## Validation

- `npm run lint` passes.
- `npm run build` passes.
- Public tree reads return 200 and anonymous mutation requests return 401 in local preview.
