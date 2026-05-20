# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — Production build to `dist/`
- `npm run lint` / `npm run lint:fix` — ESLint (flat config in `eslint.config.js`)
- `npm run typecheck` — Type-check JS via `tsc -p ./jsconfig.json`
- `npm run preview` — Preview production build locally

Stack: React 18 + Vite 6, React Router v6, Tailwind 3, Radix UI / shadcn-style components, Framer Motion, TanStack Query v5, Upstash Redis (serverless), `react-hook-form` + `zod`.

## Architecture

LeadFlow is a mobile-first React SPA for B2B lead qualification. It triggers n8n automation workflows that scrape LinkedIn profiles, score them with AI, and push qualified leads to HubSpot. UI is Dutch-language.

### Routing

Pages live in `src/pages/` and are auto-registered in `src/pages.config.js` — **this file is auto-generated; only `mainPage` is editable**. Routes come from `createPageUrl()` in `src/utils/index.ts`, which lowercases PascalCase page names (e.g., `SendMessage` → `/sendmessage`). `App.jsx` wraps everything in `AuthProvider` → `QueryClientProvider` → `Router` → `Layout`. `Login` is rendered before auth and is intentionally absent from `pages.config.js`.

Current pages: `Home`, `Leadfinder`, `InteractionsReasoning`, `MaybeLeads`, `SendMessage`, `ClientDatabase`, `Guide`, `WorkflowActivated`, `Login`.

`Leadfinder` is reachable only via a clickable card on `Home` (lines ~217–235 of `Home.jsx`), **not** via `NAV_ITEMS`. It's a triage view that mirrors `Lead_finder/qualify-app/`'s component set in three sibling directories: `src/pages/Leadfinder.jsx`, `src/components/leadfinder/`, and `src/lib/leadfinder/`. **Drift risk:** changes to qualify-app's TS components do not propagate to these JSX mirrors automatically. If you're touching candidate-card / runs-strip / score-pill logic, check both places.

### Layout & Navigation

`src/Layout.jsx` provides the sticky header (logo + logout), the 6-item bottom nav, ambient background gradients, and wraps children in `WorkflowProvider`. Nav items are hardcoded in the `NAV_ITEMS` array — when adding a navigable page, update this array manually. `WorkflowActivated` is intentionally not in the nav; it's navigated to programmatically after a workflow is triggered.

### State Management

- **AuthContext** (`src/lib/AuthContext.jsx`) — email/password auth. Allowed users come from the `VITE_AUTH_USERS` env var (JSON array); session is persisted in `localStorage` under `leadflow_auth`.
- **WorkflowContext** (`src/components/WorkflowContext.jsx`) — tracks the active workflow, polls `/api/workflow-status` every 10s via Upstash Redis, persists state in `localStorage`.
- **TanStack Query** — configured in `src/lib/query-client.js`.
- **localStorage keys** — daily workflow limits (`limiter_{mode}_{date}`), auth session, workflow state.

### Serverless API

`api/workflow-status.js` is a Vercel serverless function. `POST` receives n8n webhook callbacks (protected by `WORKFLOW_API_KEY`); `GET` returns workflow completion status. Backed by Upstash Redis with a 1-hour TTL.

### External Integrations

- **n8n** — webhooks fired from `Home.jsx`. There are 4 workflow modes, each capped at 5 runs per day via the `limiter_{mode}_{date}` localStorage key.
- **HubSpot** — CRM for contacts/deals; linked from `SendMessage` and `ClientDatabase`.
- **Google Sheets** — linked from `InteractionsReasoning` and `MaybeLeads` for data viewing and manual lead verdicts.

### Discovery pipeline (via GitHub Actions)

`api/runs.js` is the SPA's entry point into the lead-discovery pipeline. POST-only. It:

- Resolves `workspaceSlug` (default `"actuals"`) to a workspace id in Supabase (`workspaces.slug` → `id`); 404s if missing.
- Refuses with 409 if a `runs` row with `status="running"` already exists for that workspace.
- Inserts a new `runs` row (`status="running"`, `triggered_by="cloud-ui"`, empty `playbook`/`apify_run_ids`/`counts`) and returns its `id`.
- Dispatches `Hylkewierda/lead-discovery-service/.github/workflows/discover.yml` (`ref=main`) with inputs `{workspace, run_id}` via the GitHub `workflow_dispatch` API.
- On dispatch failure: updates the run row to `status="failed"` with the error text (first 200 chars) and 502s.

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`.

The actual discovery code lives in the separate `lead-discovery-service` GitHub repo — the SPA only dispatches it, never imports it. The CLI writes results back to the same Supabase `runs` row by `run_id`.

The `qualify-app` triage UI in `Lead_finder/` reaches the same CLI via a local `spawn` rather than GH Actions; see `Lead_finder/CLAUDE.md`.

### Autoresearch (Python)

`autoresearch/` is an offline optimization loop that iteratively improves `qualify_prompt.md` (the lead-scoring prompt) by measuring F1 against ground truth assembled from HubSpot deals (closedwon/closedlost) and human verdicts from a Google Sheet.

Loop:
1. `python evaluate.py export` → writes `results/leads_to_classify.json` (ground truth cached in `results/ground_truth_cache.json`).
2. Classifier (Claude / Groq) reads `qualify_prompt.md` + leads → `results/classifications.json`.
3. `python evaluate.py metrics` → prints F1/precision/recall/accuracy and top false positives/negatives; appends to `results/experiment_log.csv`.
4. Edit `qualify_prompt.md` (1–2 changes per iteration) and repeat.

Supporting files: `config.py`, `hubspot_client.py`, `program.md`, `requirements.txt`. Detailed Dutch-language explainer in `autoresearch/AUTORESEARCH_UITLEG.md`. Source CSV for human verdicts: `data/reasoning_data.csv`.

## Styling

Tailwind CSS with custom design tokens in `src/index.css`. Font: Plus Jakarta Sans. Key utility classes: `.glass-card`, `.glass-card-elevated`, `.premium-gradient`, `.accent-glow`. Accent color: emerald (HSL 155 60% 38%). All pages use Framer Motion stagger animations with the easing `[0.22, 1, 0.36, 1]`.

Standard page wrapper: `<div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8"><div className="w-full max-w-lg">…`.

## Deployment

Deployed to Vercel via GitHub (origin: `Hylkewierda/LeadFlow`). Push to `main` triggers auto-deploy. `vercel.json` handles SPA rewrites and `/api/*` routing.

## Environment Variables

- **Frontend (Vite):** `VITE_AUTH_USERS`
- **Vercel runtime:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WORKFLOW_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`
- **Autoresearch:** `HUBSPOT_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`
