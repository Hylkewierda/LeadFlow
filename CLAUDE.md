# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — Production build to `dist/`
- `npm run lint` / `npm run lint:fix` — ESLint (flat config in `eslint.config.js`)
- `npm run typecheck` — Type-check JS via `tsc -p ./jsconfig.json`
- `npm run preview` — Preview production build locally
- `npm run test` — Run the Vitest suite once (`vitest run`); config in `vitest.config.js`
- `npm run test:watch` — Vitest in watch mode

Tests live in `tests/` and cover the serverless API handlers (`api-runs.test.js`, `workflows.test.js`) by mocking `@supabase/supabase-js` and the GitHub dispatch `fetch`. Run a single file with `npx vitest run tests/workflows.test.js`.

Stack: React 18 + Vite 6, React Router v6, Tailwind 3, Radix UI / shadcn-style components, Framer Motion, TanStack Query v5, Upstash Redis (serverless), `react-hook-form` + `zod`.

## Architecture

LeadFlow is a mobile-first React SPA for B2B lead qualification. It triggers n8n automation workflows that scrape LinkedIn profiles, score them with AI, and push qualified leads to HubSpot. UI is Dutch-language.

### Routing

Pages live in `src/pages/` and are auto-registered in `src/pages.config.js` — **this file is auto-generated; only `mainPage` is editable**. Routes come from `createPageUrl()` in `src/utils/index.ts`, which lowercases PascalCase page names (e.g., `SendMessage` → `/sendmessage`). `App.jsx` wraps everything in `AuthProvider` → `QueryClientProvider` → `Router` → `Layout`. `Login` is rendered before auth and is intentionally absent from `pages.config.js`.

Current pages: `Home`, `Leadfinder`, `LookalikeSearch`, `InteractionsReasoning`, `MaybeLeads`, `SendMessage`, `ClientDatabase`, `Guide`, `WorkflowActivated`, `Login`.

`Leadfinder` is reachable only via a clickable card on `Home` (lines ~217–235 of `Home.jsx`), **not** via `NAV_ITEMS`. It's a triage view that mirrors `Lead_finder/qualify-app/`'s component set in three sibling directories: `src/pages/Leadfinder.jsx`, `src/components/leadfinder/`, and `src/lib/leadfinder/`. **Drift risk:** changes to qualify-app's TS components do not propagate to these JSX mirrors automatically. If you're touching candidate-card / runs-strip / score-pill logic, check both places.

`LookalikeSearch` is also reached only via a `Home` card (`Home.jsx` ~line 266, `navigate(createPageUrl("LookalikeSearch"))`), not `NAV_ITEMS`. The user pastes 1+ LinkedIn profile URLs as anchors; the worker finds lookalike profiles, scores them, and the page exports results to a Sheet. It is **SPA-only** — no `qualify-app` twin, so there's no mirror to keep in sync. Its files are `src/pages/LookalikeSearch.jsx` and `src/lib/lookalike/data.js` (no `src/components/lookalike/`). The page polls a `lookalike_searches` row and walks the fixed stage list `pending → scraping → generating_playbook → searching → scoring → completed`; it latches the one-shot Sheet export per search id in localStorage (`lookalike_export_fired_{id}`).

### Layout & Navigation

`src/Layout.jsx` provides the sticky header (logo + logout), the 6-item bottom nav, ambient background gradients, and wraps children in `WorkflowProvider`. Nav items are hardcoded in the `NAV_ITEMS` array — when adding a navigable page, update this array manually. `WorkflowActivated` is intentionally not in the nav; it's navigated to programmatically after a workflow is triggered.

### State Management

- **AuthContext** (`src/lib/AuthContext.jsx`) — email/password auth. Allowed users come from the `VITE_AUTH_USERS` env var (JSON array); session is persisted in `localStorage` under `leadflow_auth`.
- **WorkflowContext** (`src/components/WorkflowContext.jsx`) — tracks the active workflow by `runId`, polls `/api/workflows?run_id=<id>` every 10s (Supabase `workflow_runs`), persists state in `localStorage`, and toasts completion counts. Exposes `cancelWorkflow()` (fires `DELETE /api/workflows` and keeps polling) and a `cancelling` flag; the poll ends the run with a neutral "geannuleerd" toast when status flips to `cancelled` (see Cancellation below).
- **TanStack Query** — configured in `src/lib/query-client.js`.
- **localStorage keys** — daily workflow limits (`limiter_{mode}_{date}`), auth session, workflow state.

### Serverless API

`api/workflows.js` is a Vercel serverless function and the entry point for the 4 Home workflow modes. `POST { mode }` guards (per-mode already-running + 5/day), inserts a `workflow_runs` row, dispatches `Hylkewierda/lead-discovery-service/.github/workflows/run-workflow.yml` with `{ mode, run_id }`, and returns `{ runId }`. `GET ?run_id=<id>` returns the run's status/counts for polling. `DELETE ?run_id=<id>` requests cancellation (see Cancellation below). Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`.

### External Integrations

- **Home workflow modes** — the 4 Home buttons (`Home.jsx`) POST to `/api/workflows` (code pipeline, see above); each is also capped at 5 runs/day client-side via the `limiter_{mode}_{date}` localStorage key. (The legacy n8n trigger webhook + `/api/workflow-status` Redis callback were retired in the 2026-06-08 cutover.)
- **n8n (sheet exports)** — still used by `api/export-to-sheet.js`, `api/export-lookalike-to-sheet.js`, and `SendMessage.jsx` for their own webhooks; unrelated to the Home workflow trigger.
- **HubSpot** — CRM for contacts/deals; linked from `SendMessage` and `ClientDatabase`.
- **Google Sheets** — linked from `InteractionsReasoning` for data viewing. (MaybeLeads no longer links to a Sheet; verdicts are now recorded in-app — see below.)

### Discovery pipeline (via GitHub Actions)

`api/runs.js` is the SPA's entry point into the lead-discovery pipeline. `POST` dispatches a run (below); `DELETE ?run_id=<id>` requests cancellation (see Cancellation below). The POST path:

- Resolves `workspaceSlug` (default `"actuals"`) to a workspace id in Supabase (`workspaces.slug` → `id`); 404s if missing.
- Refuses with 409 if a `runs` row with `status="running"` already exists for that workspace.
- Inserts a new `runs` row (`status="running"`, `triggered_by="cloud-ui"`, empty `playbook`/`apify_run_ids`/`counts`) and returns its `id`.
- Dispatches `Hylkewierda/lead-discovery-service/.github/workflows/discover.yml` (`ref=main`) with inputs `{workspace, run_id}` via the GitHub `workflow_dispatch` API.
- On dispatch failure: updates the run row to `status="failed"` with the error text (first 200 chars) and 502s.

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`.

The actual discovery code lives in the separate `lead-discovery-service` GitHub repo — the SPA only dispatches it, never imports it. The CLI writes results back to the same Supabase `runs` row by `run_id`.

The `qualify-app` triage UI in `Lead_finder/` reaches the same CLI via a local `spawn` rather than GH Actions; see `Lead_finder/CLAUDE.md`.

**Lookalike search** is a parallel discovery surface with the same shape. `api/lookalike-searches.js` resolves the workspace, inserts a `lookalike_searches` row (`status="pending"`, with `source_urls[]` + optional `feedback`, capped 500 chars), then dispatches `lead-discovery-service/.github/workflows/lookalike-search.yml` (`ref=main`) with `{workspace, search_id}`. The URLs are **not** passed through the GH inputs — the worker re-reads `source_urls` from the inserted row. `DELETE ?search_id=<id>` requests cancellation (see Cancellation below). Same env vars as `api/runs.js` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`).

### Cancellation (all three dispatch paths)

All three GitHub-Actions dispatch paths support **cooperative cancellation** — the SPA flags the run, and the running CLI stops itself within ~10–15s (stopping Apify + Anthropic spend), finalizing the row as `cancelled`. The pattern is identical across paths; only the table + id param differ:

| Path | DELETE route | Table | Guard | UI control |
|------|-------------|-------|-------|-----------|
| Home modes | `DELETE /api/workflows?run_id=` | `workflow_runs` | `status='running'` | "Workflow annuleren" on `WorkflowActivated.jsx` |
| Leadfinder | `DELETE /api/runs?run_id=` | `runs` | `status='running'` | "Annuleer run" in `components/leadfinder/RunsStrip.jsx` |
| Lookalike | `DELETE /api/lookalike-searches?search_id=` | `lookalike_searches` | `status NOT IN (completed,failed,cancelled)` | "Zoekopdracht annuleren" in `LookalikeSearch.jsx` |

How it works: the DELETE sets `cancel_requested=true` on the row (only when non-terminal; idempotent no-op otherwise, returning the current status). The CLI polls that flag (throttled) at stage checkpoints and inside its Apify poll loop, aborts the in-flight Apify actor run, stops further LLM calls, writes `status='cancelled'` (+ `cancelled_at`), and **exits 0** so the workflow's `if: failure()` step does not overwrite it. The CLI-side mechanism lives in the `lead-discovery-service` repo (`src/workflows/cancellation.ts` + per-pipeline wiring) — see `Lead_finder/CLAUDE.md`.

UI observation: Home polls `/api/workflows` (10s); Leadfinder and Lookalike read status directly from Supabase (anon, 3s). Each shows a destructive cancel control only while the run is non-terminal, toggles it to "Annuleren…" (disabled) after click, and renders a neutral `cancelled`/"Geannuleerd" state once the poll observes it. The Lookalike Sheet-export latch fires only on `completed`, never on `cancelled`. The `runs.cancel_requested`/`cancelled_at`/`cancelled` status, `lookalike_searches.cancel_requested`/`cancelled_at`, and `workflow_runs` cancel columns were added by migrations `013`/`014`/`015` (`014` also widened the `runs.status` CHECK to allow `cancelled`).

### MaybeLeads (in-app triage)

`src/pages/MaybeLeads.jsx` is an in-app triage page for candidates in the MAYBE band (`llm_score` in [40, 64]). It replaces the previous Google-Sheet link.

- **`api/maybe-leads.js`** — `GET` returns MAYBE-band candidates for the workspace (ordered by score desc). `POST { candidateId, verdict }` (verdict = `"GO"` or `"NO-GO"`) writes two things atomically: sets `candidates.status` to `qualified` or `disqualified` (with `qualified_by='user_maybe_triage'`) AND upserts a row in `qualifier_exemplars` (deduped on `(workspace_id, role_title, company_name, verdict)`).
- **`api/qualifier-exemplars.js`** — `GET` returns all exemplar rows with a count; `PATCH { id }` pins/unpins a row (`is_pinned`); `DELETE ?id=<id>` removes a row. The page shows a counter with a warning when the exemplar set is large, and allows pruning unpinned rows.
- **Feedback loop:** the exemplar rows are read at the start of each discovery run by `src/qualify/confirmed-exemplars.ts` (in the CLI) and injected into the qualify prompt via `buildSystemPrompt` as positive/negative examples, so human verdicts automatically improve the next run's first-pass scoring.
- The `qualifier_exemplars` table is **distinct** from the `workspaces.qualifier_feedback` free-text column (migration 019).

Required env vars: same as `api/runs.js` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

### Autoresearch (Python)

`autoresearch/` is an offline optimization loop that iteratively improves `qualify_prompt.md` (the lead-scoring prompt) by measuring F1 against ground truth assembled from HubSpot deals (closedwon/closedlost) and human verdicts from the Supabase `qualifier_exemplars` table.

Loop:
1. `python evaluate.py export` → writes `results/leads_to_classify.json` (ground truth cached in `results/ground_truth_cache.json`). Human verdicts are now read from Supabase `qualifier_exemplars` (not a Google Sheet).
2. Classifier (Claude / Groq) reads `qualify_prompt.md` + leads → `results/classifications.json`.
3. `python evaluate.py metrics` → prints F1/precision/recall/accuracy and top false positives/negatives; appends to `results/experiment_log.csv`.
4. Edit `qualify_prompt.md` (1–2 changes per iteration) and repeat.

Supporting files: `config.py`, `hubspot_client.py`, `program.md`, `requirements.txt`. Detailed Dutch-language explainer in `autoresearch/AUTORESEARCH_UITLEG.md`.

## Styling

Tailwind CSS with custom design tokens in `src/index.css`. Font: Plus Jakarta Sans. Key utility classes: `.glass-card`, `.glass-card-elevated`, `.premium-gradient`, `.accent-glow`. Accent color: emerald (HSL 155 60% 38%). All pages use Framer Motion stagger animations with the easing `[0.22, 1, 0.36, 1]`.

Standard page wrapper: `<div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8"><div className="w-full max-w-lg">…`.

## Deployment

Deployed to Vercel via GitHub (origin: `Hylkewierda/LeadFlow`). Push to `main` triggers auto-deploy. `vercel.json` handles SPA rewrites and `/api/*` routing.

## Environment Variables

- **Frontend (Vite):** `VITE_AUTH_USERS`
- **Vercel runtime:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT` (used by `api/workflows.js` and `api/runs.js`). The `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`/`WORKFLOW_API_KEY` vars are now orphaned after the n8n status-callback retirement and can be removed from Vercel.
- **Autoresearch:** `HUBSPOT_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required by `evaluate.py` to read human verdicts from `qualifier_exemplars`)
