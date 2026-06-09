# Cancel for Leadfinder + Lookalike — Design Spec

**Date:** 2026-06-09
**Status:** Approved, pending implementation plan
**Builds on:** `2026-06-09-workflow-cancel-design.md` (shipped). Reuses the same cooperative-cancellation pattern: SPA sets a `cancel_requested` flag; the running CLI polls it, aborts the in-flight Apify run, stops further work, finalizes the row as `cancelled`, and exits 0 so the workflow's `if: failure()` step does not mark it failed.

## Scope

Add cooperative cancellation to the two remaining SPA cloud dispatch paths:
- **Leadfinder (discovery):** `api/runs.js` → `discover.yml` → CLI `src/index.ts`, table `runs`, UI `src/pages/Leadfinder.jsx` + `src/components/leadfinder/RunsStrip.jsx`.
- **Lookalike:** `api/lookalike-searches.js` → `lookalike-search.yml` → CLI `src/lookalike/runner.ts` (entry `scripts/lookalike-search.ts`), table `lookalike_searches`, UI `src/pages/LookalikeSearch.jsx`.

**Out of scope:** the qualify-app local-`spawn` path (different mechanism). The Home `workflow_runs` path is already shipped.

## Reused infrastructure (already on `main`)

- `CancellationToken` / `CancelledError` / `makeCancellationToken` (`src/workflows/cancellation.ts`).
- `runActor` (`src/discovery/apify-client.ts`) already accepts `cancellation?` and aborts the in-flight run on cancel.
- The `enrichAndQualify`/`mapWithConcurrency` cancel-aware helpers (only relevant to Home modes; discovery/lookalike use their own scrape/score code).

## Components & changes

### 1. Token: parameterize the table (`src/workflows/cancellation.ts`)

`makeCancellationToken` currently hard-reads `workflow_runs`. Add an optional `table` to `MakeCancellationTokenInput` (default `"workflow_runs"`, so the shipped Home call site is unchanged). The token reads `cancel_requested` from `input.table`. Column name `cancel_requested` is identical across all three tables.

### 2. Migrations

**`scripts/sql/014_runs_cancel.sql`:**
```sql
alter table runs add column if not exists cancel_requested boolean not null default false;
alter table runs add column if not exists cancelled_at timestamptz;
-- runs.status has an inline CHECK; replace it to allow 'cancelled' (constraint name is auto-generated, so drop dynamically).
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'runs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then execute format('alter table runs drop constraint %I', cname); end if;
end $$;
alter table runs add constraint runs_status_check check (status in ('running','completed','failed','cancelled'));
```

**`scripts/sql/015_lookalike_searches_cancel.sql`:**
```sql
alter table lookalike_searches add column if not exists cancel_requested boolean not null default false;
alter table lookalike_searches add column if not exists cancelled_at timestamptz;
```
(`lookalike_searches.status` is free text — no constraint change.)

Both applied manually in the Supabase SQL editor (like `013`).

### 3. CLI: discovery pipeline (`src/index.ts`, `src/storage/writer.ts`, scrape helpers)

- **`finalizeRun`** (`writer.ts`): widen `status` to include `"cancelled"`; when cancelled, set `cancelled_at` (keep setting `finished_at` too) and guard the update with `.eq("status","running")` (race guard). `completed`/`failed` unchanged.
- **`src/index.ts`**: build `const cancellation = makeCancellationToken({ supabase, runId, table: "runs" })` once `runId` is known; pass it into the Apify-calling functions (`runContentSearch`, `runCompetitorEngagement`) which forward it to `runActor`; add `await cancellation.throwIfCancelled()` checkpoints between the major stages (after playbook, between the two Apify groups, before LLM qualify, before the Supabase write). In the outer catch, branch on `CancelledError` first → `finalizeRun({ status: "cancelled" })` and return exit code 0 (do NOT rethrow / do NOT finalize failed). Other errors unchanged.
- **Scrape/search helpers** (`src/discovery/content-search.ts`, `src/discovery/competitor-engagement.ts`): thread an optional `cancellation?` param into their `runActor({...})` calls (forward only; no new logic).

### 4. CLI: lookalike pipeline (`src/lookalike/runner.ts`, `src/storage/lookalike-searches.ts`, scrape/search helpers, `src/lookalike/types.ts`)

- **`LookalikeSearchStatus`** type (`src/lookalike/types.ts`): add `"cancelled"`.
- **`updateLookalikeSearchStatus`** (`storage/lookalike-searches.ts`): when `status === "cancelled"`, set `completed_at` + `cancelled_at`, and guard with `.not("status","in","(completed,failed,cancelled)")` so a terminal search isn't overwritten. Normal stage transitions stay unguarded.
- **`src/lookalike/runner.ts`**: build `makeCancellationToken({ supabase, runId: searchId, table: "lookalike_searches" })`; pass into `scrapeAnchors` and `runProfileSearches` (→ `runActor`); add `throwIfCancelled()` checkpoints between stages (after anchor scrape, after embed, after playbook, between profile searches, before scoring). In the catch, branch on `CancelledError` first → `updateLookalikeSearchStatus(supabase, searchId, "cancelled")` and exit 0; do not let the generic `failed` handler run for a cancel.
- **Scrape/search helpers** (`src/lookalike/scrape-anchors.ts`, `src/lookalike/search.ts`): thread `cancellation?` into their `runActor` calls.

`discover.yml` / `lookalike-search.yml` need no change: both already pass the run/search id and have `if: failure()` steps that are skipped when the CLI exits 0.

### 5. SPA DELETE routes

- **`api/runs.js`**: add `DELETE ?run_id=` → set `runs.cancel_requested = true` WHERE id=runId AND status='running'; `200 {status:"cancelling"}` if matched, else idempotent no-op `200 {status:<current ?? "unknown">}`; `400` on missing run_id. Mirror the shipped `api/workflows.js` DELETE. POST unchanged.
- **`api/lookalike-searches.js`**: add `DELETE ?search_id=` → set `lookalike_searches.cancel_requested = true` WHERE id=searchId AND status NOT IN ('completed','failed','cancelled'); `200 {status:"cancelling"}` if matched, else idempotent no-op returning current status; `400` on missing search_id. Keep the existing CORS headers. POST unchanged.

### 6. SPA UI

Both pages poll status directly via the anon Supabase client (3s) — no API wrapper — so they already observe the row's `status`. The new affordance and `cancelled` handling:

- **Leadfinder** (`src/lib/leadfinder/data.js`, `src/pages/Leadfinder.jsx`, `src/components/leadfinder/RunsStrip.jsx`):
  - `data.js`: add `cancelRun(runId)` → `fetch('/api/runs?run_id=...', { method: "DELETE" })`. Ensure `listRecentRuns` selects `status` (it does).
  - `Leadfinder.jsx`: track a `cancelling` state; pass `onCancel` + `cancelling` to the runs UI; the existing 3s poll already refreshes runs, so when status flips to `cancelled` the strip reflects it and `isRunning` becomes false (polling stops).
  - `RunsStrip.jsx`: when a run is `running`, show a small destructive "Annuleer run" control (style: `text-destructive`, disabled→"Annuleren…"); render a `cancelled` status icon/label (neutral, e.g. a slash/X) so the strip doesn't treat `cancelled` as unknown.
- **Lookalike** (`src/lib/lookalike/data.js`, `src/pages/LookalikeSearch.jsx`):
  - `data.js`: add `cancelLookalikeSearch(searchId)` → `fetch('/api/lookalike-searches?search_id=...', { method: "DELETE" })`. Ensure `getLookalikeSearch` selects `status` (it does).
  - `LookalikeSearch.jsx`: add `"cancelled"` to the terminal handling (the poll stops on completed/failed/cancelled), show a "geannuleerd" state in the header, and render a small destructive "Zoekopdracht annuleren" control under the stages list while the search is non-terminal (disabled→"Annuleren…"). The fixed `STAGES` list stays; `cancelled` is shown as a terminal state outside the stage rows.

Button style (both): destructive/ghost, matching `WorkflowActivated.jsx`'s cancel button (`text-destructive`, `disabled:opacity-50`), label toggling `cancelling ? "Annuleren…" : "Annuleer run"/"Zoekopdracht annuleren"`.

## Data flow (both paths)

UI control → `cancelRun`/`cancelLookalikeSearch` → DELETE sets `cancel_requested=true` (guarded on non-terminal) → CLI token (≤~10s, Apify poll cadence) → aborts in-flight Apify run → throws `CancelledError` → CLI finalizes `cancelled` (exit 0) → the page's 3s Supabase poll sees `status='cancelled'` → UI shows cancelled, stops polling.

## Error & race handling

- Cancel after terminal: DELETE matches nothing → idempotent no-op; UI already shows the terminal state.
- Cancel mid-scrape: `runActor` poll-loop aborts within ~one poll interval.
- Cancel just before completion: the `cancelled` finalize is guarded (`runs`: `.eq("status","running")`; `lookalike_searches`: `.not("status","in",(completed,failed,cancelled))`), so a finished row is never flipped.
- CLI exits 0 on cancel → `if: failure()` skipped, row stays `cancelled`.

## Testing

vitest, existing conventions (mocked Supabase / `vi.fn()` Apify).
- CLI: `finalizeRun` cancelled-path (cancelled_at + `.eq('status','running')` guard); `updateLookalikeSearchStatus` cancelled-path (completed_at + cancelled_at + non-terminal guard, normal transitions unguarded); `makeCancellationToken` reads from the passed `table`; discovery/lookalike runner map `CancelledError` → status `cancelled` + exit 0 (don't finalize failed). Reuse existing per-helper tests; add cancel-propagation tests where a scrape/search throws `CancelledError`.
- SPA: `DELETE /api/runs` and `DELETE /api/lookalike-searches` flag only when non-terminal; idempotent no-op otherwise; 400 on missing id (mirror `tests/workflows-cancel.test.js`).
- UI: no component test framework in the SPA — verify via `npm run lint` + `npm run build`; covered by a live smoke.

## Migrations rollout ordering (same hazard as before)

The SPA DELETE/poll and the CLI reference the new columns. Apply `014` + `015` to Supabase **before** merging/deploying. Merge the CLI PR (so `main` has the cancel-aware code; both workflows dispatch `ref:"main"`) and the SPA PR after the migrations.

## Out of scope (YAGNI)

- No hard GitHub-runner kill (cooperative only).
- No qualify-app local-spawn cancellation.
- No change to `discover.yml` / `lookalike-search.yml`.
- No new status beyond `cancelled`; reuse existing columns + `cancelled_at`.

## Affected files

| Repo | File | Change |
|------|------|--------|
| CLI | `scripts/sql/014_runs_cancel.sql` | new migration (+ constraint swap) |
| CLI | `scripts/sql/015_lookalike_searches_cancel.sql` | new migration |
| CLI | `src/workflows/cancellation.ts` | add `table` param (default `workflow_runs`) |
| CLI | `src/storage/writer.ts` | `finalizeRun` cancelled + cancelled_at + race guard |
| CLI | `src/storage/lookalike-searches.ts` | `updateLookalikeSearchStatus` cancelled + guard |
| CLI | `src/lookalike/types.ts` | add `"cancelled"` to `LookalikeSearchStatus` |
| CLI | `src/index.ts` | token (table:runs), checkpoints, CancelledError → cancelled, exit 0 |
| CLI | `src/discovery/content-search.ts`, `competitor-engagement.ts` | thread `cancellation` into `runActor` |
| CLI | `src/lookalike/runner.ts` | token (table:lookalike_searches), checkpoints, CancelledError → cancelled, exit 0 |
| CLI | `src/lookalike/scrape-anchors.ts`, `search.ts` | thread `cancellation` into `runActor` |
| SPA | `api/runs.js` | `DELETE` branch |
| SPA | `api/lookalike-searches.js` | `DELETE` branch |
| SPA | `src/lib/leadfinder/data.js` | `cancelRun()` |
| SPA | `src/pages/Leadfinder.jsx` | `cancelling` state + wire control |
| SPA | `src/components/leadfinder/RunsStrip.jsx` | cancel control + `cancelled` status rendering |
| SPA | `src/lib/lookalike/data.js` | `cancelLookalikeSearch()` |
| SPA | `src/pages/LookalikeSearch.jsx` | cancel control + `cancelled` terminal handling |
