# Account-URL Input, Mode Rename & In-App KB Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Home "All Posts" mode scrape a user-supplied LinkedIn account URL, rename "Specific Posts" to "Coming from other profiles", and add a GitHub-backed Knowledge Base editor page to the SPA so the user can sharpen the leadfinder's KB on the fly.

**Architecture:** Two repos. The CLI repo (`Lead_finder/lead-discovery-service`) gains a profile-posts scraper, account-URL routing in the all-posts module, a `account_url` workflow-dispatch input, and `updates.md` wiring into playbook selection + qualify prompt. The SPA repo (`lead-flow-311625f1`) gains the URL input on Home, validation + pass-through in `api/workflows.js`, a new `api/kb.js` proxy to the GitHub Contents API, and a new `KnowledgeBase` page. Spec: `docs/superpowers/specs/2026-06-10-account-url-and-kb-editor-design.md`.

**Tech Stack:** TypeScript + vitest (CLI), React 18 + Vite + vitest (SPA), Vercel serverless, GitHub Contents/Trees API, Apify actor `apimaestro/linkedin-profile-posts`.

---

## ⚠️ Cross-repo ordering constraint

**Tasks 1–7 (CLI repo) must be merged to `origin/main` of `Hylkewierda/lead-discovery-service` BEFORE the SPA changes (Tasks 8–12) are pushed/deployed.** `api/workflows.js` will send a new `account_url` dispatch input; GitHub rejects a `workflow_dispatch` with HTTP 422 if the workflow file on `main` does not declare that input. The in-app KB editor also commits to `main` of that repo.

The CLI repo working tree is currently on branch `feat/view-leads-sheet` (unmerged work — do not touch it). All CLI tasks happen on a new branch off `origin/main`. **Code shown in this plan for CLI files matches `origin/main`, which differs slightly from the checked-out branch — always verify against the actual file after checkout.**

## File structure

**CLI repo (`Lead_finder/lead-discovery-service/`), branch `feat/account-url-and-kb-updates` off `origin/main`:**
- Modify: `src/workflows/scrape.ts` — add `scrapeProfilePosts()` (new actor, same injection pattern as `scrapeCompanyPosts`)
- Modify: `src/workflows/modules/all-posts.ts` — `WORKFLOW_ACCOUNT_URL` routing (company vs profile vs default)
- Modify: `.github/workflows/run-workflow.yml` — optional `account_url` input → `WORKFLOW_ACCOUNT_URL` env
- Create: `src/qualify/updates.ts` — `loadUpdates(kbRoot, slug)` (mirrors `exemplars.ts` / `lookalike/icp.ts`)
- Modify: `src/qualify/prompt.ts` — optional 4th `updates` param → "RECENTE UPDATES" block
- Modify: `src/qualify/apply.ts`, `src/workflows/enrich-qualify.ts` — load + pass updates
- Modify: `src/kb/select.ts` — `updates.md` in `BEST_EFFORT_PAGES`
- Create: `scripts/sql/016_workflow_runs_input_url.sql`; Modify: `scripts/bootstrap-supabase.*` migrations array
- Tests: `tests/unit/scrape.test.ts`, `tests/unit/all-posts.test.ts`, `tests/unit/qualify-updates.test.ts` (new), `tests/unit/qualify-prompt.test.ts`, `tests/unit/kb-select.test.ts`

**SPA repo (`lead-flow-311625f1/`):**
- Modify: `api/workflows.js` — accept/validate `accountUrl`, store `input_url`, dispatch `account_url`
- Modify: `src/pages/Home.jsx` — "Account posts" card with URL input; "Coming from other profiles" rename
- Modify: `src/pages/Guide.jsx` — both renames in the workflows section
- Create: `api/kb.js` — GitHub-backed KB endpoints (tree/file/update/create/quick-update)
- Create: `src/pages/KnowledgeBase.jsx` — quick-update form + file browser/editor
- Modify: `src/pages.config.js` — register `KnowledgeBase` (same manual pattern as `LookalikeSearch`)
- Modify: `src/pages/Leadfinder.jsx` — entry card to the KB page
- Tests: `tests/workflows.test.js` (extend), `tests/kb.test.js` (new)

---

### Task 1: CLI repo branch + baseline

**Files:** none (setup)

- [ ] **Step 1: Branch off origin/main**

```bash
cd /Users/hylkewierda/Documents/Actuals/Leadflow_AgentOrchestration/Lead_finder/lead-discovery-service
git fetch origin
git status --short   # MUST be clean; current branch feat/view-leads-sheet stays untouched
git checkout -b feat/account-url-and-kb-updates origin/main
npm ci
```

- [ ] **Step 2: Baseline test run**

Run: `npm test`
Expected: full suite PASS (if anything fails on a fresh origin/main checkout, STOP and report — don't build on a broken baseline).

### Task 2: `scrapeProfilePosts()` in the CLI

**Files:**
- Modify: `src/workflows/scrape.ts` (add below `scrapeCompanyPosts`, ~line 94)
- Test: `tests/unit/scrape.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/scrape.test.ts` (match the file's existing imports/style — it already imports `vi`, `it`, `expect` and tests via injected `runActor`):

```ts
it("scrapeProfilePosts calls the profile-posts actor and extracts post urls", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const runActor = vi.fn(async (a: Record<string, unknown>) => {
    calls.push(a);
    return { items: [{ url: "https://li/posts/p1?utm=x" }, { post_url: "https://li/posts/p2" }, { other: 1 }] };
  });
  const urls = await scrapeProfilePosts({
    client: {} as never,
    profileUrl: "https://www.linkedin.com/in/janedoe/",
    limit: 5,
    runActor: runActor as never,
  });
  expect(runActor).toHaveBeenCalledTimes(1);
  expect(calls[0].actorId).toBe("apimaestro/linkedin-profile-posts");
  expect(calls[0].input).toEqual({ username: "https://www.linkedin.com/in/janedoe/", total_posts: 5 });
  expect(urls).toEqual(["https://li/posts/p1", "https://li/posts/p2"]);
});
```

Add `scrapeProfilePosts` to the import from `../../src/workflows/scrape.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scrape.test.ts`
Expected: FAIL — `scrapeProfilePosts` is not exported.

- [ ] **Step 3: Implement `scrapeProfilePosts`**

In `src/workflows/scrape.ts`, directly after the `scrapeCompanyPosts` function:

```ts
const PROFILE_POSTS_ACTOR = "apimaestro/linkedin-profile-posts";

export interface ScrapeProfilePostsInput {
  client: ApifyClient;
  profileUrl: string;
  limit: number;
  runActor?: RunActorFn;
  cancellation?: CancellationToken;
}

/**
 * Scrape recent post URLs from a personal LinkedIn profile (linkedin.com/in/…).
 * Companion to scrapeCompanyPosts for the account-URL driven all-posts mode.
 * The actor accepts a full profile URL or bare username in `username`.
 */
export async function scrapeProfilePosts(input: ScrapeProfilePostsInput): Promise<string[]> {
  const exec = input.runActor ?? ((a) => runActor({ ...a, pollIntervalMs: 10_000, timeoutMs: 10 * 60_000, cancellation: input.cancellation }));
  const res = await exec({
    client: input.client,
    actorId: PROFILE_POSTS_ACTOR,
    input: { username: input.profileUrl, total_posts: input.limit },
  });
  const items = Array.isArray(res.items) ? (res.items as Array<Record<string, any>>) : [];
  const urls: string[] = [];
  for (const it of items.slice(0, input.limit)) {
    const u = it?.url ?? it?.post_url;
    if (typeof u === "string" && u.length > 0) urls.push(stripQuery(u));
  }
  return urls;
}
```

> Verified against the actor's input schema (`username` required; `total_posts` enables auto-pagination). The output post-URL field is not documented — the dual `url`/`post_url` read covers apimaestro's known shapes, but **verify with one live actor run during final verification** (Task 7 Step 3).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scrape.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/workflows/scrape.ts tests/unit/scrape.test.ts
git commit -m "feat: scrapeProfilePosts for personal-profile post scraping"
```

### Task 3: Account-URL routing in `all-posts.ts`

**Files:**
- Modify: `src/workflows/modules/all-posts.ts`
- Test: `tests/unit/all-posts.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/all-posts.test.ts`. Add `afterEach` + env hygiene at the top of the file (`import { it, expect, vi, afterEach } from "vitest";` and `afterEach(() => vi.unstubAllEnvs());`). Helper deps for these tests:

```ts
function makeDeps() {
  return {
    scrapeCompanyPostsImpl: vi.fn(async () => ["https://li/posts/p1"]),
    scrapeProfilePostsImpl: vi.fn(async () => ["https://li/posts/p2"]),
    scrapePostReactionsImpl: vi.fn(async () => []),
    enrichAndQualifyImpl: vi.fn(async () => ({ reasoningRows: [], maybeRows: [] })),
  };
}
const baseCtx = { mode: "all-posts", runId: "r1", logger: log, apify: {}, anthropic: {}, kbRoot: "/kb", slug: "actuals" };

it("routes a company WORKFLOW_ACCOUNT_URL to scrapeCompanyPosts", async () => {
  vi.stubEnv("WORKFLOW_ACCOUNT_URL", "https://www.linkedin.com/company/some-co/");
  const deps = makeDeps();
  await allPostsRun(baseCtx as never, deps as never);
  expect(deps.scrapeCompanyPostsImpl).toHaveBeenCalledWith(
    expect.objectContaining({ companyUrl: "https://www.linkedin.com/company/some-co/" }),
  );
  expect(deps.scrapeProfilePostsImpl).not.toHaveBeenCalled();
});

it("routes a personal-profile WORKFLOW_ACCOUNT_URL to scrapeProfilePosts", async () => {
  vi.stubEnv("WORKFLOW_ACCOUNT_URL", "https://www.linkedin.com/in/janedoe/");
  const deps = makeDeps();
  await allPostsRun(baseCtx as never, deps as never);
  expect(deps.scrapeProfilePostsImpl).toHaveBeenCalledWith(
    expect.objectContaining({ profileUrl: "https://www.linkedin.com/in/janedoe/" }),
  );
  expect(deps.scrapeCompanyPostsImpl).not.toHaveBeenCalled();
});

it("fails (never falls back) when WORKFLOW_ACCOUNT_URL is set but unrecognised", async () => {
  vi.stubEnv("WORKFLOW_ACCOUNT_URL", "https://example.com/whatever");
  const deps = makeDeps();
  await expect(allPostsRun(baseCtx as never, deps as never)).rejects.toThrow(/WORKFLOW_ACCOUNT_URL/);
  expect(deps.scrapeCompanyPostsImpl).not.toHaveBeenCalled();
  expect(deps.scrapeProfilePostsImpl).not.toHaveBeenCalled();
});

it("falls back to the default company URL when no account url is set", async () => {
  const deps = makeDeps();
  await allPostsRun(baseCtx as never, deps as never);
  expect(deps.scrapeCompanyPostsImpl).toHaveBeenCalledWith(
    expect.objectContaining({ companyUrl: "https://www.linkedin.com/company/actuals.io/posts/?feedView=all" }),
  );
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/all-posts.test.ts`
Expected: the 4 new tests FAIL (`scrapeProfilePostsImpl` never called / no routing); the 3 existing tests still pass.

- [ ] **Step 3: Implement the routing**

In `src/workflows/modules/all-posts.ts`:

1. Extend the imports and deps:

```ts
import { scrapeCompanyPosts, scrapeProfilePosts, scrapePostReactions, type EngagerRow } from "../scrape.js";

export interface AllPostsDeps {
  scrapeCompanyPostsImpl: typeof scrapeCompanyPosts;
  scrapeProfilePostsImpl: typeof scrapeProfilePosts;
  scrapePostReactionsImpl: typeof scrapePostReactions;
  enrichAndQualifyImpl: typeof enrichAndQualify;
}

const realDeps: AllPostsDeps = {
  scrapeCompanyPostsImpl: scrapeCompanyPosts,
  scrapeProfilePostsImpl: scrapeProfilePosts,
  scrapePostReactionsImpl: scrapePostReactions,
  enrichAndQualifyImpl: enrichAndQualify,
};
```

2. Replace the `companyUrl`/`scrapeCompanyPostsImpl` block at the top of `allPostsRun` (the `const companyUrl = …` through the `const postUrls = await deps.scrapeCompanyPostsImpl(…)` lines) with:

```ts
  const accountUrl = process.env.WORKFLOW_ACCOUNT_URL?.trim() || null;
  const limit = process.env.WORKFLOW_COMPANY_POST_LIMIT
    ? Number(process.env.WORKFLOW_COMPANY_POST_LIMIT)
    : 5;

  let postUrls: string[];
  if (accountUrl && /linkedin\.com\/in\//i.test(accountUrl)) {
    ctx.logger.info({ accountUrl, limit }, "all-posts: scraping profile posts");
    postUrls = await deps.scrapeProfilePostsImpl({ client: ctx.apify, profileUrl: accountUrl, limit, cancellation: ctx.cancellation });
  } else if (accountUrl && /linkedin\.com\/company\//i.test(accountUrl)) {
    ctx.logger.info({ accountUrl, limit }, "all-posts: scraping company posts");
    postUrls = await deps.scrapeCompanyPostsImpl({ client: ctx.apify, companyUrl: accountUrl, limit, cancellation: ctx.cancellation });
  } else if (accountUrl) {
    // A URL was explicitly provided — failing beats silently scraping the default account.
    throw new Error(`WORKFLOW_ACCOUNT_URL is not a LinkedIn company/profile URL: ${accountUrl}`);
  } else {
    const companyUrl =
      process.env.WORKFLOW_COMPANY_URL ??
      "https://www.linkedin.com/company/actuals.io/posts/?feedView=all";
    ctx.logger.info({ companyUrl, limit }, "all-posts: scraping company posts");
    postUrls = await deps.scrapeCompanyPostsImpl({ client: ctx.apify, companyUrl, limit, cancellation: ctx.cancellation });
  }
  ctx.logger.info({ posts: postUrls.length }, "all-posts: scraping reactions per post");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/all-posts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/workflows/modules/all-posts.ts tests/unit/all-posts.test.ts
git commit -m "feat: route all-posts by WORKFLOW_ACCOUNT_URL (company vs profile)"
```

### Task 4: `account_url` dispatch input in the GitHub workflow

**Files:**
- Modify: `.github/workflows/run-workflow.yml`

(No unit test possible — YAML config; verified live in Task 7.)

- [ ] **Step 1: Add the input**

Under `on.workflow_dispatch.inputs`, after the `run_id` block:

```yaml
      account_url:
        description: "Optional LinkedIn account URL (company page or profile) for all-posts"
        required: false
        type: string
        default: ""
```

- [ ] **Step 2: Add the env line**

In the `Run workflow CLI` step's `env:` block, after `WORKFLOW_MAX_PER_RUN: "25"`:

```yaml
          WORKFLOW_ACCOUNT_URL: ${{ inputs.account_url }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/run-workflow.yml
git commit -m "feat: account_url dispatch input -> WORKFLOW_ACCOUNT_URL"
```

### Task 5: `updates.md` wiring (loader, prompt block, KB selection)

**Files:**
- Create: `src/qualify/updates.ts`
- Modify: `src/qualify/prompt.ts`, `src/qualify/apply.ts`, `src/workflows/enrich-qualify.ts`, `src/kb/select.ts`
- Test: `tests/unit/qualify-updates.test.ts` (new), `tests/unit/qualify-prompt.test.ts`, `tests/unit/kb-select.test.ts`

- [ ] **Step 1: Write the failing loader test**

Create `tests/unit/qualify-updates.test.ts`:

```ts
import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUpdates } from "../../src/qualify/updates.js";

it("returns null when updates.md does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  expect(await loadUpdates(root, "actuals")).toBeNull();
});

it("returns trimmed content when updates.md exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  await mkdir(join(root, "actuals"), { recursive: true });
  await writeFile(join(root, "actuals", "updates.md"), "\n## 2026-06-10\n\nNieuwe PSP-connector.\n\n");
  expect(await loadUpdates(root, "actuals")).toBe("## 2026-06-10\n\nNieuwe PSP-connector.");
});

it("returns null for an empty file", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  await mkdir(join(root, "actuals"), { recursive: true });
  await writeFile(join(root, "actuals", "updates.md"), "   \n");
  expect(await loadUpdates(root, "actuals")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/qualify-updates.test.ts`
Expected: FAIL — module `src/qualify/updates.ts` does not exist.

- [ ] **Step 3: Implement the loader**

Create `src/qualify/updates.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Load recent free-text updates from `<kbRoot>/<slug>/updates.md`.
 * The file is appended to from the LeadFlow app ("snelle update") and injected
 * into the qualify system prompt as a RECENTE UPDATES block. Best-effort:
 * missing or empty file → null (the block is simply omitted).
 */
export async function loadUpdates(kbRoot: string, slug: string): Promise<string | null> {
  const path = join(kbRoot, slug, "updates.md");
  try {
    const content = (await readFile(path, "utf8")).trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the loader test — verify PASS**

Run: `npx vitest run tests/unit/qualify-updates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing prompt-block tests**

Append to `tests/unit/qualify-prompt.test.ts` (match its existing import of `buildSystemPrompt`):

```ts
it("includes a RECENTE UPDATES block when updates are provided", () => {
  const p = buildSystemPrompt([], undefined, undefined, "## 2026-06-10\nNieuwe PSP-connector.");
  expect(p).toContain("RECENTE UPDATES");
  expect(p).toContain("Nieuwe PSP-connector.");
});

it("omits the RECENTE UPDATES block when updates are absent", () => {
  expect(buildSystemPrompt([])).not.toContain("RECENTE UPDATES");
  expect(buildSystemPrompt([], undefined, undefined, "   ")).not.toContain("RECENTE UPDATES");
});

it("keeps only the most recent updates when the file is huge", () => {
  const updates = "OLD-MARKER\n" + "x".repeat(4100) + "\nNEW-MARKER";
  const p = buildSystemPrompt([], undefined, undefined, updates);
  expect(p).toContain("NEW-MARKER");
  expect(p).not.toContain("OLD-MARKER");
});
```

- [ ] **Step 6: Run to verify FAIL, then implement the prompt block**

Run: `npx vitest run tests/unit/qualify-prompt.test.ts` → new tests FAIL.

In `src/qualify/prompt.ts`:

1. Below `const MAX_STEERING = 1500;` add:

```ts
/** Max chars of updates.md injected; we keep the TAIL (newest entries are appended last). */
const MAX_UPDATES = 4000;
```

2. Extend the signature:

```ts
export function buildSystemPrompt(
  exemplars: Exemplar[],
  feedback?: string | null,
  icp?: string | null,
  updates?: string | null,
): string {
```

3. After the `feedbackBlock` definition, add:

```ts
  const trimmedUpdates = (updates ?? "").trim().slice(-MAX_UPDATES);
  const updatesBlock = trimmedUpdates
    ? `\nRECENTE UPDATES (laatste ontwikkelingen binnen Actuals — neem mee in je beoordeling, kan ICP-details actualiseren):\n${trimmedUpdates}\n`
    : "";
```

4. In the template literal, change the block-interpolation line `${icpBlock}${exemplarBlock}${feedbackBlock}` to `${icpBlock}${exemplarBlock}${feedbackBlock}${updatesBlock}`.

5. Update the composition doc-comment above the function: add a line `*  6. Optional RECENTE UPDATES block (kb/<slug>/updates.md — app-maintained recent changes)`.

Run: `npx vitest run tests/unit/qualify-prompt.test.ts` → PASS.

- [ ] **Step 7: Wire the loader into both qualification entry points**

In `src/qualify/apply.ts`:

```ts
import { loadUpdates } from "./updates.js";
```

and change (the call looks the same on origin/main as shown here):

```ts
  const exemplars = await loadExemplars(input.kbRoot, input.slug);
  const systemPrompt = buildSystemPrompt(exemplars, input.scopeSteering);
```

to:

```ts
  const exemplars = await loadExemplars(input.kbRoot, input.slug);
  const updates = await loadUpdates(input.kbRoot, input.slug);
  const systemPrompt = buildSystemPrompt(exemplars, input.scopeSteering, undefined, updates);
```

In `src/workflows/enrich-qualify.ts`:

```ts
import { loadUpdates } from "../qualify/updates.js";
```

and change:

```ts
    const exemplars = await loadExemplars(input.kbRoot, input.slug);
    const systemPrompt = buildSystemPrompt(exemplars);
```

to:

```ts
    const exemplars = await loadExemplars(input.kbRoot, input.slug);
    const updates = await loadUpdates(input.kbRoot, input.slug);
    const systemPrompt = buildSystemPrompt(exemplars, undefined, undefined, updates);
```

- [ ] **Step 8: Add `updates.md` to the playbook page selection (TDD)**

Append to `tests/unit/kb-select.test.ts` (reuse the file's existing temp-KB setup helper if present; otherwise this standalone test):

```ts
it("picks up updates.md as a best-effort page when present", async () => {
  // Arrange a minimal KB with all REQUIRED_PAGES plus updates.md, then:
  const sel = await selectKbPages(kbRoot);
  expect(sel.bestEffort.map((p) => p.relPath)).toContain("updates.md");
});
```

(Adapt to the file's existing fixture pattern — it already creates the 5 required pages for its happy-path test; extend that fixture with `updates.md`.)

Run: `npx vitest run tests/unit/kb-select.test.ts` → new test FAILS.

In `src/kb/select.ts`, add `"updates.md",` as the first entry of `BEST_EFFORT_PAGES`:

```ts
const BEST_EFFORT_PAGES = [
  "updates.md",
  "MOCs/MOC - Competitors.md",
  ...
```

Run: `npx vitest run tests/unit/kb-select.test.ts` → PASS.

- [ ] **Step 9: Full suite + commit**

Run: `npm test` and `npm run typecheck`
Expected: PASS, no type errors.

```bash
git add src/qualify/updates.ts src/qualify/prompt.ts src/qualify/apply.ts src/workflows/enrich-qualify.ts src/kb/select.ts tests/unit/qualify-updates.test.ts tests/unit/qualify-prompt.test.ts tests/unit/kb-select.test.ts
git commit -m "feat: inject kb updates.md into playbook selection and qualify prompt"
```

### Task 6: Migration 016 (`workflow_runs.input_url`)

**Files:**
- Create: `scripts/sql/016_workflow_runs_input_url.sql`
- Modify: `scripts/bootstrap-supabase.*` (the hard-coded migrations array — find it with `grep -n "015" scripts/bootstrap-supabase*`)

- [ ] **Step 1: Write the migration**

Create `scripts/sql/016_workflow_runs_input_url.sql`:

```sql
-- Account-URL driven all-posts runs: store the user-provided LinkedIn URL
-- for traceability (the actual value travels via the GH dispatch input).
alter table workflow_runs add column if not exists input_url text;
```

- [ ] **Step 2: Register it in the bootstrap array**

Add `"016_workflow_runs_input_url.sql",` after the `015_…` entry in the migrations array.

- [ ] **Step 3: Commit & flag for manual application**

```bash
git add scripts/sql/016_workflow_runs_input_url.sql scripts/bootstrap-supabase.*
git commit -m "feat: migration 016 - workflow_runs.input_url"
```

**⚠️ Report to the user:** migration 016 must be applied manually in the Supabase SQL editor (established practice — see the cancellation migrations). The SPA insert will fail with a column error until it is applied.

### Task 7: CLI verification + merge to main

**Files:** none (verification)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 2: Push and open a PR to main**

```bash
git push -u origin feat/account-url-and-kb-updates
gh pr create --title "Account-URL all-posts + KB updates wiring" --body "$(cat <<'EOF'
- all-posts: WORKFLOW_ACCOUNT_URL routing (company page vs personal profile, new profile-posts actor)
- run-workflow.yml: optional account_url dispatch input
- updates.md: loaded into playbook selection + qualify prompt (RECENTE UPDATES block)
- migration 016: workflow_runs.input_url (apply manually)

Spec: lead-flow-311625f1/docs/superpowers/specs/2026-06-10-account-url-and-kb-editor-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge after review. **Tasks 8–12 may be implemented in parallel locally, but the SPA must not be pushed/deployed before this PR is on `main`.**

- [ ] **Step 3: Live smoke test (after merge, requires user OK — costs Apify credits)**

Trigger one `all-posts` dispatch with a real `account_url` pointing at a low-volume personal profile and confirm the run completes and post URLs were found (checks the undocumented actor output field from Task 2). Ask the user before spending.

### Task 8: SPA — `api/workflows.js` accepts `accountUrl`

**Files:**
- Modify: `api/workflows.js`
- Test: `tests/workflows.test.js`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("POST /api/workflows", …)` block of `tests/workflows.test.js`:

```js
it("400 when accountUrl is not a LinkedIn account URL", async () => {
  const [req, res] = makeReqRes("POST", { mode: "all-posts", accountUrl: "https://example.com/x" });
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(insertCalls).toHaveLength(0);
});

it("stores input_url and dispatches account_url for a company URL", async () => {
  const url = "https://www.linkedin.com/company/some-co/";
  const [req, res] = makeReqRes("POST", { mode: "all-posts", accountUrl: url });
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(insertCalls[0].input_url).toBe(url);
  const body = JSON.parse(fetchCalls[0].opts.body);
  expect(body.inputs.account_url).toBe(url);
});

it("accepts a personal profile URL and defaults account_url to empty when absent", async () => {
  const [req1, res1] = makeReqRes("POST", { mode: "all-posts", accountUrl: "https://www.linkedin.com/in/janedoe" });
  await handler(req1, res1);
  expect(res1.statusCode).toBe(200);

  fetchCalls.length = 0; insertCalls.length = 0;
  const [req2, res2] = makeReqRes("POST", { mode: "stub" });
  await handler(req2, res2);
  expect(res2.statusCode).toBe(200);
  expect(insertCalls[0].input_url).toBeNull();
  expect(JSON.parse(fetchCalls[0].opts.body).inputs.account_url).toBe("");
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd /Users/hylkewierda/Documents/Actuals/Leadflow_AgentOrchestration/lead-flow-311625f1 && npx vitest run tests/workflows.test.js`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement**

In `api/workflows.js`:

1. Below the `DAILY_LIMIT` const:

```js
const ACCOUNT_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/(company|in)\/[^/?#]+/i;
```

2. After the mode-validation block (`if (!VALID_MODES.includes(mode)) …`):

```js
  let accountUrl = null;
  if (req.body?.accountUrl != null && String(req.body.accountUrl).trim() !== "") {
    accountUrl = String(req.body.accountUrl).trim();
    if (!ACCOUNT_URL_RE.test(accountUrl)) {
      return res.status(400).json({ error: "accountUrl must be a linkedin.com/company/... or linkedin.com/in/... URL" });
    }
  }
```

3. Extend the insert payload: `{ mode, status: "running", triggered_by: "cloud-ui", counts: {}, input_url: accountUrl }`.

4. Extend the dispatch body inputs: `inputs: { mode, run_id: inserted.data.id, account_url: accountUrl ?? "" }`.

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run tests/workflows.test.js`
Expected: all PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add api/workflows.js tests/workflows.test.js
git commit -m "feat: accept accountUrl for all-posts and forward as account_url dispatch input"
```

### Task 9: SPA — Home card with URL input + renames

**Files:**
- Modify: `src/pages/Home.jsx`, `src/pages/Guide.jsx`

(UI — no automated tests per project practice; manual verify in Step 4.)

- [ ] **Step 1: Update the mode config in `Home.jsx`**

Replace the `AllPosts` and `SpecificPosts` entries in `WORKFLOW_MODES`:

```js
  { id: "AllPosts", storageId: "all_posts", label: "Account posts", description: "Scrape de posts van een LinkedIn-account", sheetUrl: null, apiMode: "all-posts", requiresUrl: true },
  { id: "SpecificPosts", storageId: "specific_posts_v2", label: "Coming from other profiles", description: "Posts van andere profielen analyseren", sheetUrl: "https://docs.google.com/spreadsheets/d/1VUHdVrfQbsL8nYMoD1nhAq1ayFFpy77W3Eu7je1CdAc", apiMode: "specific-posts" },
```

Below `WORKFLOW_MODES`, add:

```js
const ACCOUNT_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/(company|in)\/[^/?#]+/i;
```

- [ ] **Step 2: Add state + request body**

In the `Home` component, next to the other `useState` hooks:

```js
const [accountUrl, setAccountUrl] = useState("");
```

In `triggerWorkflow`, change the fetch body to include the URL for URL-driven modes:

```js
        body: JSON.stringify({
          mode: workflowMode.apiMode,
          ...(workflowMode.requiresUrl ? { accountUrl: accountUrl.trim() } : {}),
        }),
```

- [ ] **Step 3: Render the URL-input card variant**

Inside the `WORKFLOW_MODES.map`, the current card is one big `<button>` (a nested input inside a button is invalid HTML). Compute per-mode:

```js
const urlValid = !mode.requiresUrl || ACCOUNT_URL_RE.test(accountUrl.trim());
```

and include it in the disable logic of the start control for that mode. For `mode.requiresUrl`, render this variant instead of the `<button>` card (same outer `flex gap-2.5` wrapper and progress bar markup as the existing card — keep classNames identical where shown):

```jsx
<div className={`flex-1 glass-card rounded-2xl p-4 text-left transition-all duration-300 ${isDisabled ? "opacity-50" : ""}`}>
  <div className="flex items-center justify-between mb-3">
    <div>
      <h3 className="text-[15px] font-semibold text-foreground">{mode.label}</h3>
      <p className="text-[12px] text-muted-foreground mt-0.5">{mode.description}</p>
    </div>
    <button
      onClick={() => triggerWorkflow(mode.id)}
      disabled={isDisabled || !urlValid}
      aria-label={`Start ${mode.label}`}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
        isLimitReached ? "bg-muted" : isDisabled || !urlValid ? "bg-foreground/[0.06] cursor-not-allowed" : "bg-foreground/[0.06] hover:bg-accent hover:accent-glow cursor-pointer group/start"
      }`}
    >
      {isLimitReached ? <Lock className="w-4 h-4 text-muted-foreground" />
        : isLoading === mode.id ? <Loader2 className="w-4 h-4 animate-spin text-foreground" />
        : <Zap className={`w-4 h-4 ${isDisabled || !urlValid ? "text-muted-foreground" : "text-foreground/60"}`} />}
    </button>
  </div>
  <input
    type="url"
    value={accountUrl}
    onChange={(e) => setAccountUrl(e.target.value)}
    disabled={isDisabled}
    placeholder="Vul URL in van het account dat je wil scrapen"
    className="w-full mb-3 px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
  />
  {/* progress bar: copy the existing progress-bar JSX block unchanged */}
</div>
```

(The non-`requiresUrl` modes keep the existing `<button>` card untouched.)

- [ ] **Step 4: Rename in `Guide.jsx`**

In the `workflows` section's mode list (~line 78), replace the two entries:

```js
            {
              name: "Account posts",
              desc: "Vul de URL in van een LinkedIn-account (bedrijfspagina of persoonlijk profiel) en analyseer wie er op de posts reageert.",
            },
            {
              name: "Coming from other profiles",
              desc: "Analyseer alleen specifieke posts van andere profielen die je hebt toegevoegd aan de bijbehorende Google Sheet.",
            },
```

- [ ] **Step 5: Manual verify + lint**

Run: `npm run lint && npm run dev`
Check on `http://localhost:5173`: Account posts card shows the input; start button stays disabled for garbage input, enables for `https://www.linkedin.com/company/actuals.io/`; the other three cards behave as before; Specific Posts shows the new label. (Starting a real run from dev hits production Supabase — don't click start unless intended.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Home.jsx src/pages/Guide.jsx
git commit -m "feat: account-URL input on Home + rename Specific Posts to Coming from other profiles"
```

### Task 10: SPA — `api/kb.js` (GitHub-backed KB endpoints)

**Files:**
- Create: `api/kb.js`
- Test: `tests/kb.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/kb.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchCalls = [];
let fetchResponses = [];
const fetchMock = vi.fn(async (url, opts) => {
  fetchCalls.push({ url, opts });
  const next = fetchResponses.shift() ?? { status: 200, body: {} };
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    json: async () => next.body,
    text: async () => JSON.stringify(next.body),
  };
});
vi.stubGlobal("fetch", fetchMock);

let handler;
beforeEach(async () => {
  fetchCalls.length = 0;
  fetchResponses = [];
  process.env.GITHUB_PAT = "ghp_test";
  handler = (await import("../api/kb.js")).default;
});

function makeReqRes(method, body, query = {}) {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return [{ method, body, query }, res];
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

describe("GET /api/kb", () => {
  it("op=tree returns only kb/actuals markdown files", async () => {
    fetchResponses = [{ status: 200, body: { tree: [
      { path: "kb/actuals/icp.md", type: "blob" },
      { path: "kb/actuals/MOCs/MOC - Product.md", type: "blob" },
      { path: "src/index.ts", type: "blob" },
      { path: "kb/actuals/raw", type: "tree" },
      { path: "kb/actuals/.gitignore", type: "blob" },
    ] } }];
    const [req, res] = makeReqRes("GET", null, { op: "tree" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.files.map((f) => f.path)).toEqual(["kb/actuals/icp.md", "kb/actuals/MOCs/MOC - Product.md"]);
  });

  it("op=file decodes content and returns sha; rejects unsafe paths", async () => {
    fetchResponses = [{ status: 200, body: { sha: "abc", content: b64("# ICP") } }];
    const [req, res] = makeReqRes("GET", null, { op: "file", path: "kb/actuals/icp.md" });
    await handler(req, res);
    expect(res.body).toEqual({ path: "kb/actuals/icp.md", sha: "abc", content: "# ICP" });

    const [req2, res2] = makeReqRes("GET", null, { op: "file", path: "kb/actuals/../../secrets.md" });
    await handler(req2, res2);
    expect(res2.statusCode).toBe(400);
    const [req3, res3] = makeReqRes("GET", null, { op: "file", path: "src/index.ts" });
    await handler(req3, res3);
    expect(res3.statusCode).toBe(400);
  });
});

describe("PUT /api/kb", () => {
  it("commits the update with sha and maps GitHub 409 to 409", async () => {
    fetchResponses = [{ status: 200, body: { content: { sha: "new" } } }];
    const [req, res] = makeReqRes("PUT", { path: "kb/actuals/icp.md", content: "# ICP v2", sha: "abc" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[0].opts.body);
    expect(sent.sha).toBe("abc");
    expect(sent.branch).toBe("main");
    expect(Buffer.from(sent.content, "base64").toString("utf8")).toBe("# ICP v2");
    expect(sent.message).toMatch(/icp\.md/);

    fetchResponses = [{ status: 409, body: {} }];
    const [req2, res2] = makeReqRes("PUT", { path: "kb/actuals/icp.md", content: "x", sha: "stale" });
    await handler(req2, res2);
    expect(res2.statusCode).toBe(409);
  });
});

describe("POST /api/kb", () => {
  it("op=create writes a new file without sha", async () => {
    fetchResponses = [{ status: 201, body: { content: { sha: "n1" } } }];
    const [req, res] = makeReqRes("POST", { op: "create", path: "kb/actuals/nieuw.md", content: "# Nieuw" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(fetchCalls[0].opts.body).sha).toBeUndefined();
  });

  it("op=quick-update appends a dated section to existing updates.md", async () => {
    fetchResponses = [
      { status: 200, body: { sha: "u1", content: b64("# Updates\n\n## 2026-06-01\n\nOud.\n") } },
      { status: 200, body: { content: { sha: "u2" } } },
    ];
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "Nieuwe PSP-connector live.", category: "Product" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[1].opts.body);
    const written = Buffer.from(sent.content, "base64").toString("utf8");
    expect(written).toContain("## 2026-06-01");
    expect(written).toMatch(/## \d{4}-\d{2}-\d{2} — Product\n\nNieuwe PSP-connector live\./);
    expect(sent.sha).toBe("u1");
  });

  it("op=quick-update creates updates.md when it does not exist yet", async () => {
    fetchResponses = [
      { status: 404, body: {} },
      { status: 201, body: { content: { sha: "u1" } } },
    ];
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "Eerste notitie" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[1].opts.body);
    expect(sent.sha).toBeUndefined();
    expect(Buffer.from(sent.content, "base64").toString("utf8")).toContain("Eerste notitie");
  });

  it("rejects an empty note", async () => {
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "  " });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run tests/kb.test.js`
Expected: FAIL — `api/kb.js` does not exist.

- [ ] **Step 3: Implement `api/kb.js`**

```js
// GitHub-backed Knowledge Base endpoints for the KnowledgeBase page.
// The KB is canonically the kb/actuals/ folder of the lead-discovery-service
// repo on main: every cloud run checks that repo out fresh, so a commit here
// is live on the next run without any deploy.
const REPO = "Hylkewierda/lead-discovery-service";
const BRANCH = "main";
const KB_PREFIX = "kb/actuals/";
const GH = "https://api.github.com";
const MAX_NOTE = 2000;

function ghHeaders(pat) {
  return {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function isSafePath(p) {
  return (
    typeof p === "string" &&
    p.startsWith(KB_PREFIX) &&
    p.endsWith(".md") &&
    !p.includes("..") &&
    p.length > KB_PREFIX.length + 3
  );
}

// Contents-API URL; encode each segment but keep the slashes.
function contentsUrl(path) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${GH}/repos/${REPO}/contents/${enc}`;
}

async function commitFile({ pat, path, content, sha, message }) {
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  return fetch(contentsUrl(path), { method: "PUT", headers: ghHeaders(pat), body: JSON.stringify(body) });
}

export default async function handler(req, res) {
  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "Missing GITHUB_PAT env var" });

  if (req.method === "GET") {
    const op = req.query?.op;

    if (op === "tree") {
      const r = await fetch(`${GH}/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: ghHeaders(pat) });
      if (!r.ok) return res.status(502).json({ error: `GitHub tree failed (${r.status})` });
      const data = await r.json();
      const files = (data.tree ?? [])
        .filter((n) => n.type === "blob" && n.path.startsWith(KB_PREFIX) && n.path.endsWith(".md"))
        .map((n) => ({ path: n.path }));
      return res.status(200).json({ files });
    }

    if (op === "file") {
      const path = req.query?.path;
      if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
      const r = await fetch(`${contentsUrl(path)}?ref=${BRANCH}`, { headers: ghHeaders(pat) });
      if (r.status === 404) return res.status(404).json({ error: "Not found" });
      if (!r.ok) return res.status(502).json({ error: `GitHub read failed (${r.status})` });
      const data = await r.json();
      const content = Buffer.from(data.content ?? "", "base64").toString("utf8");
      return res.status(200).json({ path, sha: data.sha, content });
    }

    return res.status(400).json({ error: "Unknown op" });
  }

  if (req.method === "PUT") {
    const { path, content, sha } = req.body ?? {};
    if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
    if (typeof content !== "string" || typeof sha !== "string" || !sha) {
      return res.status(400).json({ error: "content and sha are required" });
    }
    const r = await commitFile({ pat, path, content, sha, message: `kb: update ${path} via LeadFlow app` });
    if (r.status === 409 || r.status === 422) {
      return res.status(409).json({ error: "Bestand is intussen gewijzigd — herlaad en probeer opnieuw" });
    }
    if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
    const data = await r.json();
    return res.status(200).json({ path, sha: data.content?.sha ?? null });
  }

  if (req.method === "POST") {
    const op = req.body?.op;

    if (op === "create") {
      const { path, content } = req.body ?? {};
      if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
      if (typeof content !== "string") return res.status(400).json({ error: "content is required" });
      const r = await commitFile({ pat, path, content, message: `kb: create ${path} via LeadFlow app` });
      if (r.status === 422) return res.status(409).json({ error: "Bestand bestaat al" });
      if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
      const data = await r.json();
      return res.status(200).json({ path, sha: data.content?.sha ?? null });
    }

    if (op === "quick-update") {
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (!note) return res.status(400).json({ error: "Notitie is leeg" });
      if (note.length > MAX_NOTE) return res.status(400).json({ error: `Notitie is te lang (max ${MAX_NOTE} tekens)` });
      const category = typeof req.body?.category === "string" && req.body.category.trim() ? ` — ${req.body.category.trim()}` : "";
      const path = `${KB_PREFIX}updates.md`;

      const cur = await fetch(`${contentsUrl(path)}?ref=${BRANCH}`, { headers: ghHeaders(pat) });
      let sha;
      let existing = "";
      if (cur.ok) {
        const d = await cur.json();
        sha = d.sha;
        existing = Buffer.from(d.content ?? "", "base64").toString("utf8");
      } else if (cur.status !== 404) {
        return res.status(502).json({ error: `GitHub read failed (${cur.status})` });
      }

      const date = new Date().toISOString().slice(0, 10);
      const head = existing.trim()
        ? `${existing.replace(/\s+$/, "")}\n\n`
        : "# Updates\n\nRecente ontwikkelingen binnen Actuals, toegevoegd vanuit de LeadFlow app.\n\n";
      const next = `${head}## ${date}${category}\n\n${note}\n`;

      const r = await commitFile({ pat, path, content: next, sha, message: "kb: snelle update via LeadFlow app" });
      if (r.status === 409 || r.status === 422) {
        return res.status(409).json({ error: "Updates-bestand is intussen gewijzigd — probeer opnieuw" });
      }
      if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
      return res.status(200).json({ path, ok: true });
    }

    return res.status(400).json({ error: "Unknown op" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run tests/kb.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add api/kb.js tests/kb.test.js
git commit -m "feat: GitHub-backed KB endpoints (tree/file/update/create/quick-update)"
```

### Task 11: SPA — `KnowledgeBase` page + registration + Leadfinder entry

**Files:**
- Create: `src/pages/KnowledgeBase.jsx`
- Modify: `src/pages.config.js` (add import + PAGES entry — same manual pattern used for `LookalikeSearch`, despite the "auto-generated" header)
- Modify: `src/pages/Leadfinder.jsx`

- [ ] **Step 1: Create the page**

Create `src/pages/KnowledgeBase.jsx`:

```jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, Loader2, Plus, Sparkles } from "lucide-react";

const EASING = [0.22, 1, 0.36, 1];
const KB_PREFIX = "kb/actuals/";
const CATEGORIES = ["Product", "Klanten", "ICP", "Overig"];

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Quick update
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState(null); // { ok, text }

  // Editor
  const [selected, setSelected] = useState(null); // { path, sha, content }
  const [editText, setEditText] = useState("");
  const [openingPath, setOpeningPath] = useState(null);
  const [savingFile, setSavingFile] = useState(false);
  const [fileMessage, setFileMessage] = useState(null);

  // New file
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTree = async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/kb?op=tree");
      if (!r.ok) throw new Error();
      const data = await r.json();
      setFiles(data.files ?? []);
    } catch {
      setLoadError("Kon de knowledge base niet laden.");
    }
  };

  useEffect(() => {
    (async () => { await loadTree(); setLoading(false); })();
  }, []);

  const grouped = useMemo(() => {
    const groups = {};
    for (const f of files) {
      const rel = f.path.slice(KB_PREFIX.length);
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "Algemeen";
      (groups[dir] ??= []).push({ path: f.path, name: rel.slice(rel.lastIndexOf("/") + 1) });
    }
    return Object.entries(groups).sort(([a], [b]) => (a === "Algemeen" ? -1 : b === "Algemeen" ? 1 : a.localeCompare(b)));
  }, [files]);

  const submitNote = async () => {
    setSavingNote(true);
    setNoteMessage(null);
    try {
      const r = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "quick-update", note: note.trim(), ...(category ? { category } : {}) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Opslaan mislukt");
      setNote("");
      setCategory("");
      setNoteMessage({ ok: true, text: "Toegevoegd — telt mee vanaf de eerstvolgende run." });
      await loadTree();
    } catch (err) {
      setNoteMessage({ ok: false, text: err.message });
    } finally {
      setSavingNote(false);
    }
  };

  const openFile = async (path) => {
    setOpeningPath(path);
    setFileMessage(null);
    try {
      const r = await fetch(`/api/kb?op=file&path=${encodeURIComponent(path)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Kon bestand niet openen");
      setSelected(data);
      setEditText(data.content);
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setOpeningPath(null);
    }
  };

  const saveFile = async () => {
    setSavingFile(true);
    setFileMessage(null);
    try {
      const r = await fetch("/api/kb", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, content: editText, sha: selected.sha }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Opslaan mislukt");
      setSelected({ ...selected, sha: data.sha, content: editText });
      setFileMessage({ ok: true, text: "Opgeslagen — live vanaf de eerstvolgende run." });
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setSavingFile(false);
    }
  };

  const createFile = async () => {
    const name = newName.trim().replace(/\.md$/i, "");
    if (!name) return;
    setCreating(true);
    setFileMessage(null);
    try {
      const path = `${KB_PREFIX}${name}.md`;
      const content = `# ${name}\n\n`;
      const r = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", path, content }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Aanmaken mislukt");
      setNewName("");
      await loadTree();
      await openFile(path);
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASING }} className="mb-6">
          <button onClick={() => navigate(createPageUrl("Leadfinder"))} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Leadfinder
          </button>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-accent" /> Knowledge base
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Wat de leadfinder weet over Actuals. Wijzigingen tellen mee vanaf de eerstvolgende run.
          </p>
        </motion.div>

        {/* Quick update */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5, ease: EASING }} className="glass-card rounded-2xl p-4 mb-4">
          <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-1.5 mb-1">
            <Sparkles className="w-4 h-4 text-accent" /> Snelle update
          </h3>
          <p className="text-[12px] text-muted-foreground mb-3">
            Iets nieuws binnen Actuals? Typ het hier — de leadfinder neemt het direct mee.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Bijv. 'Nieuwe Adyen-connector live; ICP nu ook quick commerce in DACH.'"
            className="w-full px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Categorie (optioneel)</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={submitNote}
              disabled={savingNote || !note.trim()}
              className={`ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                savingNote || !note.trim() ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-accent text-white hover:accent-glow"
              }`}
            >
              {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toevoegen"}
            </button>
          </div>
          {noteMessage && (
            <p className={`text-[12px] mt-2 ${noteMessage.ok ? "text-accent" : "text-destructive"}`}>{noteMessage.text}</p>
          )}
        </motion.div>

        {/* Editor or file list */}
        {selected ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASING }} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { setSelected(null); setFileMessage(null); }} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Alle bestanden
              </button>
              <span className="text-[12px] font-medium text-muted-foreground truncate ml-3">{selected.path.slice(KB_PREFIX.length)}</span>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] font-mono text-foreground focus:outline-none focus:border-accent transition-colors"
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={saveFile}
                disabled={savingFile || editText === selected.content}
                className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                  savingFile || editText === selected.content ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-accent text-white hover:accent-glow"
                }`}
              >
                {savingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Opslaan"}
              </button>
            </div>
            {fileMessage && (
              <p className={`text-[12px] mt-2 ${fileMessage.ok ? "text-accent" : "text-destructive"}`}>{fileMessage.text}</p>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: EASING }} className="glass-card rounded-2xl p-4">
            <h3 className="text-[15px] font-semibold text-foreground mb-3">Bestanden</h3>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : loadError ? (
              <p className="text-[13px] text-destructive">{loadError}</p>
            ) : (
              <div className="space-y-4">
                {grouped.map(([dir, items]) => (
                  <div key={dir}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{dir}</p>
                    <div className="space-y-1">
                      {items.map((f) => (
                        <button
                          key={f.path}
                          onClick={() => openFile(f.path)}
                          disabled={openingPath !== null}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[13px] text-foreground hover:bg-foreground/[0.04] transition-colors"
                        >
                          {openingPath === f.path ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t border-foreground/[0.06]">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="nieuw-bestand"
                    className="flex-1 px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                  />
                  <button
                    onClick={createFile}
                    disabled={creating || !newName.trim()}
                    className={`px-3 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-1 transition-all ${
                      creating || !newName.trim() ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-foreground/[0.06] text-foreground hover:bg-accent hover:text-white"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Nieuw
                  </button>
                </div>
                {fileMessage && !selected && (
                  <p className={`text-[12px] ${fileMessage.ok ? "text-accent" : "text-destructive"}`}>{fileMessage.text}</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the page**

In `src/pages.config.js`, add (alphabetical, after `InteractionsReasoning`):

```js
import KnowledgeBase from './pages/KnowledgeBase';
```

and in `PAGES`:

```js
    "KnowledgeBase": KnowledgeBase,
```

(The header says auto-generated, but every existing page was registered exactly this way — follow the precedent. Route becomes `/knowledgebase` via `createPageUrl`. It must NOT be added to `NAV_ITEMS` in `Layout.jsx`.)

- [ ] **Step 3: Entry card on Leadfinder**

In `src/pages/Leadfinder.jsx`:

1. Add imports: `import { useNavigate } from "react-router-dom";`, `import { createPageUrl } from "../utils";`, and add `BookOpen` to the `lucide-react` import.
2. In the component: `const navigate = useNavigate();`
3. After the `<motion.div variants={item}><ScopeSteeringCard /></motion.div>` block (~line 205-207), insert:

```jsx
            <motion.div variants={item}>
              <button
                onClick={() => navigate(createPageUrl("KnowledgeBase"))}
                className="w-full glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-foreground/[0.06] flex items-center justify-center group-hover:bg-accent transition-colors">
                    <BookOpen className="w-4 h-4 text-foreground/60 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">Knowledge base</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Scherp aan wat de leadfinder over Actuals weet</p>
                  </div>
                </div>
              </button>
            </motion.div>
```

- [ ] **Step 4: Manual verify**

Run: `npm run lint && npm run dev`
On `http://localhost:5173`: Leadfinder shows the Knowledge base card; the page lists the KB files (requires `GITHUB_PAT` locally via `vercel dev` or verify list/edit on the Vercel preview after deploy — plain `vite dev` has no `/api`, so at minimum verify the page renders its error state gracefully).

- [ ] **Step 5: Commit**

```bash
git add src/pages/KnowledgeBase.jsx src/pages.config.js src/pages/Leadfinder.jsx
git commit -m "feat: KnowledgeBase page with quick updates + file editor"
```

### Task 12: SPA verification & ship

**Files:** none (verification)

- [ ] **Step 1: Full local verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 2: Confirm ordering, then push**

Confirm the CLI PR (Task 7) is merged to `Hylkewierda/lead-discovery-service` `main` AND migration 016 has been applied in Supabase. Only then push the SPA (push to `main` auto-deploys to Vercel) — confirm with the user before pushing.

- [ ] **Step 3: Post-deploy smoke test (with user)**

1. Home → Account posts: paste `https://www.linkedin.com/company/actuals.io/` → start → run completes (or cancel it quickly to limit spend).
2. Leadfinder → Knowledge base → add a quick update → verify the commit appears on GitHub (`kb/actuals/updates.md`) — next run picks it up.
3. Open `icp.md`, make a trivial edit, save, verify commit; revert via a second edit if unwanted.

---

## Self-review notes

- Spec coverage: Part 1 → Tasks 2-4, 8-9; Part 2 → Task 9; Part 3 → Tasks 5, 10-11; migration → Task 6; cross-repo ordering → Tasks 7/12. Lookalike scoring intentionally does NOT get the updates block (spec scopes it to Home modes + discovery).
- The `apimaestro/linkedin-profile-posts` output field for the post URL is undocumented; handled defensively (`url ?? post_url`) and flagged for a live check (Task 7 Step 3).
- `tests/unit/all-posts.test.ts` existing tests keep passing: env is unset by default and `as never` casts mean the added required dep doesn't break compilation of old tests at runtime.
