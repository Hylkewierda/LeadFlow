# Cancel for Leadfinder + Lookalike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend cooperative cancellation (already shipped for Home `workflow_runs`) to the two other SPA cloud paths: Leadfinder discovery (`runs` → `discover.yml` → `src/index.ts`) and Lookalike (`lookalike_searches` → `lookalike-search.yml` → `src/lookalike/runner.ts`), including a cancel control + `cancelled` handling in each UI.

**Architecture:** Same as the shipped Home cancel. SPA `DELETE` sets `cancel_requested=true` (guarded on non-terminal status); the running CLI polls a throttled `CancellationToken` (now table-parameterized), aborts the in-flight Apify run via `runActor`, finalizes the row `cancelled`, and exits 0 (so the `if: failure()` step is skipped).

**Tech Stack:** TypeScript CLI (vitest), Vite/React SPA (vitest for serverless handlers), Supabase.

**Two repos, one branch name in each:** `feat/cancel-leadfinder-lookalike`.
- CLI repo `Lead_finder/lead-discovery-service/` — Tasks 1–6.
- SPA repo `lead-flow-311625f1/` — Tasks 7–10 (branch already created with the spec).
- Task 11 = migrations + merge + live smoke (operational).

**Reference (shipped, on `main` in both repos):** `api/workflows.js` DELETE branch; `src/workflows/cancellation.ts`; `src/storage/workflow-runs.ts` `finalizeWorkflowRun`; `src/workflows/runner.ts` CancelledError handling. Read these as templates.

Spec: `lead-flow-311625f1/docs/superpowers/specs/2026-06-09-cancel-leadfinder-lookalike-design.md`.

---

## Task 1: Branch + migrations (CLI)

**Files:** create `scripts/sql/014_runs_cancel.sql`, `scripts/sql/015_lookalike_searches_cancel.sql`

- [ ] **Step 1:** From `Lead_finder/lead-discovery-service/` (on `main`, clean): `git checkout main && git pull && git checkout -b feat/cancel-leadfinder-lookalike`.

- [ ] **Step 2:** Create `scripts/sql/014_runs_cancel.sql`:
```sql
-- Cooperative cancellation for the Leadfinder discovery pipeline.
alter table runs add column if not exists cancel_requested boolean not null default false;
alter table runs add column if not exists cancelled_at timestamptz;
-- runs.status has an inline CHECK (auto-named); replace it to allow 'cancelled'.
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

- [ ] **Step 3:** Create `scripts/sql/015_lookalike_searches_cancel.sql`:
```sql
-- Cooperative cancellation for the Lookalike pipeline.
alter table lookalike_searches add column if not exists cancel_requested boolean not null default false;
alter table lookalike_searches add column if not exists cancelled_at timestamptz;
```

- [ ] **Step 4:** Commit (do NOT apply to DB yet):
```bash
git add scripts/sql/014_runs_cancel.sql scripts/sql/015_lookalike_searches_cancel.sql
git commit -m "feat(cancel): migrations for runs + lookalike_searches cancellation"
```

---

## Task 2: Token — table parameter (CLI)

**Files:** modify `src/workflows/cancellation.ts`; test `tests/unit/cancellation.test.ts` (extend)

- [ ] **Step 1: Failing test.** Append to `tests/unit/cancellation.test.ts` a test proving the token reads from the passed table:
```ts
  it("reads cancel_requested from the provided table", async () => {
    const from = vi.fn((_t: string) => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { cancel_requested: false }, error: null }) }) }),
    }));
    const token = makeCancellationToken({ supabase: { from } as never, runId: "r1", table: "runs" });
    await token.throwIfCancelled();
    expect(from).toHaveBeenCalledWith("runs");
  });
```
(The existing tests use a `fakeSupabase` whose `from` ignores its arg — they still pass because the default table is `workflow_runs`.)

- [ ] **Step 2:** Run `npx vitest run tests/unit/cancellation.test.ts` — confirm the new test FAILS (`from` called with `"workflow_runs"`, not `"runs"`).

- [ ] **Step 3:** In `src/workflows/cancellation.ts`, add `table?: string` to `MakeCancellationTokenInput` (with a JSDoc: `/** Table holding cancel_requested. Default workflow_runs. */`), and in `makeCancellationToken` read it: at the top of the factory add `const table = input.table ?? "workflow_runs";` and change `.from("workflow_runs")` to `.from(table)`.

- [ ] **Step 4:** Run `npx vitest run tests/unit/cancellation.test.ts` — confirm all pass.

- [ ] **Step 5:** `npm run typecheck` — 0 errors.

- [ ] **Step 6:** Commit:
```bash
git add src/workflows/cancellation.ts tests/unit/cancellation.test.ts
git commit -m "feat(cancel): parameterize CancellationToken table (default workflow_runs)"
```

---

## Task 3: finalizeRun — cancelled + race guard (CLI)

**Files:** modify `src/storage/writer.ts`; test `tests/unit/writer-finalize-cancel.test.ts`

Current `finalizeRun` (`src/storage/writer.ts`):
```ts
export async function finalizeRun(input: FinalizeRunInput): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    finished_at: new Date().toISOString(),
  };
  if (input.apifyRunIds) patch.apify_run_ids = input.apifyRunIds;
  if (input.counts) patch.counts = input.counts;
  if (input.error) patch.error = input.error;
  const { error } = await input.supabase.from("runs").update(patch).eq("id", input.runId);
  if (error) throw new Error(`Failed to finalize run: ${error.message}`);
}
```

- [ ] **Step 1: Failing test.** Create `tests/unit/writer-finalize-cancel.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { finalizeRun } from "../../src/storage/writer.js";

function fakeSupabase() {
  const calls: { patch: Record<string, unknown>; eqs: Array<[string, unknown]> }[] = [];
  const from = vi.fn(() => ({
    update: (patch: Record<string, unknown>) => {
      const eqs: Array<[string, unknown]> = [];
      const chain = {
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain; },
        then: (res: (v: { error: null }) => void) => { calls.push({ patch, eqs }); res({ error: null }); },
      };
      return chain;
    },
  }));
  return { client: { from } as never, calls };
}

describe("finalizeRun cancelled", () => {
  it("sets cancelled_at and guards on status='running' for cancelled", async () => {
    const { client, calls } = fakeSupabase();
    await finalizeRun({ supabase: client, runId: "r1", status: "cancelled" });
    const c = calls.at(-1)!;
    expect(c.patch.status).toBe("cancelled");
    expect(typeof c.patch.cancelled_at).toBe("string");
    expect(c.eqs).toContainEqual(["id", "r1"]);
    expect(c.eqs).toContainEqual(["status", "running"]);
  });
  it("does not guard or set cancelled_at for completed", async () => {
    const { client, calls } = fakeSupabase();
    await finalizeRun({ supabase: client, runId: "r1", status: "completed" });
    const c = calls.at(-1)!;
    expect(c.patch.cancelled_at).toBeUndefined();
    expect(c.eqs).toEqual([["id", "r1"]]);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/writer-finalize-cancel.test.ts` — confirm FAIL.

- [ ] **Step 3:** In `src/storage/writer.ts`: find `FinalizeRunInput` and widen its `status` field to include `"cancelled"` (it is currently `"completed" | "failed"` or similar — add `| "cancelled"`). Then change `finalizeRun` body to:
```ts
  const patch: Record<string, unknown> = {
    status: input.status,
    finished_at: new Date().toISOString(),
  };
  if (input.apifyRunIds) patch.apify_run_ids = input.apifyRunIds;
  if (input.counts) patch.counts = input.counts;
  if (input.error) patch.error = input.error;
  if (input.status === "cancelled") patch.cancelled_at = new Date().toISOString();

  let query = input.supabase.from("runs").update(patch).eq("id", input.runId);
  if (input.status === "cancelled") query = query.eq("status", "running");
  const { error } = await query;
  if (error) throw new Error(`Failed to finalize run: ${error.message}`);
```

- [ ] **Step 4:** `npx vitest run tests/unit/writer-finalize-cancel.test.ts` — PASS. Then run any existing writer tests: `npx vitest run tests/unit/writer-runs.test.ts` (if present) — PASS.

- [ ] **Step 5:** `npm run typecheck` — 0 errors.

- [ ] **Step 6:** Commit:
```bash
git add src/storage/writer.ts tests/unit/writer-finalize-cancel.test.ts
git commit -m "feat(cancel): finalizeRun supports cancelled with race guard"
```

---

## Task 4: updateLookalikeSearchStatus — cancelled + guard (CLI)

**Files:** modify `src/lookalike/types.ts`, `src/storage/lookalike-searches.ts`; test `tests/unit/lookalike-status-cancel.test.ts`

- [ ] **Step 1:** In `src/lookalike/types.ts`, add `"cancelled"` to the `LookalikeSearchStatus` union.

- [ ] **Step 2: Failing test.** Create `tests/unit/lookalike-status-cancel.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { updateLookalikeSearchStatus } from "../../src/storage/lookalike-searches.js";

function fakeSupabase() {
  const calls: { patch: Record<string, unknown>; eqs: Array<[string, unknown]>; nots: Array<[string, string, string]> }[] = [];
  const from = vi.fn(() => ({
    update: (patch: Record<string, unknown>) => {
      const eqs: Array<[string, unknown]> = []; const nots: Array<[string, string, string]> = [];
      const chain: any = {
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain; },
        not: (c: string, op: string, v: string) => { nots.push([c, op, v]); return chain; },
        then: (res: (v: { error: null }) => void) => { calls.push({ patch, eqs, nots }); res({ error: null }); },
      };
      return chain;
    },
  }));
  return { client: { from } as never, calls };
}

describe("updateLookalikeSearchStatus cancelled", () => {
  it("sets completed_at + cancelled_at and guards out terminal rows", async () => {
    const { client, calls } = fakeSupabase();
    await updateLookalikeSearchStatus(client, "s1", "cancelled");
    const c = calls.at(-1)!;
    expect(c.patch.status).toBe("cancelled");
    expect(typeof c.patch.completed_at).toBe("string");
    expect(typeof c.patch.cancelled_at).toBe("string");
    expect(c.eqs).toContainEqual(["id", "s1"]);
    expect(c.nots).toContainEqual(["status", "in", "(completed,failed,cancelled)"]);
  });
  it("does not guard for a normal stage transition", async () => {
    const { client, calls } = fakeSupabase();
    await updateLookalikeSearchStatus(client, "s1", "scraping");
    const c = calls.at(-1)!;
    expect(c.patch.cancelled_at).toBeUndefined();
    expect(c.nots).toEqual([]);
  });
});
```

- [ ] **Step 3:** Run it — confirm FAIL.

- [ ] **Step 4:** In `src/storage/lookalike-searches.ts`, modify `updateLookalikeSearchStatus`. Change the `completed_at` line and the update call so cancelled also sets `cancelled_at` and guards:
```ts
  const patch: Record<string, unknown> = { status };
  if (extra.error !== undefined) patch.error = extra.error;
  if (extra.playbook !== undefined) patch.playbook = extra.playbook;
  if (extra.sheet_url !== undefined) patch.sheet_url = extra.sheet_url;
  if (status === "completed" || status === "failed" || status === "cancelled") {
    patch.completed_at = new Date().toISOString();
  }
  if (status === "cancelled") patch.cancelled_at = new Date().toISOString();

  let query = supabase.from("lookalike_searches").update(patch).eq("id", searchId);
  if (status === "cancelled") query = query.not("status", "in", "(completed,failed,cancelled)");
  const { error } = await query;
  if (error) throw new Error(`updateLookalikeSearchStatus failed: ${error.message}`);
```

- [ ] **Step 5:** Run the test — PASS. Run existing lookalike storage tests if any — PASS. `npm run typecheck` — 0 errors.

- [ ] **Step 6:** Commit:
```bash
git add src/lookalike/types.ts src/storage/lookalike-searches.ts tests/unit/lookalike-status-cancel.test.ts
git commit -m "feat(cancel): lookalike status cancelled + non-terminal guard"
```

---

## Task 5: Discovery pipeline cancellation (CLI)

**Files:** modify `src/index.ts`, `src/discovery/content-search.ts`, `src/discovery/competitor-engagement.ts`; test `tests/unit/index-cancel.test.ts` (or adapt an existing index test if one exists)

**READ FIRST:** `src/index.ts` (the `main()` pipeline + its outer try/catch + how it calls `runContentSearch`/`runCompetitorEngagement` + `finalizeRun`), `src/discovery/content-search.ts`, `src/discovery/competitor-engagement.ts`, and the shipped template `src/workflows/runner.ts` (how it builds the token and maps `CancelledError`).

- [ ] **Step 1:** Thread `cancellation?: CancellationToken` through the Apify-calling helpers. In `src/discovery/content-search.ts` and `src/discovery/competitor-engagement.ts`: add an optional `cancellation?: CancellationToken` to their input/params and forward it into every `runActor({ ... })` call (`cancellation: <param>`). Import the type: `import type { CancellationToken } from "../workflows/cancellation.js";`. No other logic changes.

- [ ] **Step 2:** In `src/index.ts`:
  - Import `makeCancellationToken` and `CancelledError` from `./workflows/cancellation.js`.
  - After `runId` is known (post-`createRun`), build `const cancellation = makeCancellationToken({ supabase, runId, table: "runs" });`.
  - Pass `cancellation` into the `runContentSearch(...)` and `runCompetitorEngagement(...)` calls.
  - Insert `await cancellation.throwIfCancelled();` at the stage boundaries: after the playbook/Apify-search groups complete, before the dedup/pre-score, before the LLM-qualify loop, and before the Supabase candidate write.
  - In the outer `catch`, BEFORE the existing failed-finalize logic, add: `if (err instanceof CancelledError) { await finalizeRun({ supabase: <the client used in the catch>, runId, status: "cancelled" }).catch(() => {}); return 0; }`. Use the same supabase client the existing catch uses (it may construct a fallback client from env — reuse that exact pattern; if `runId` is undefined at the point of failure, skip finalize and just return 0). The CLI's `main().then(code => process.exit(code))` then exits 0 so `discover.yml`'s `if: failure()` step is skipped.

- [ ] **Step 3: Test.** Create `tests/unit/index-cancel.test.ts` OR, if `src/index.ts` is not unit-testable in isolation (it reads env / many deps), instead add a focused test on the smallest cancel-mapping seam you introduced. If `main()` is not callable in a test, document in the commit message that the discovery cancel path is covered by the helper-threading tests + the live smoke (Task 11), and add a test that `runContentSearch`/`runCompetitorEngagement` forward `cancellation` into `runActor` (spy on an injected `runActor`/client and assert the token is passed). Prefer a real test of the forwarding:
```ts
// Example shape — adapt to the actual helper signature you find:
// build a fake client whose actor().start()/run().get() resolve immediately,
// pass a cancellation token, assert runActor received it (or that throwIfCancelled is consulted).
```
The REQUIRED assertion for this task: a test proving a `CancelledError` thrown during the pipeline results in `finalizeRun` being called with `status:"cancelled"` and the process-level return being 0 (not a rethrow / not `failed`). If `main()` can be invoked with injected deps, test it directly; otherwise extract the catch-mapping into a tiny helper and test that.

- [ ] **Step 4:** Run the new test + `npm test` (full suite) — all green. `npm run typecheck` — 0 errors.

- [ ] **Step 5:** Commit:
```bash
git add src/index.ts src/discovery/content-search.ts src/discovery/competitor-engagement.ts tests/unit/index-cancel.test.ts
git commit -m "feat(cancel): discovery pipeline checkpoints + CancelledError → cancelled (exit 0)"
```

Report DONE_WITH_CONCERNS describing exactly where you put each checkpoint and how you tested the cancel mapping, if `main()` was not directly testable.

---

## Task 6: Lookalike pipeline cancellation (CLI)

**Files:** modify `src/lookalike/runner.ts`, `src/lookalike/scrape-anchors.ts`, `src/lookalike/search.ts`, and the entry `scripts/lookalike-search.ts` if it owns the outer catch; test `tests/unit/lookalike-runner-cancel.test.ts`

**READ FIRST:** `src/lookalike/runner.ts` (`runLookalikeSearch` stages + how it updates status + its try/catch), `scripts/lookalike-search.ts` (entry/exit-code handling), `src/lookalike/scrape-anchors.ts`, `src/lookalike/search.ts`, and the shipped `src/workflows/runner.ts` template.

- [ ] **Step 1:** Thread `cancellation?: CancellationToken` into `scrapeAnchors` and `runProfileSearches`, forwarding into their `runActor({ ... })` calls (`cancellation: <param>`). Import the type from `../workflows/cancellation.js`.

- [ ] **Step 2:** In `src/lookalike/runner.ts` (`runLookalikeSearch`):
  - Build `const cancellation = makeCancellationToken({ supabase: input.supabase, runId: searchId, table: "lookalike_searches" });` (use the actual searchId variable name).
  - Pass `cancellation` into `scrapeAnchors(...)` and `runProfileSearches(...)`.
  - Insert `await cancellation.throwIfCancelled();` between stages: after anchor scrape, after embed, after playbook generation, between profile searches (top of the loop over playbook searches), and before scoring.
  - In the catch, BEFORE the existing `updateLookalikeSearchStatus(..., "failed", ...)`, add: `if (err instanceof CancelledError) { await updateLookalikeSearchStatus(input.supabase, searchId, "cancelled").catch(() => {}); return; }` (or whatever the function returns; ensure the entry script then exits 0). Import `CancelledError` + `makeCancellationToken`.
  - If the in-loop scrape/score has a per-item try/catch that swallows errors, add `if (err instanceof CancelledError) throw err;` as its first line (same trap we fixed in the Home modes).

- [ ] **Step 3:** Ensure `scripts/lookalike-search.ts` exits 0 on a cancelled run (if it maps thrown errors to exit 1, make sure a clean cancel return does not throw). If the runner returns normally on cancel, the entry's `.then(() => process.exit(0))` handles it.

- [ ] **Step 4: Test.** Create `tests/unit/lookalike-runner-cancel.test.ts`: invoke `runLookalikeSearch` with injected deps (mock supabase + a cancellation that throws on the 2nd checkpoint, or a `scrapeAnchors` impl that throws `CancelledError`), and assert `updateLookalikeSearchStatus` was called with `"cancelled"` and the function did NOT call it with `"failed"`. Model the injection on the existing lookalike runner tests if present (read `tests/unit/` for a `lookalike-runner*.test.ts`).

- [ ] **Step 5:** Run the new test + `npm test` — all green. `npm run typecheck` — 0 errors.

- [ ] **Step 6:** Commit:
```bash
git add src/lookalike/ scripts/lookalike-search.ts tests/unit/lookalike-runner-cancel.test.ts
git commit -m "feat(cancel): lookalike pipeline checkpoints + CancelledError → cancelled (exit 0)"
```

- [ ] **Step 7:** Push the CLI branch: `git push -u origin feat/cancel-leadfinder-lookalike`.

---

## Task 7: SPA — DELETE /api/runs (SPA)

**Files:** modify `api/runs.js`; test `tests/runs-cancel.test.js`. Work from `lead-flow-311625f1/` on branch `feat/cancel-leadfinder-lookalike`.

**READ FIRST:** the shipped `api/workflows.js` DELETE branch (template) and the current `api/runs.js`.

- [ ] **Step 1: Failing test.** Create `tests/runs-cancel.test.js` modeled on `tests/workflows-cancel.test.js`, but for the `runs` table and `?run_id=`. It must assert: 400 on missing run_id; on a running row, sets `cancel_requested:true` guarded by `.eq("id",runId).eq("status","running")` and returns `{status:"cancelling"}`; idempotent no-op (updateMatched=0) returns the current status. (Copy the mock/`makeRes` harness from `tests/workflows-cancel.test.js`; change the table assertion to `runs` and import `../api/runs.js`.)

- [ ] **Step 2:** Run `npx vitest run tests/runs-cancel.test.js` — confirm FAIL (no DELETE branch).

- [ ] **Step 3:** In `api/runs.js`, add a `DELETE` branch (place it after any GET branch / before the POST guard), mirroring the shipped `api/workflows.js` DELETE but using the `runs` table and `run_id`:
```js
  if (req.method === "DELETE") {
    const runId = req.query?.run_id;
    if (!runId) return res.status(400).json({ error: "Missing run_id" });
    const { data, error } = await supabase
      .from("runs")
      .update({ cancel_requested: true })
      .eq("id", runId)
      .eq("status", "running")
      .select("id");
    if (error) return res.status(500).json({ error: error.message });
    if ((data ?? []).length > 0) return res.status(200).json({ status: "cancelling" });
    const current = await supabase.from("runs").select("status").eq("id", runId).single();
    return res.status(200).json({ status: current.data?.status ?? "unknown" });
  }
```
(Use whatever the file names its Supabase client — match the existing `serverSupabase()`/variable. Ensure the handler obtains the client for DELETE the same way it does for POST.)

- [ ] **Step 4:** `npx vitest run tests/runs-cancel.test.js` — PASS. Run `npx vitest run tests/api-runs.test.js` — no regression.

- [ ] **Step 5:** Commit:
```bash
git add api/runs.js tests/runs-cancel.test.js
git commit -m "feat(cancel): DELETE /api/runs sets cancel_requested when running"
```

---

## Task 8: SPA — DELETE /api/lookalike-searches (SPA)

**Files:** modify `api/lookalike-searches.js`; test `tests/lookalike-searches-cancel.test.js`.

**READ FIRST:** current `api/lookalike-searches.js` (note its CORS headers + OPTIONS handling) and the shipped `api/workflows.js` DELETE.

- [ ] **Step 1: Failing test.** Create `tests/lookalike-searches-cancel.test.js` modeled on `tests/workflows-cancel.test.js`, for `lookalike_searches` and `?search_id=`. Assert: 400 on missing search_id; on a non-terminal row, sets `cancel_requested:true` guarded by `.eq("id",searchId).not("status","in","(completed,failed,cancelled)")` and returns `{status:"cancelling"}`; no-op returns current status. The mock's `update` chain must support `.not(...)` (add a `not` method to the chain that records and returns the chain, resolving on `.then`).

- [ ] **Step 2:** Run it — confirm FAIL.

- [ ] **Step 3:** In `api/lookalike-searches.js`, add a `DELETE` branch (after OPTIONS, before the POST-only guard), preserving the existing CORS headers:
```js
  if (req.method === "DELETE") {
    const searchId = req.query?.search_id;
    if (!searchId) return res.status(400).json({ error: "Missing search_id" });
    const supabase = serverSupabase();
    const { data, error } = await supabase
      .from("lookalike_searches")
      .update({ cancel_requested: true })
      .eq("id", searchId)
      .not("status", "in", "(completed,failed,cancelled)")
      .select("id");
    if (error) return res.status(500).json({ error: error.message });
    if ((data ?? []).length > 0) return res.status(200).json({ status: "cancelling" });
    const current = await supabase.from("lookalike_searches").select("status").eq("id", searchId).single();
    return res.status(200).json({ status: current.data?.status ?? "unknown" });
  }
```
(Match the file's existing `serverSupabase()` usage and CORS-header setup — the DELETE must send the same `Access-Control-*` headers the POST/OPTIONS paths do.)

- [ ] **Step 4:** Run the test — PASS. Confirm no regression in any existing lookalike API test.

- [ ] **Step 5:** Commit:
```bash
git add api/lookalike-searches.js tests/lookalike-searches-cancel.test.js
git commit -m "feat(cancel): DELETE /api/lookalike-searches sets cancel_requested when non-terminal"
```

---

## Task 9: SPA — Leadfinder cancel UI (SPA)

**Files:** modify `src/lib/leadfinder/data.js`, `src/pages/Leadfinder.jsx`, `src/components/leadfinder/RunsStrip.jsx`. No component test framework — verify via `npm run lint` + `npm run build`.

**READ FIRST:** all three files. Note: `Leadfinder.jsx` polls `listRecentRuns()` every 3s; `isRunning` is `runs.some(r => r.status === "running")`; `RunsStrip.jsx` renders run items + a "Start run" button.

- [ ] **Step 1:** In `src/lib/leadfinder/data.js`, add:
```js
export async function cancelRun(runId) {
  const res = await fetch(`/api/runs?run_id=${encodeURIComponent(runId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`cancelRun failed: ${res.status}`);
  return res.json();
}
```
(Place it next to the existing `startRun`/`listRecentRuns` exports. Confirm `listRecentRuns` already selects `status` — it does.)

- [ ] **Step 2:** In `src/pages/Leadfinder.jsx`: add a `const [cancelling, setCancelling] = useState(false)` and an `onCancel` handler that finds the running run's id, calls `cancelRun(id)` (try/catch), sets `cancelling=true`; the existing 3s poll will observe `status==='cancelled'`. Pass `onCancel`, `cancelling`, and the running run to `RunsStrip` (or render the control in the page near the strip — your choice, match the existing layout). When polling sees no running run, reset `cancelling=false`.

- [ ] **Step 3:** In `src/components/leadfinder/RunsStrip.jsx`:
  - When a run has `status === "running"`, render a small destructive control: `{cancelling ? "Annuleren…" : "Annuleer run"}`, `disabled={cancelling}`, classes matching the shipped cancel button (`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-destructive hover:bg-destructive/8 disabled:opacity-50 disabled:cursor-not-allowed`), wired to `onCancel`.
  - Add rendering for `status === "cancelled"`: a neutral icon/label (e.g. an X/slash with text "Geannuleerd") so the strip's status switch doesn't fall through to an "unknown" state. Match the existing status-icon pattern in the file.

- [ ] **Step 4:** `npm run lint 2>&1 | grep -iE "leadfinder|runsstrip"` — no errors for these files. `npm run build` — succeeds (report the "built in" line). `git diff --name-only` shows only the three files.

- [ ] **Step 5:** Commit:
```bash
git add src/lib/leadfinder/data.js src/pages/Leadfinder.jsx src/components/leadfinder/RunsStrip.jsx
git commit -m "feat(cancel): Leadfinder cancel-run control + cancelled status"
```

---

## Task 10: SPA — Lookalike cancel UI (SPA)

**Files:** modify `src/lib/lookalike/data.js`, `src/pages/LookalikeSearch.jsx`. Verify via lint + build.

**READ FIRST:** both files. `LookalikeSearch.jsx` polls `getLookalikeSearch(activeSearchId)` every 3s; terminal handling is on `completed`/`failed`; `STAGES` is a fixed list; a destructive cancel button should sit under the stages list while non-terminal.

- [ ] **Step 1:** In `src/lib/lookalike/data.js`, add:
```js
export async function cancelLookalikeSearch(searchId) {
  const res = await fetch(`/api/lookalike-searches?search_id=${encodeURIComponent(searchId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`cancelLookalikeSearch failed: ${res.status}`);
  return res.json();
}
```
(Next to `startLookalikeSearch`/`getLookalikeSearch`. Confirm `getLookalikeSearch` selects `status` — it does.)

- [ ] **Step 2:** In `src/pages/LookalikeSearch.jsx`:
  - Add `const [cancelling, setCancelling] = useState(false)`.
  - Treat `"cancelled"` as terminal: wherever the poll stops on `completed`/`failed`, also stop on `cancelled`; show a "Geannuleerd" state in the status header (neutral, not error).
  - Under the stages list, while the search status is non-terminal (not in completed/failed/cancelled), render a destructive control: `disabled={cancelling}`, label `{cancelling ? "Annuleren…" : "Zoekopdracht annuleren"}`, classes matching the shipped cancel button (`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/8 disabled:opacity-50 disabled:cursor-not-allowed`). On click: `setCancelling(true)` + `cancelLookalikeSearch(activeSearchId)` (try/catch). The 3s poll then observes `cancelled`.
  - Reset `cancelling=false` when the search reaches a terminal state.

- [ ] **Step 3:** `npm run lint 2>&1 | grep -i lookalike` — no errors for these files. `npm run build` — succeeds. `git diff --name-only` shows only the two files.

- [ ] **Step 4:** Commit + push:
```bash
git add src/lib/lookalike/data.js src/pages/LookalikeSearch.jsx
git commit -m "feat(cancel): Lookalike cancel control + cancelled terminal state"
git push -u origin feat/cancel-leadfinder-lookalike
```

---

## Task 11: Migrations + merge + live smoke (operational)

- [ ] **Step 1:** Apply `014_runs_cancel.sql` and `015_lookalike_searches_cancel.sql` to Supabase (SQL editor). Verify both tables now have `cancel_requested` + `cancelled_at`, and that `runs` accepts `status='cancelled'` (the new check constraint).

- [ ] **Step 2:** Open a PR for each repo's `feat/cancel-leadfinder-lookalike` branch; ensure green; merge CLI first, then SPA. **Migrations MUST be applied before the SPA deploys** (the DELETE/poll reference the new columns).

- [ ] **Step 3:** Live smoke — Leadfinder: start a discovery run, click "Annuleer run", confirm `runs.status` → `cancelled` within ~15s, the in-flight Apify run shows `ABORTED`, and the GH Actions run concludes success (not failure). Lookalike: same with a lookalike search and "Zoekopdracht annuleren".

---

## Notes for the implementer
- **Two repos**, both on branch `feat/cancel-leadfinder-lookalike`: Tasks 1–6 in `Lead_finder/lead-discovery-service/`, Tasks 7–10 in `lead-flow-311625f1/`.
- **Reuse the shipped templates** (`api/workflows.js` DELETE, `finalizeWorkflowRun`, `runner.ts` CancelledError handling) rather than reinventing.
- **CancelledError must never be swallowed** by an inner try/catch before reaching the pipeline's outer catch — if a per-item loop catches errors, rethrow `CancelledError` first (the trap we hit in the Home modes).
- **Exit 0 on cancel** in both CLIs so the `if: failure()` step in `discover.yml`/`lookalike-search.yml` is skipped.
- The SPA's `npm run typecheck` has ~12 PRE-EXISTING checkjs errors in unrelated files — `npm run build` (vite) is the real gate for UI tasks; only worry about errors referencing the files you touched.
