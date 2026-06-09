# Workflow Cancel — Design Spec

**Date:** 2026-06-09
**Status:** Approved, pending implementation plan
**Scope:** The 4 Home workflow modes only (`all-posts`, `specific-posts`, `campaigns`, `comment-posts`) — the `workflow_runs` table → `run-workflow.yml` dispatch path. Leadfinder (`runs`/`discover.yml`) and Lookalike (`lookalike_searches`/`lookalike-search.yml`) are explicitly out of scope; the same pattern can be copied to them later.

## Problem

The "Workflow annuleren" button on `WorkflowActivated.jsx` does **not** cancel anything. `handleCancel` calls `endWorkflow("")` (which only clears local React state + localStorage + the poll interval and shows a toast) and navigates to Home. The dispatched GitHub Actions run keeps running to completion, keeps spending Apify + Anthropic credits, and still writes its results to Supabase + the Sheets. There is no backend cancel path: `api/workflows.js` has only `POST` (dispatch) and `GET` (status); the discovery-service CLI never reads the run row mid-run; no `cancelled` status exists.

Additionally there is a UX bug: because `handleCancel` calls `endWorkflow("")` with no `result`, the success branch fires and shows a misleading **"{naam} is klaar!"** toast on cancel.

## Goal

Make cancellation real and cheap-stopping: pressing the button must stop the actual Apify + Anthropic spend within ~10–15s and leave the run in a clean, honest `cancelled` state that the UI reflects.

## Chosen approach: cooperative cancellation

The UI sets a flag in Supabase. The running CLI polls that flag at checkpoints and at every Apify poll iteration, aborts in-flight Apify actor runs, stops issuing further LLM calls, and finalizes the run as `cancelled` — exiting `0` so the workflow's `if: failure()` step does not overwrite the status with `failed`.

Rejected alternatives:
- **Hard kill via GitHub API** (`POST /actions/runs/{id}/cancel`): kills the runner instantly but leaves already-started Apify jobs running on Apify's infra (spend continues) and the Supabase row stuck on `running`. The dominant cost is Apify + Anthropic, not Actions minutes, so this does not meet the goal on its own.
- **Both:** more robust but more work across all layers; not justified for v1.

## Components & changes

### 1. Supabase migration — `Lead_finder/lead-discovery-service/scripts/sql/013_workflow_runs_cancel.sql`

```sql
alter table workflow_runs add column if not exists cancel_requested boolean not null default false;
alter table workflow_runs add column if not exists cancelled_at timestamptz;
```

No constraint change: `status` is a free-text column (`text not null default 'running'`, per `012_workflow_runs.sql`) with no CHECK, so the new value `'cancelled'` is accepted as-is.

### 2. SPA serverless API — `lead-flow-311625f1/api/workflows.js`

Add a `DELETE` branch:

- `DELETE /api/workflows?run_id=<id>` → updates `workflow_runs` setting `cancel_requested = true` **with `.eq("id", runId).eq("status", "running")`** so terminal runs are a no-op.
- Returns `200 { status: "cancelling" }` when a running row was flagged. When the run is not running (already terminal or unknown), it is an idempotent no-op returning `200 { status: <current-or-"unknown"> }` (no `409`). Missing `run_id` → `400`.
- Reuses the existing `serverSupabase()` service-role client. No new env vars.

The existing `POST` (dispatch) and `GET` (status) branches are unchanged. The `GET` select must additionally return `cancelled_at` (and may surface `cancel_requested`) so the UI can render the cancelled state; add those columns to the `select(...)` list.

### 3. Discovery-service CLI

**`CancellationToken`** (new, `src/workflows/cancellation.ts`):
- Constructed from `{ supabase, runId }`.
- `throwIfCancelled()`: reads `workflow_runs.cancel_requested` for `runId`, throttled to at most one DB read per ~4s (cache the last read + timestamp); throws `CancelledError` when the flag is `true`.
- `CancelledError` is an exported class so callers can `instanceof`-check it.
- A no-op token variant (always false) is used in tests / when no supabase is available.

**Threading the token:**
- `runner.ts` creates the token from `input.supabase` + `input.runId` and passes it into the `module.run({...})` context (new `cancellation` field on the context object) and into the scrape helpers.
- `WorkflowModule` context type (`src/workflows/types.ts`) gains an optional `cancellation?: CancellationToken`.

**Checkpoints (where `throwIfCancelled()` / abort is inserted):**
- (a) In each mode runner: after input fetch, before the expensive scrape stage.
- (b) **In `src/discovery/apify-client.ts` `runActor` poll loop** (the key one): accept an optional `cancellation` (or `onPoll` callback) param. On each ~10s poll iteration, call `throwIfCancelled()`; if it throws, first `await input.client.run(runId).abort()` (best-effort, swallow abort errors) and then rethrow `CancelledError`. This stops a long in-flight scrape within roughly one poll interval.
- (c) In `enrichAndQualify` (`src/workflows/enrich-qualify.ts`) batch loop: `throwIfCancelled()` between batches, before the next `Promise.all` + before `sleep`, to stop further Anthropic/Haiku calls.
- (d) In `mapWithConcurrency` (`src/workflows/concurrency.ts`): `throwIfCancelled()` per iteration before invoking `fn`.

**`runner.ts` error handling:** wrap the body so that `CancelledError` is caught *specifically and before* the generic failure path:
- On `CancelledError`: `finalizeWorkflowRun({ status: "cancelled", ... })` and **`return 0`** (do not rethrow). Returning normally keeps the CLI exit code `0`, so the `run-workflow.yml` `if: failure()` "mark as failed" step does not run and cannot overwrite `cancelled`.
- On any other error: unchanged (finalize `failed`, rethrow).

**`finalizeWorkflowRun`** (`src/storage/workflow-runs.ts`):
- Widen `status` type to `"completed" | "failed" | "cancelled"`.
- When `status === "cancelled"`: set `cancelled_at = now()` in the patch, and scope the update with `.eq("status", "running")` so a run that already reached `completed`/`failed` is not flipped to `cancelled` (race guard). For `completed`/`failed` the behavior is unchanged.

`run-workflow.yml` needs no change: it already passes `--run-id`, and the CLI exiting `0` on cancel means the failure step is skipped.

### 4. SPA UI

**`src/components/WorkflowContext.jsx`:**
- Add `cancelWorkflow()`: `fetch(`/api/workflows?run_id=${runId}`, { method: "DELETE" })`; set a local `cancelling` state to `true`; **keep polling** (do not clear the run or stop the interval).
- Poll loop (currently handles `completed` / `failed`): add a branch for `status === "cancelled"` → call `endWorkflow(name, { cancelled: true })`.
- Expose `cancelWorkflow` and `cancelling` from the context value.

**`endWorkflow` toast logic:** add a `result.cancelled` branch that shows `toast("{name} geannuleerd")` (neutral/info), placed *before* the `else if (name)` success branch so cancel never shows "is klaar!". This fixes the existing misleading-toast bug.

**`src/pages/WorkflowActivated.jsx`:**
- `handleCancel` calls `cancelWorkflow()` instead of `endWorkflow("")`. It does **not** navigate away immediately; it lets the user see the "annuleren…" state. (A separate "Nieuwe workflow starten" link already exists for leaving.)
- While `cancelling` is true, the button shows "Annuleren…" and is disabled until the poll confirms `cancelled` (at which point `endWorkflow` clears `workflowRunning` and the button disappears).

## Data flow

1. User clicks "Workflow annuleren" → `cancelWorkflow()` → `DELETE /api/workflows?run_id=X`.
2. API sets `workflow_runs.cancel_requested = true` where `id = X AND status = 'running'`.
3. CLI's `CancellationToken` (polled at checkpoints + each Apify poll, ≤~10s) sees the flag → aborts the in-flight Apify run → throws `CancelledError`.
4. `runner.ts` catches `CancelledError` → `finalizeWorkflowRun(status='cancelled', cancelled_at=now)` → returns 0 → CLI exits 0 → `if: failure()` step skipped.
5. SPA poll `GET` sees `status='cancelled'` → `endWorkflow(cancelled)` → toast "{naam} geannuleerd", UI cleared.

## Error & race handling

- **Cancel after the run already finished:** `DELETE` matches no `running` row → no-op; UI just ends on the next poll.
- **Cancel mid-scrape:** the Apify poll-loop check aborts the actor within ~one poll interval (~10s).
- **Cancel mid-enrich:** the batch-loop check stops further batches; the current in-flight batch (small) completes.
- **Cancel arrives just before completion:** the `cancelled` finalize is `WHERE status='running'`; if `completed` was written first it wins, and vice versa — no double terminal write.
- **Abort call fails** (Apify run already terminal): swallow the abort error and proceed to throw `CancelledError` anyway.

## Testing

Follow existing vitest conventions (mocked Supabase, `vi.fn()` Apify/Anthropic; SPA tests mock `@supabase/supabase-js` + dispatch `fetch` as in `tests/api-runs.test.js`).

**Discovery-service (vitest):**
- `CancellationToken.throwIfCancelled()` throws `CancelledError` when the mocked row has `cancel_requested=true`, and does not throw when false; verify the ~4s read throttle (second call within the window does not re-query).
- `runActor` aborts and throws when the token cancels mid-poll: mock client with an `abort` spy; assert `abort` called once and `CancelledError` propagated.
- `runWorkflow` maps `CancelledError` → `finalizeWorkflowRun` called with `status:'cancelled'` (and `cancelled_at` set), returns 0, and does **not** call the `failed` finalize.
- A run that reaches `completed` is not overwritten by a late cancel (finalize guard `.eq('status','running')`).

**SPA (vitest):**
- `DELETE /api/workflows?run_id=X` sets `cancel_requested=true` only when `status='running'`; no-op (no update / appropriate status) when terminal; `400` on missing `run_id`.

**Manual live smoke (optional, costs one real run):** start `specific-posts`, click "Workflow annuleren", confirm `workflow_runs.status` flips to `cancelled` within ~15s and the corresponding Apify actor run shows `ABORTED`.

## Out of scope (YAGNI)

- No `apify_run_ids` / `github_run_id` columns — the CLI aborts its own in-memory Apify run handles; no external process needs them.
- No hard GitHub-runner kill.
- No cancellation for Leadfinder (`discover.yml`) or Lookalike (`lookalike-search.yml`) — same pattern can be applied later.
- No new status enum/lookup table — reuse the existing free-text `status` column.

## Affected files (summary)

| Repo | File | Change |
|------|------|--------|
| lead-discovery-service | `scripts/sql/013_workflow_runs_cancel.sql` | new migration |
| lead-discovery-service | `src/workflows/cancellation.ts` | new: `CancellationToken` + `CancelledError` |
| lead-discovery-service | `src/workflows/types.ts` | add `cancellation?` to module context |
| lead-discovery-service | `src/workflows/runner.ts` | create token, thread it, catch `CancelledError` → finalize `cancelled`, return 0 |
| lead-discovery-service | `src/storage/workflow-runs.ts` | widen status type, `cancelled_at`, race guard |
| lead-discovery-service | `src/discovery/apify-client.ts` | poll-loop cancel check + `.abort()` |
| lead-discovery-service | `src/workflows/enrich-qualify.ts` | between-batch cancel check |
| lead-discovery-service | `src/workflows/concurrency.ts` | per-iteration cancel check |
| lead-flow (SPA) | `api/workflows.js` | `DELETE` branch; `GET` select adds `cancelled_at` |
| lead-flow (SPA) | `src/components/WorkflowContext.jsx` | `cancelWorkflow()`, `cancelling`, `cancelled` poll branch, toast fix |
| lead-flow (SPA) | `src/pages/WorkflowActivated.jsx` | `handleCancel` → `cancelWorkflow()`, "Annuleren…" state |
