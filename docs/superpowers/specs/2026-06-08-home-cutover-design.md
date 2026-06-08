# Home cutover: n8n webhook → `/api/workflows` (code pipeline)

**Date:** 2026-06-08
**Status:** Approved (design)
**Scope:** `lead-flow-311625f1` SPA only. Backend (`/api/workflows`, GitHub Action, CLI, n8n read/write webhooks) is already built, deployed, and smoke-tested green.

## Goal

Move the 4 Home workflow buttons off the single legacy n8n webhook and onto the new code pipeline (`POST /api/workflows`), **one mode at a time**, while keeping the live "running → done" status UX. After all 4 modes are cut over, the big n8n workflow is retired.

The 4 modes and their new `apiMode`:

| Home id | label | `apiMode` | input sheet |
|---|---|---|---|
| `AllPosts` | All Posts | `all-posts` | none (company URL via CLI env) |
| `SpecificPosts` | Specific Posts | `specific-posts` | Specific_posts |
| `Campaigns` | Campaigns | `campaigns` | LinkedIn Campaign URL's |
| `CommentPosts` | Comment Posts | `comment-posts` | Url's for comments |

## Key decision

Make `WorkflowContext` **run_id-aware** rather than building a second context. One poll function chooses by what it's tracking: if a `runId` is set → poll Supabase via `GET /api/workflows?run_id=…`; otherwise → the existing Redis poll on `workflow_name`. This keeps both paths alive during the incremental cutover and confines all status logic to one place.

## Components (4 isolated changes)

### 1. `Home.jsx` — mode config
Each `WORKFLOW_MODES` entry gains:
- `apiMode` — the kebab mode string the backend expects.
- `pipeline: "new" | "n8n"` — which trigger path this mode uses. Flipped from `"n8n"` to `"new"` per mode as each is validated.

Starting state: `CommentPosts.pipeline = "new"` (fully validated end-to-end); the other three start `"n8n"`.

### 2. `Home.jsx` — `triggerWorkflow`
Branch on `mode.pipeline`:
- **`"new"`** → `POST /api/workflows { mode: apiMode }`.
  - `200 { runId }` → `startWorkflow(label, runId)` → navigate to `WorkflowActivated`.
  - `409` → error toast "Er draait al een run voor deze mode" — do **not** start or increment usage.
  - `429` → error "Daglimiet bereikt voor {label}".
  - other non-OK → generic error; `endWorkflow("")`.
- **`"n8n"`** → unchanged (legacy `WEBHOOK_URL` POST, `startWorkflow(label)` with no runId).

The client-side daily limiter (`localStorage` `limiter_*`) stays as the fast pre-check and drives the "x/5" display. Server `429`/`409` are an additional safety net surfaced as errors.

### 3. `WorkflowContext.jsx` — run_id-aware polling
- `startWorkflow(name, runId = null)` stores `runId` in state + `localStorage` (`STORAGE_KEY`).
- `pollStatus`:
  - if `runId` → `GET /api/workflows?run_id=<id>`; on `status === "completed"` → `endWorkflow(name, data.counts)`; on `status === "failed"` → end + error toast with `data.error`.
  - else → existing `GET /api/workflow-status?workflow_name=<name>` path, unchanged.
- `endWorkflow(name, result)` — accepts optional result so it can surface counts (e.g. a leads-added number) in the success toast; falls back to the current "{name} is klaar!" when no counts.

### 4. `WorkflowActivated.jsx`
Surface the completion counts when available (e.g. "2 leads toegevoegd") via the existing toast/banner. Minimal change — the page stays otherwise as-is.

## What we deliberately do NOT change (YAGNI)
- The client-side `localStorage` daily limiter (kept for the "x/5" UI + fast pre-check).
- `/api/workflow-status` (Redis) — stays while any mode is still on n8n; removed only after full cutover.
- `WorkflowActivated`'s layout/animation.
- No new pages, nav items, or routes.

## Data flow (new path)
```
Home button (pipeline:"new")
  → POST /api/workflows {mode: apiMode}
     → inserts workflow_runs row (status=running) + dispatches run-workflow.yml {mode, run_id}
     → returns {runId}
  → startWorkflow(label, runId) → navigate WorkflowActivated
  → WorkflowContext polls GET /api/workflows?run_id every 10s
     → status completed/failed → endWorkflow(label, counts) → toast
CLI (GitHub Action): reads input via N8N_SHEET_INPUT_URL → scrape → qualify
  → writes via N8N_SHEET_WEBHOOK_URL → finalizes workflow_runs row (status + counts)
```

## Error handling
- Trigger errors (`409`/`429`/network) → toast, no `startWorkflow`, no usage increment.
- Poll: `status==="failed"` → end workflow + error toast with backend `error`.
- Poll network errors → silently ignored (as today); next tick retries.
- A stuck `status="running"` row is bounded by the Action's `timeout-minutes: 15` + the "Mark run as failed on error" step, so the row eventually flips to `failed` and the poll clears.

## Cutover / rollout
1. Ship with only `comment-posts` on `"new"`; validate via the live button.
2. Flip `specific-posts`, then `campaigns`, then `all-posts` one at a time (validate each with a real run).
3. Once all 4 are `"new"`, disable the big n8n workflow and remove `WEBHOOK_URL` + (optionally) `/api/workflow-status`.

## Testing
- `Home.jsx` trigger branch: there are no existing UI unit tests in the SPA (verify visually via the live button, per repo convention).
- Manual: click Comment Posts → see WorkflowActivated → Action runs → status flips to completed with counts → toast. (Re-uses the already-green end-to-end path.)
- Regression: a mode still on `"n8n"` continues to fire the legacy webhook and poll by name.
