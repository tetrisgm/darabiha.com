# Darabiha launch readiness

Last audited: 2026-09-01 (production version 190)

## Product position

Darabiha is **the AI family archivist that turns whatever a family already has—documents, photos, recordings, old websites, GEDCOM files, and conversations—into a living, trustworthy family history.**

The launch story is not “another family-tree drawing tool.” The differentiator is an agent that can ingest messy family material, reconcile it against the current archive, explain what it changed, ask only when evidence is genuinely ambiguous, and leave the family with portable data.

## Launch sequence

1. **Hacker News first.** Lead with the real reconstruction of a 25-year-old, nested family-tree website. Show the ingestion pipeline, evidence model, deterministic export, privacy boundaries, failure modes, and tests. Provide a safe public sample that does not expose living relatives.
2. **Product Hunt after the general-family path is polished.** Lead with the emotional before/after, a short moving demo, a new-family onboarding path, collaboration, and a clear first successful action.

## Current system: verified, partial, missing

| Capability | State | Evidence / remaining work |
| --- | --- | --- |
| Interactive family-tree canvas | Verified | Pan, zoom, cards, branches, selection, branch expansion and hiding. Safari behavior must still be verified on the exact deployed build with a real pointer/trackpad. |
| Agent CRUD | Verified | The agent can propose create, update, delete, relationship, story, and attachment operations. Mutations cross validation and invariant boundaries and write the audit log. |
| Duplicate handling | Partial | `lib/agent-reconcile.ts` merges one compatible same-name record and surfaces ambiguous collisions. There is no explicit user-facing merge/split operation or durable adjudication record. |
| Recursive uploads | Verified | Folder structure and ZIP paths are preserved; supported extracted formats include HTML, CSS, JS, JSON, text, Markdown, CSV, XML, GEDCOM, and common raster images. |
| Ingestion reliability | Partial | Queue statuses and visible failures exist. Large work is bounded, but ingestion is not resumable from a durable per-item checkpoint and lacks user-triggered retry/cancel controls. |
| Provenance | Missing at claim level | Files and story attachments survive as evidence, but a name/date/place/relationship cannot identify the source passage or person who asserted it. |
| Confidence and contradictions | Partial | Import-time conflicts become open questions. Confidence is not persisted per claim, and competing claims cannot coexist without overwriting the person row. |
| Audit history | Verified, not reversible | Every mutation writes `change_log`; history is editor-only. Payloads are not a complete before/after transaction and cannot reliably undo a change. |
| GEDCOM portability | Verified core | Deterministic GEDCOM 5.5.1/7 parsing runs before the model for direct files and nested ZIP/GEDZip entries, emits an import report, and has round-trip coverage for supported people, events, notes, residences, parent links, and spouse links. Rich GEDCOM source/media extensions remain a documented limitation. |
| Privacy and ownership | Partial | Public/member/password visibility, roles, private cache controls, export, record deletion, and D1-backed per-address limits for public AI and password attempts exist. Living-person redaction, whole-archive deletion, and explicit ownership copy remain. |
| General onboarding | Missing | Production is one Darabiha archive. There is no create-a-family flow, workspace boundary, invitation journey, or sample-to-own-tree conversion. |
| Collaboration | Partial | Members, roles, comments, fill-in questions, digest, and mobile UI exist. The contribution flow needs a simpler share/invite prompt and notification preferences. |
| Safe public demo | Missing | The live archive contains real family data. Launch needs a synthetic or consented sample with resettable agent actions. |
| Launch assets | Partial | A Remotion tour exists. HN technical post, PH listing, architecture diagram, benchmark, screenshots, maker notes, privacy explanation, and support/runbook need final versions. |

## Definition of launch-ready

### 1. Trustworthy claims

- Store a claim for each person fact and relationship fact with subject, field/predicate, value, status, confidence, source attachment or human assertion, source locator/quotation, creator, and timestamps.
- Preserve contradictory claims. Mark one claim preferred without deleting the alternatives.
- Show “Sources” and “Needs review” on a person record. A reader can open the exact supporting file when authorized.
- Agent-created mutations must attach their evidence or explicitly record “family member assertion” / “manual edit”; no silent source.

### 2. Safe, complete editing

- Store complete before/after mutation transactions and expose one-step undo for supported changes.
- Add first-class merge people, undo merge, and split wrongly merged people operations. Repoint relationships, stories, photographs, comments, member identity, questions, and claims atomically.
- Keep automatic reconciliation conservative: merge clear compatible overlaps, preserve new information, and ask in chat only when candidate identity or facts materially conflict.

### 3. Portable import and export

- Parse GEDCOM 5.5.1/7 and GEDZip deterministically before using an LLM.
- Produce an import preview: counts, matched people, additions, safe enrichments, conflicts, skipped records, and warnings.
- Round-trip the archive through GEDCOM without losing supported people, parent/spouse links, dates, places, notes, or sources.
- Continue accepting arbitrary uploads; deterministic parsers handle known formats and the agent handles genuinely unstructured evidence.

### 4. Privacy, ownership, and resilience

- Default living people to family-only detail; public samples contain no unconsented living-person data.
- Explain where data and files are stored, when uploaded content is sent to an AI provider, retention, export, and deletion.
- Add rate limiting to public AI and password attempts before publicity.
- Provide retry/cancel and durable progress for long imports. Never turn an old-data conflict into a blocker for unrelated new information.

### 5. A product anyone can start

- Create an archive, name it, choose privacy, add the first person, and invite family without code or operator intervention.
- Workspaces enforce archive boundaries in storage and authorization.
- A no-login sample lets a visitor upload safe fixtures, ask questions, watch reconciliation, undo changes, and reset.
- The first-run path explains the core promise in one sentence and reaches a populated tree quickly.

### 6. Launch proof

- Publish an architecture and privacy page, supported-format matrix, benchmark fixture and results, and honest limitations.
- Demonstrate: upload messy archive → extracted people/relationships → conflict explanation → source-backed profile → chat edit → undo → GEDCOM export.
- Run unit, data-integrity, type/lint, production build, browser/mobile, and real Safari macOS checks on the visible deployed version.

## Implementation order and gates

1. **Claims/provenance foundation.** Gate: migrations are idempotent; old records remain readable; every new mutation can record a source; UI exposes claims without leaking private files.
2. **Undo + merge/split.** Gate: atomic tests cover all dependent tables and exact restoration.
3. **GEDCOM/GEDZip import.** Gate: deterministic fixture import and round-trip report pass without the model.
4. **Privacy + ingestion hardening.** Gate: living-person/public matrix, rate-limit tests, resumable queue tests, and deletion/export verification pass.
5. **Workspaces + onboarding.** Gate: two archives cannot read or mutate each other; a new family reaches a useful tree unaided.
6. **Sample + launch material.** Gate: demo contains no production identities/files and resets cleanly; launch copy matches shipped behavior.
7. **Release verification.** Gate: all automated checks green; production deployment reports the intended version; physical Safari verification is recorded in `docs/HANDOFF.md`.

## Deliberate non-goals for the first launch

- Competing with Ancestry/MyHeritage on historical-record catalogs or DNA.
- Novelty photo animation.
- Native WhatsApp/iMessage bots before the web contribution loop is reliable.
- Genealogical research presented as fact without inspectable evidence.
