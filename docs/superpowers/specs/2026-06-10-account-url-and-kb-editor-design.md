# Account-URL input, mode rename & in-app KB editor — design

**Date:** 2026-06-10
**Status:** approved
**Surfaces:** LeadFlow SPA (`lead-flow-311625f1`), `lead-discovery-service` CLI + GitHub Actions

Three changes, approved by Hylke on 2026-06-10:

1. The Home "All Posts" mode becomes URL-driven: the user enters the LinkedIn account to scrape.
2. The "Specific Posts" mode is renamed to "Coming from other profiles" (labels only).
3. A new in-app Knowledge Base editor lets the user sharpen and update the leadfinder's KB on the fly, with GitHub staying the canonical store.

---

## Part 1 — "All Posts" becomes "Account posts" with a URL input

### Current state

`Home.jsx` triggers `POST /api/workflows { mode: "all-posts" }`; the CLI's `src/workflows/modules/all-posts.ts` scrapes a **hardcoded** company URL (`WORKFLOW_COMPANY_URL` env, default `https://www.linkedin.com/company/actuals.io/posts/?feedView=all`).

### Target behaviour

- The Home card is relabelled **"Account posts"**, description *"Scrape de posts van een LinkedIn-account"*.
- The card contains a URL input with placeholder **"Vul URL in van het account dat je wil scrapen"**.
- Accepted URL types (both): **company pages** (`linkedin.com/company/…`) and **personal profiles** (`linkedin.com/in/…`). Client-side validation disables the start button until the URL matches one of these patterns.
- The URL is sent as `accountUrl` in the POST body, validated server-side (same two patterns, https, linkedin.com host), stored on the `workflow_runs` row (new `input_url` column, migration `016`), and passed to the GitHub workflow dispatch as input `account_url`.

### CLI / Actions changes (`lead-discovery-service`, branch target: `main`)

- `.github/workflows/run-workflow.yml`: new optional dispatch input `account_url`, exported as env `WORKFLOW_ACCOUNT_URL`.
- `src/workflows/modules/all-posts.ts`:
  - Reads `WORKFLOW_ACCOUNT_URL` first; falls back to the existing `WORKFLOW_COMPANY_URL` / actuals.io default so runs without a URL keep working.
  - URL detection: `/company/` → existing `scrapeCompanyPosts` (`apimaestro/linkedin-company-posts`); `/in/` → new `scrapeProfilePosts()` in `src/workflows/scrape.ts` using the apimaestro profile-posts actor, returning post URLs in the same shape.
- Unit tests (vitest): URL-type detection, actor routing for both URL types, fallback to default when no URL is provided.

### Error handling

- SPA: invalid URL → button disabled + inline hint; server 400 → toast with the validation message.
- CLI: unknown URL shape → fail the run with a clear error (finalize row as `failed`), never silently fall back to the default account when a URL *was* provided.

## Part 2 — "Specific Posts" → "Coming from other profiles"

Label-only change:

- `Home.jsx` `WORKFLOW_MODES`: `label: "Coming from other profiles"`, `description: "Posts van andere profielen analyseren"`.
- `Guide.jsx`: same rename in the modes overview.
- **Unchanged:** `apiMode: "specific-posts"`, `storageId: "specific_posts_v2"` (changing these would reset daily limits and break the API/workflow contract).

## Part 3 — In-app Knowledge Base editor (GitHub-backed)

### Decision: GitHub stays the canonical KB store

The KB lives committed in `Hylkewierda/lead-discovery-service` under `kb/<slug>/` (only Obsidian cache is gitignored). Cloud runs check out `main` fresh on every run, so **every commit is live on the next run with no deploy**. The app therefore edits the KB through the GitHub Contents API rather than moving content to Supabase. This keeps git history/rollback for free and keeps Obsidian/local editing workflows intact.

Rejected alternatives: Supabase `kb_files` table (requires rewriting the CLI KB loader across all pipelines, loses git history and Obsidian editing); hybrid notes-in-Supabase (two mechanisms to maintain for no real latency win).

### UI: new `KnowledgeBase` page

- New page `src/pages/KnowledgeBase.jsx`, reached via a button/card on the **Leadfinder** page (not in `NAV_ITEMS`). Dutch UI, standard glass-card styling and page wrapper.
- Two layers:
  1. **"Snelle update"** field at the top: free-text note about something new within Actuals (feature, customer case, ICP insight) + optional category tag. Submitting appends a dated section to `kb/actuals/updates.md` (file is created on first use). No file knowledge required — this is the on-the-fly path.
  2. **File browser/editor**: lists all `.md` files under `kb/actuals/` grouped by folder; selecting one opens a markdown editor (textarea + save). Existing files (`icp.md`, `exemplars.md`, MOCs, wiki…) can be edited; new files can be created.

### Backend: `api/kb.js` (Vercel serverless)

- Talks to the GitHub Contents API on `Hylkewierda/lead-discovery-service`, ref `main`, using the existing `GITHUB_PAT` Vercel env var.
- Routes: `GET ?op=tree` (file list), `GET ?op=file&path=…` (content + sha), `PUT { path, content, sha }` (update), `POST { path, content }` (create / quick-update append).
- Commit messages: `kb: update <path> via LeadFlow app` / `kb: snelle update via LeadFlow app`.
- Safety: server-side path validation — writes only within `kb/<slug>/`, `.md` files only, no `..` traversal. GitHub's required-`sha` update gives optimistic-locking conflict protection (409 → "bestand is intussen gewijzigd, herlaad").

### CLI change: make notes actually reach the prompts

Runs read a **hardcoded** KB page list (`src/kb/select.ts` `REQUIRED_PAGES`/`BEST_EFFORT_PAGES`); qualification reads only `icp.md` + `exemplars.md`; lookalike reads `icp.md`. Without wiring, `updates.md` would be invisible. Therefore:

- Add `updates.md` to `BEST_EFFORT_PAGES` in `src/kb/select.ts` (playbook generation sees it).
- Add an optional **"RECENTE UPDATES"** block to the qualify prompt (`src/qualify/prompt.ts`), loaded best-effort from `kb/<slug>/updates.md`, so quick notes influence lead scoring in all Home modes + discovery.

### Known limitation

Local qualify-app runs read `~/knowledge-bases/<slug>/` and only pick up app edits after a `git pull` / sync. Documented; acceptable since the production paths all run from the GitHub checkout.

## Testing

- **SPA (vitest):** `api/workflows` accepts/validates `accountUrl` and forwards `account_url` in the dispatch payload; `api/kb` path validation (rejects non-`kb/` paths, non-`.md`, traversal), tree/file/update happy paths with mocked `fetch`.
- **CLI (vitest):** all-posts URL detection + actor routing + fallback; `selectKbPages` includes `updates.md` when present; qualify prompt includes the updates block when the file exists.
- **UI:** manual verification via `npm run dev` (consistent with existing practice — UI components have no automated tests).

## Out of scope

- Multi-workspace KB switching in the editor UI (hardcode `actuals` for now, mirroring the rest of the SPA).
- Auth/roles on KB editing (single-user app behind existing login).
- Cancellation changes — the account-URL run reuses the existing cooperative-cancel wiring untouched.
