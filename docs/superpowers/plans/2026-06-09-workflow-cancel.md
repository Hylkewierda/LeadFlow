# Workflow Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Workflow annuleren" button actually cancel a running Home workflow mode — stopping Apify + Anthropic spend within ~10–15s and leaving the run in a clean `cancelled` state the UI reflects.

**Architecture:** Cooperative cancellation. The SPA sets a `cancel_requested` flag in the Supabase `workflow_runs` row. The running discovery-service CLI polls that flag (throttled) at stage checkpoints and at every Apify poll iteration; on cancel it aborts the in-flight Apify actor run, stops issuing further LLM calls, finalizes the run as `cancelled`, and exits 0 so the workflow's `if: failure()` step does not overwrite the status.

**Tech Stack:** TypeScript (discovery-service CLI, vitest), Vite/React 18 SPA (Vercel serverless `api/`, vitest), Supabase (Postgres).

**Two repos, one feature branch named `feat/workflow-cancel` in each:**
- `Lead_finder/lead-discovery-service/` — CLI + SQL (Tasks 1–6)
- `lead-flow-311625f1/` — SPA API + UI (Tasks 7–9; branch already created)
- Task 10 applies the migration and does a live smoke test.

Spec: `lead-flow-311625f1/docs/superpowers/specs/2026-06-09-workflow-cancel-design.md`.

---

## File structure

**discovery-service (`Lead_finder/lead-discovery-service/`):**
- `scripts/sql/013_workflow_runs_cancel.sql` — new migration (cancel columns)
- `src/workflows/cancellation.ts` — new: `CancelledError`, `CancellationToken`, `noopCancellationToken`
- `src/storage/workflow-runs.ts` — modify: widen status, `cancelled_at`, race guard
- `src/discovery/apify-client.ts` — modify: poll-loop cancel check + `.abort()`
- `src/workflows/scrape.ts` — modify: forward `cancellation` into the default `runActor` call
- `src/workflows/concurrency.ts` — modify: per-iteration cancel check
- `src/workflows/enrich-qualify.ts` — modify: between-batch cancel check
- `src/workflows/types.ts` — modify: add `cancellation?` to `WorkflowContext`
- `src/workflows/runner.ts` — modify: create token, thread it, catch `CancelledError` → finalize `cancelled`, return 0
- `src/workflows/modules/{specific-posts,all-posts,campaigns,comment-posts}.ts` — modify: loop-top cancel check + forward `cancellation` into scrape calls

**SPA (`lead-flow-311625f1/`):**
- `api/workflows.js` — modify: `DELETE` branch + `GET` select adds `cancelled_at`
- `src/components/WorkflowContext.jsx` — modify: `cancelWorkflow()`, `cancelling`, `cancelled` poll branch, toast fix
- `src/pages/WorkflowActivated.jsx` — modify: `handleCancel` → `cancelWorkflow()`, "Annuleren…" state

---

## Task 1: Migration + branch (discovery-service)

**Files:**
- Create: `Lead_finder/lead-discovery-service/scripts/sql/013_workflow_runs_cancel.sql`

- [ ] **Step 1: Create the feature branch**

Run (from `Lead_finder/lead-discovery-service/`):
```bash
git checkout -b feat/workflow-cancel
```
Expected: `Switched to a new branch 'feat/workflow-cancel'`

- [ ] **Step 2: Write the migration SQL**

Create `scripts/sql/013_workflow_runs_cancel.sql`:
```sql
-- Cooperative cancellation for the Home workflow modes.
-- The SPA sets cancel_requested=true; the running CLI sees it, aborts in-flight
-- Apify runs, stops further LLM calls, and finalizes status='cancelled'.
alter table workflow_runs add column if not exists cancel_requested boolean not null default false;
alter table workflow_runs add column if not exists cancelled_at timestamptz;
```
No CHECK constraint exists on `status` (see `012_workflow_runs.sql`), so the new value `'cancelled'` needs no constraint change.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/013_workflow_runs_cancel.sql
git commit -m "feat(cancel): add cancel_requested + cancelled_at to workflow_runs"
```

(The migration is applied against Supabase in Task 10, not now.)

---

## Task 2: CancellationToken + CancelledError (discovery-service)

**Files:**
- Create: `src/workflows/cancellation.ts`
- Test: `tests/unit/cancellation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cancellation.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { CancelledError, makeCancellationToken } from "../../src/workflows/cancellation.js";

function fakeSupabase(cancelRequested: boolean) {
  const single = vi.fn(() =>
    Promise.resolve({ data: { cancel_requested: cancelRequested }, error: null }),
  );
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, single };
}

describe("CancellationToken", () => {
  it("throws CancelledError when cancel_requested is true", async () => {
    const { client } = fakeSupabase(true);
    const token = makeCancellationToken({ supabase: client, runId: "r1" });
    await expect(token.throwIfCancelled()).rejects.toBeInstanceOf(CancelledError);
  });

  it("does not throw when cancel_requested is false", async () => {
    const { client } = fakeSupabase(false);
    const token = makeCancellationToken({ supabase: client, runId: "r1" });
    await expect(token.throwIfCancelled()).resolves.toBeUndefined();
  });

  it("throttles DB reads: a second call within the window does not re-query", async () => {
    const { client, single } = fakeSupabase(false);
    const token = makeCancellationToken({ supabase: client, runId: "r1", throttleMs: 10_000, now: () => 1000 });
    await token.throwIfCancelled();
    await token.throwIfCancelled();
    expect(single).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cancellation.test.ts`
Expected: FAIL — `makeCancellationToken` / `CancelledError` not found.

- [ ] **Step 3: Write the implementation**

Create `src/workflows/cancellation.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Thrown when a workflow run has been cancelled mid-execution. */
export class CancelledError extends Error {
  constructor(message = "Workflow run cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export interface CancellationToken {
  /** Reads cancel_requested (throttled) and throws CancelledError if set. */
  throwIfCancelled(): Promise<void>;
}

export interface MakeCancellationTokenInput {
  supabase: SupabaseClient;
  runId: string;
  /** Min ms between DB reads. Default 4000. */
  throttleMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** A token bound to one workflow_runs row. Caches the last read for throttleMs
 *  so frequent checkpoints don't hammer the DB. */
export function makeCancellationToken(input: MakeCancellationTokenInput): CancellationToken {
  const throttleMs = input.throttleMs ?? 4000;
  const now = input.now ?? (() => Date.now());
  let lastChecked = -Infinity;
  let lastValue = false;

  return {
    async throwIfCancelled(): Promise<void> {
      if (now() - lastChecked < throttleMs) {
        if (lastValue) throw new CancelledError();
        return;
      }
      const { data, error } = await input.supabase
        .from("workflow_runs")
        .select("cancel_requested")
        .eq("id", input.runId)
        .single();
      lastChecked = now();
      // On read error, fail open (don't cancel) — a transient read must not kill a healthy run.
      lastValue = !error && data?.cancel_requested === true;
      if (lastValue) throw new CancelledError();
    },
  };
}

/** A token that never cancels — for tests and runs without a supabase client. */
export const noopCancellationToken: CancellationToken = {
  async throwIfCancelled() {},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cancellation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/workflows/cancellation.ts tests/unit/cancellation.test.ts
git commit -m "feat(cancel): add CancellationToken + CancelledError"
```

---

## Task 3: finalizeWorkflowRun — cancelled status + race guard (discovery-service)

**Files:**
- Modify: `src/storage/workflow-runs.ts`
- Test: `tests/unit/workflow-runs-finalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/workflow-runs-finalize.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { finalizeWorkflowRun } from "../../src/storage/workflow-runs.js";

function fakeSupabase() {
  const calls: { patch: Record<string, unknown>; eqs: Array<[string, unknown]> }[] = [];
  const from = vi.fn(() => ({
    update: (patch: Record<string, unknown>) => {
      const eqs: Array<[string, unknown]> = [];
      const chain = {
        eq: (col: string, val: unknown) => {
          eqs.push([col, val]);
          // resolve when the last eq is reached; chain is thenable-by-return
          return chain;
        },
        then: (resolve: (v: { error: null }) => void) => {
          calls.push({ patch, eqs });
          resolve({ error: null });
        },
      };
      return chain;
    },
  }));
  return { client: { from } as never, calls };
}

describe("finalizeWorkflowRun", () => {
  it("for cancelled, sets cancelled_at and guards on status='running'", async () => {
    const { client, calls } = fakeSupabase();
    await finalizeWorkflowRun({ supabase: client, runId: "r1", status: "cancelled" });
    const call = calls.at(-1)!;
    expect(call.patch.status).toBe("cancelled");
    expect(typeof call.patch.cancelled_at).toBe("string");
    expect(call.eqs).toContainEqual(["id", "r1"]);
    expect(call.eqs).toContainEqual(["status", "running"]);
  });

  it("for completed, does NOT guard on status and does not set cancelled_at", async () => {
    const { client, calls } = fakeSupabase();
    await finalizeWorkflowRun({ supabase: client, runId: "r1", status: "completed", counts: { appended: 3 } });
    const call = calls.at(-1)!;
    expect(call.patch.status).toBe("completed");
    expect(call.patch.cancelled_at).toBeUndefined();
    expect(call.eqs).toEqual([["id", "r1"]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/workflow-runs-finalize.test.ts`
Expected: FAIL — `cancelled` not assignable to status type / `cancelled_at` not set / guard missing.

- [ ] **Step 3: Modify `src/storage/workflow-runs.ts`**

Replace the `FinalizeWorkflowRunInput` interface and `finalizeWorkflowRun` function with:
```ts
export interface FinalizeWorkflowRunInput {
  supabase: SupabaseClient;
  runId: string;
  status: "completed" | "failed" | "cancelled";
  counts?: Record<string, number>;
  error?: string;
}

export async function finalizeWorkflowRun(input: FinalizeWorkflowRunInput): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    finished_at: new Date().toISOString(),
  };
  if (input.counts) patch.counts = input.counts;
  if (input.error) patch.error = input.error;
  if (input.status === "cancelled") patch.cancelled_at = new Date().toISOString();

  let query = input.supabase.from("workflow_runs").update(patch).eq("id", input.runId);
  // Race guard: a late cancel must not overwrite a run that already reached a terminal state.
  if (input.status === "cancelled") query = query.eq("status", "running");

  const { error } = await query;
  if (error) throw new Error(`Failed to finalize workflow run: ${error.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/workflow-runs-finalize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing runner test to confirm no regression**

Run: `npx vitest run tests/unit/runner.test.ts`
Expected: PASS (the `completed`/`failed` paths are unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/storage/workflow-runs.ts tests/unit/workflow-runs-finalize.test.ts
git commit -m "feat(cancel): finalizeWorkflowRun supports cancelled with race guard"
```

---

## Task 4: Apify runActor — cancel check + abort (discovery-service)

**Files:**
- Modify: `src/discovery/apify-client.ts`
- Test: `tests/unit/apify-cancel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/apify-cancel.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runActor } from "../../src/discovery/apify-client.js";
import { CancelledError } from "../../src/workflows/cancellation.js";

function alwaysCancelToken() {
  return { async throwIfCancelled() { throw new CancelledError(); } };
}

describe("runActor cancellation", () => {
  it("aborts the in-flight run and throws CancelledError when the token cancels", async () => {
    const abort = vi.fn(() => Promise.resolve());
    const get = vi.fn(() => Promise.resolve({ status: "RUNNING" })); // never terminal
    const client = {
      actor: () => ({ start: () => Promise.resolve({ id: "ar1", defaultDatasetId: "ds1" }) }),
      run: () => ({ get, abort }),
      dataset: () => ({ listItems: () => Promise.resolve({ items: [] }) }),
    } as never;

    await expect(
      runActor({ client, actorId: "x", input: {}, pollIntervalMs: 1, cancellation: alwaysCancelToken() }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("still aborts+throws when the abort call itself rejects", async () => {
    const abort = vi.fn(() => Promise.reject(new Error("already terminal")));
    const get = vi.fn(() => Promise.resolve({ status: "RUNNING" }));
    const client = {
      actor: () => ({ start: () => Promise.resolve({ id: "ar1", defaultDatasetId: "ds1" }) }),
      run: () => ({ get, abort }),
      dataset: () => ({ listItems: () => Promise.resolve({ items: [] }) }),
    } as never;

    await expect(
      runActor({ client, actorId: "x", input: {}, pollIntervalMs: 1, cancellation: alwaysCancelToken() }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(abort).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/apify-cancel.test.ts`
Expected: FAIL — `cancellation` not a known param; no abort.

- [ ] **Step 3: Modify `src/discovery/apify-client.ts`**

Add the import at the top (after the existing import):
```ts
import type { CancellationToken } from "../workflows/cancellation.js";
```

Add `cancellation?` to `RunActorInput`:
```ts
export interface RunActorInput {
  client: ApifyClient;
  actorId: string;
  input: Record<string, unknown>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  cancellation?: CancellationToken;
}
```

Inside `runActor`, replace the `while (Date.now() < deadline) {` loop body's start so the cancel check runs each iteration and aborts on cancel. The loop becomes:
```ts
  while (Date.now() < deadline) {
    if (input.cancellation) {
      try {
        await input.cancellation.throwIfCancelled();
      } catch (err) {
        await input.client.run(runId).abort().catch(() => {});
        throw err;
      }
    }
    const run = await input.client.run(runId).get();
    if (!run) {
      throw new Error(`Apify run ${runId} disappeared`);
    }
    if (TERMINAL_OK.has(run.status)) {
      const list = await input.client.dataset(datasetId).listItems();
      return { runId, datasetId, items: list.items };
    }
    if (TERMINAL_FAIL.has(run.status)) {
      throw new Error(`Apify actor ${input.actorId} finished with status ${run.status}`);
    }
    await sleep(pollInterval);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/apify-cancel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing apify-client test for no regression**

Run: `npx vitest run tests/unit/apify-client.test.ts`
Expected: PASS (cancellation is optional; existing calls pass no token).

- [ ] **Step 6: Commit**

```bash
git add src/discovery/apify-client.ts tests/unit/apify-cancel.test.ts
git commit -m "feat(cancel): runActor aborts in-flight run on cancellation"
```

---

## Task 5: Thread cancellation through types, scrape, concurrency, enrich-qualify (discovery-service)

**Files:**
- Modify: `src/workflows/types.ts`
- Modify: `src/workflows/scrape.ts`
- Modify: `src/workflows/concurrency.ts`
- Modify: `src/workflows/enrich-qualify.ts`
- Test: `tests/unit/enrich-qualify-cancel.test.ts`

- [ ] **Step 1: Add `cancellation` to the context type**

In `src/workflows/types.ts`, add the import at the top:
```ts
import type { CancellationToken } from "./cancellation.js";
```
Then add one field to `WorkflowContext` (after `sheetInputUrl?: string;`):
```ts
  cancellation?: CancellationToken;
```

- [ ] **Step 2: Forward cancellation from scrape helpers into the default runActor call**

In `src/workflows/scrape.ts`, each of the four scrape inputs (`ScrapePostReactionsInput`, `ScrapeProfileInput`, `ScrapeCompanyPostsInput`, `ScrapePostCommentsInput`) gains a `cancellation?` field. Add this line to each interface:
```ts
  cancellation?: import("../discovery/apify-client.js").RunActorInput["cancellation"];
```
And in each helper, change the default `exec` so the real `runActor` receives the token. For every occurrence of:
```ts
  const exec = input.runActor ?? ((a) => runActor({ ...a, pollIntervalMs: 10_000, timeoutMs: 10 * 60_000 }));
```
replace with:
```ts
  const exec = input.runActor ?? ((a) => runActor({ ...a, pollIntervalMs: 10_000, timeoutMs: 10 * 60_000, cancellation: input.cancellation }));
```
(There are four such lines — in `scrapeProfile`, `scrapeCompanyPosts`, `scrapePostComments`, `scrapePostReactions`.)

- [ ] **Step 3: Add a per-iteration cancel check to mapWithConcurrency**

In `src/workflows/concurrency.ts`, change the signature and worker loop:
```ts
import type { CancellationToken } from "./cancellation.js";

/** Run fn over items with at most `limit` concurrent tasks, preserving input order in the result. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  cancellation?: CancellationToken,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;
  const workers = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      if (cancellation) await cancellation.throwIfCancelled();
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
```

- [ ] **Step 4: Write the failing test for enrich-qualify cancellation**

Create `tests/unit/enrich-qualify-cancel.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { enrichAndQualify } from "../../src/workflows/enrich-qualify.js";
import { CancelledError } from "../../src/workflows/cancellation.js";

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

describe("enrichAndQualify cancellation", () => {
  it("stops before the next batch when cancelled, throwing CancelledError", async () => {
    const engagers = Array.from({ length: 12 }, (_, i) => ({ profileUrl: `u${i}`, comment: "" }));
    const scrapeProfileImpl = vi.fn(async (a: { profileUrl: string }) => ({
      profileUrl: a.profileUrl, name: "n", about: null, headline: null,
      followerCount: null, connectionCount: null, currentCompany: null, currentCompanyUrl: null,
    }));
    const qualifyImpl = vi.fn(async () => ({ qualification: "NO-GO", reasoning: "r", score: 0 } as never));
    let calls = 0;
    const cancellation = { async throwIfCancelled() { calls += 1; if (calls > 1) throw new CancelledError(); } };

    await expect(
      enrichAndQualify({
        engagers, client: {} as never, anthropic: {} as never, kbRoot: "/kb", slug: "actuals",
        logger: log, batchSize: 5, batchDelayMs: 0, scrapeProfileImpl, qualifyImpl, cancellation,
      }),
    ).rejects.toBeInstanceOf(CancelledError);
    // Cancelled after the first batch: not all 12 engagers were processed.
    expect(scrapeProfileImpl.mock.calls.length).toBeLessThan(engagers.length);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/unit/enrich-qualify-cancel.test.ts`
Expected: FAIL — `cancellation` not a known field; no check between batches.

- [ ] **Step 6: Modify `src/workflows/enrich-qualify.ts`**

Add the import at the top:
```ts
import type { CancellationToken } from "./cancellation.js";
```
Add a field to `EnrichAndQualifyInput` (after `qualifyImpl?: QualifyFn;`):
```ts
  cancellation?: CancellationToken;
```
In the batch loop, add a cancel check at the top of each batch iteration. Change:
```ts
  for (let i = 0; i < work.length; i += batchSize) {
    const batch = work.slice(i, i + batchSize);
```
to:
```ts
  for (let i = 0; i < work.length; i += batchSize) {
    if (input.cancellation) await input.cancellation.throwIfCancelled();
    const batch = work.slice(i, i + batchSize);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/enrich-qualify-cancel.test.ts tests/unit/concurrency.test.ts`
Expected: PASS (new cancel test + existing concurrency tests still green).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/workflows/types.ts src/workflows/scrape.ts src/workflows/concurrency.ts src/workflows/enrich-qualify.ts tests/unit/enrich-qualify-cancel.test.ts
git commit -m "feat(cancel): thread CancellationToken through scrape/concurrency/enrich-qualify"
```

---

## Task 6: Runner wiring + module checkpoints (discovery-service)

**Files:**
- Modify: `src/workflows/runner.ts`
- Modify: `src/workflows/modules/specific-posts.ts`
- Modify: `src/workflows/modules/all-posts.ts`
- Modify: `src/workflows/modules/campaigns.ts`
- Modify: `src/workflows/modules/comment-posts.ts`
- Test: `tests/unit/runner-cancel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-cancel.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runWorkflow } from "../../src/workflows/runner.js";
import { CancelledError } from "../../src/workflows/cancellation.js";
import type { WorkflowModule } from "../../src/workflows/types.js";

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

function fakeSupabase() {
  const update = vi.fn((_patch: Record<string, unknown>) => ({
    eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
  return {
    client: { from: () => ({ update }) } as never,
    update,
  };
}

describe("runWorkflow cancellation", () => {
  it("maps CancelledError to status='cancelled' and returns 0 (no rethrow)", async () => {
    const { client, update } = fakeSupabase();
    const mod = { run: async () => { throw new CancelledError(); } } as never as WorkflowModule;
    const code = await runWorkflow({
      supabase: client, runId: "r1", mode: "stub", logger: log, modules: { stub: mod },
    });
    expect(code).toBe(0);
    const patch = update.mock.calls.at(-1)![0];
    expect(patch.status).toBe("cancelled");
    expect(typeof patch.cancelled_at).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/runner-cancel.test.ts`
Expected: FAIL — runner currently rethrows and finalizes `failed`, not `cancelled`.

- [ ] **Step 3: Modify `src/workflows/runner.ts`**

Add imports at the top (after the existing imports):
```ts
import { makeCancellationToken, CancelledError } from "./cancellation.js";
```
Replace the `try { ... } catch (err) { ... }` body of `runWorkflow` with:
```ts
  const cancellation = makeCancellationToken({ supabase, runId });
  try {
    const module = (input.modules ?? MODULES)[mode];
    if (!module) throw new Error(`unknown mode "${mode}"`);

    logger.info({ runId, mode }, "Workflow run starting");
    const outputs = await module.run({
      mode, runId, logger,
      apify: input.apify, anthropic: input.anthropic,
      kbRoot: input.kbRoot, slug: input.slug, sheetInputUrl: input.sheetInputUrl,
      cancellation,
    });

    const counts: Record<string, number> = {};
    let totalAppended = 0;
    let totalFailed = 0;
    for (const group of outputs) {
      const r = await appendRows({
        webhookUrl: input.webhookUrl, target: group.sheet, rows: group.rows,
        fetchImpl: input.fetchImpl, logger,
      });
      counts[`${group.sheet}_rows`] = group.rows.length;
      counts[`${group.sheet}_appended`] = r.appended;
      totalAppended += r.appended;
      totalFailed += r.failed;
    }
    counts.appended = totalAppended;
    counts.failed = totalFailed;
    await finalizeWorkflowRun({ supabase, runId, status: "completed", counts });
    logger.info({ runId, mode, counts }, "Workflow run complete");
    return 0;
  } catch (err) {
    if (err instanceof CancelledError) {
      logger.info({ runId, mode }, "Workflow run cancelled");
      try {
        await finalizeWorkflowRun({ supabase, runId, status: "cancelled" });
      } catch {
        // best-effort
      }
      return 0;
    }
    const message = err instanceof Error ? err.message : String(err);
    try {
      await finalizeWorkflowRun({ supabase, runId, status: "failed", error: message });
    } catch {
      // best-effort; don't mask the original error
    }
    throw err;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/runner-cancel.test.ts tests/unit/runner.test.ts`
Expected: PASS (new cancel test + existing runner tests).

- [ ] **Step 5: Add the loop-top cancel check + scrape forwarding in each mode**

These edits add an early cancel check and forward the token into scrape calls so a long scrape can be aborted promptly.

In `src/workflows/modules/specific-posts.ts`, inside `run`, change the post loop:
```ts
  for (const postUrl of postUrls) {
    const reactions = await deps.scrapePostReactionsImpl({ client: ctx.apify, postUrl });
```
to:
```ts
  for (const postUrl of postUrls) {
    await ctx.cancellation?.throwIfCancelled();
    const reactions = await deps.scrapePostReactionsImpl({ client: ctx.apify, postUrl, cancellation: ctx.cancellation });
```
and add `cancellation: ctx.cancellation,` to the `deps.enrichAndQualifyImpl({ ... })` call object.

In `src/workflows/modules/all-posts.ts`: forward the token into the `scrapeCompanyPosts` call (add `cancellation: ctx.cancellation`), add `await ctx.cancellation?.throwIfCancelled();` at the top of the per-post reactions loop and forward `cancellation: ctx.cancellation` into the `scrapePostReactions` call, and add `cancellation: ctx.cancellation,` to the `enrichAndQualify` call.

In `src/workflows/modules/campaigns.ts`: add `await ctx.cancellation?.throwIfCancelled();` at the top of the per-post loop, forward `cancellation: ctx.cancellation` into the `scrapePostReactions` call, and add `cancellation: ctx.cancellation,` to the `enrichAndQualify` call.

In `src/workflows/modules/comment-posts.ts`: add `await ctx.cancellation?.throwIfCancelled();` at the top of the per-post loop, forward `cancellation: ctx.cancellation` into the `scrapePostComments` call, and add `cancellation: ctx.cancellation,` to the `enrichAndQualify` call.

(If a module passes scrape deps differently, the rule is the same: a `throwIfCancelled()` at the top of every loop over posts/profiles, `cancellation: ctx.cancellation` on every scrape call, and `cancellation: ctx.cancellation` in the `enrichAndQualify` input.)

- [ ] **Step 6: Run the full mode test suite + typecheck**

Run: `npx vitest run tests/unit/specific-posts.test.ts tests/unit/all-posts.test.ts tests/unit/campaigns.test.ts tests/unit/comment-posts.test.ts && npm run typecheck`
Expected: PASS, 0 type errors. (Modes pass `cancellation` through; the existing tests inject deps and pass no token, so `ctx.cancellation` is `undefined` and the optional-chained checks are no-ops.)

- [ ] **Step 7: Run the entire suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/workflows/runner.ts src/workflows/modules/ tests/unit/runner-cancel.test.ts
git commit -m "feat(cancel): runner finalizes cancelled (exit 0); modes checkpoint + forward token"
```

- [ ] **Step 9: Push the discovery-service branch**

```bash
git push -u origin feat/workflow-cancel
```

---

## Task 7: SPA API — DELETE cancel branch (lead-flow SPA)

**Files:**
- Modify: `lead-flow-311625f1/api/workflows.js`
- Test: `lead-flow-311625f1/tests/workflows-cancel.test.js`

All steps run from `lead-flow-311625f1/` (already on branch `feat/workflow-cancel`).

- [ ] **Step 1: Write the failing test**

Create `tests/workflows-cancel.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = { row: { id: "r1", status: "running" }, updateMatched: 1 };
const updateCalls = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== "workflow_runs") throw new Error(`unexpected table ${table}`);
      return {
        // GET path (not used here) + DELETE path use these:
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockState.row, error: null }) }) }),
        update: (patch) => {
          const eqs = [];
          const chain = {
            eq: (c, v) => { eqs.push([c, v]); return chain; },
            select: () => ({ then: (res) => { updateCalls.push({ patch, eqs }); res({ data: mockState.updateMatched ? [mockState.row] : [], error: null }); } }),
          };
          return chain;
        },
      };
    },
  }),
}));

beforeEach(() => {
  updateCalls.length = 0;
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
});

function makeRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe("DELETE /api/workflows (cancel)", () => {
  it("400 when run_id is missing", async () => {
    const handler = (await import("../api/workflows.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("flags cancel_requested where status=running and returns cancelling", async () => {
    mockState.updateMatched = 1;
    const handler = (await import("../api/workflows.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: { run_id: "r1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("cancelling");
    const call = updateCalls.at(-1);
    expect(call.patch.cancel_requested).toBe(true);
    expect(call.eqs).toContainEqual(["id", "r1"]);
    expect(call.eqs).toContainEqual(["status", "running"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflows-cancel.test.js`
Expected: FAIL — handler has no `DELETE` branch (falls through to 405).

- [ ] **Step 3: Modify `api/workflows.js`**

Add `cancelled_at` to the GET select. Change:
```js
      .select("id, mode, status, counts, error, started_at, finished_at")
```
to:
```js
      .select("id, mode, status, counts, error, started_at, finished_at, cancelled_at")
```

Add a `DELETE` branch immediately after the GET block (before the `if (req.method !== "POST")` guard):
```js
  // DELETE ?run_id=<id> — request cancellation of a running workflow.
  if (req.method === "DELETE") {
    const runId = req.query?.run_id;
    if (!runId) return res.status(400).json({ error: "Missing run_id" });
    const { data, error } = await supabase
      .from("workflow_runs")
      .update({ cancel_requested: true })
      .eq("id", runId)
      .eq("status", "running")
      .select("id");
    if (error) return res.status(500).json({ error: error.message });
    if ((data ?? []).length > 0) return res.status(200).json({ status: "cancelling" });
    // Not running (already terminal or unknown) — idempotent no-op.
    const current = await supabase
      .from("workflow_runs")
      .select("status")
      .eq("id", runId)
      .single();
    return res.status(200).json({ status: current.data?.status ?? "unknown" });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflows-cancel.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run existing API tests for no regression**

Run: `npx vitest run tests/workflows.test.js tests/api-runs.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/workflows.js tests/workflows-cancel.test.js
git commit -m "feat(cancel): DELETE /api/workflows sets cancel_requested when running"
```

---

## Task 8: WorkflowContext — cancelWorkflow + cancelled handling + toast fix (lead-flow SPA)

**Files:**
- Modify: `lead-flow-311625f1/src/components/WorkflowContext.jsx`

No automated component test is added: the SPA's existing test suite covers only serverless handlers (no React Testing Library / jsdom is configured, and this plan does not introduce a new test framework). This task is verified by `npm run typecheck` plus the live smoke in Task 10.

- [ ] **Step 1: Add the `cancelled` toast branch + `cancelling` state**

In `src/components/WorkflowContext.jsx`, add a `cancelling` state next to the others (after line 25's `activeWorkflowName` state):
```jsx
  const [cancelling, setCancelling] = useState(false);
```

In `endWorkflow`, also reset cancelling and add the cancelled toast branch. Change the toast block so it reads:
```jsx
    setCancelling(false);

    if (result && result.cancelled) {
      toast(`${name || "Workflow"} geannuleerd`);
    } else if (result && result.failed) {
      toast.error(`${name || "Workflow"} is mislukt${result.error ? `: ${result.error}` : ""}`);
    } else if (name) {
      const added = result && typeof result.appended === "number" ? result.appended : null;
      toast.success(
        added !== null
          ? `${name} is klaar! ${added} ${added === 1 ? "rij" : "rijen"} toegevoegd`
          : `${name} is klaar!`
      );
    }
```
(Place `setCancelling(false);` before the `if` chain, after the existing `clearInterval` block.)

- [ ] **Step 2: Handle `cancelled` status in the poll loop**

In `pollStatus`, extend the status handling:
```jsx
      if (data.status === "completed") {
        endWorkflow(name, { appended: data.counts?.appended });
      } else if (data.status === "failed") {
        endWorkflow(name, { failed: true, error: data.error });
      } else if (data.status === "cancelled") {
        endWorkflow(name, { cancelled: true });
      }
```

- [ ] **Step 3: Add `cancelWorkflow`**

After `startWorkflow`, add:
```jsx
  const cancelWorkflow = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    setCancelling(true);
    try {
      await fetch(`/api/workflows?run_id=${encodeURIComponent(runId)}`, { method: "DELETE" });
    } catch {
      // ignore; the poll loop will still observe a cancelled status if it lands
    }
    // Intentionally keep polling — endWorkflow fires when status flips to "cancelled".
  }, []);
```

- [ ] **Step 4: Expose the new values**

Change the provider value to:
```jsx
    <WorkflowContext.Provider value={{ workflowRunning, activeWorkflowName, cancelling, startWorkflow, endWorkflow, cancelWorkflow }}>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/WorkflowContext.jsx
git commit -m "feat(cancel): WorkflowContext cancelWorkflow + cancelled handling + toast fix"
```

---

## Task 9: WorkflowActivated — wire the button (lead-flow SPA)

**Files:**
- Modify: `lead-flow-311625f1/src/pages/WorkflowActivated.jsx`

Verified by `npm run typecheck` + the live smoke in Task 10.

- [ ] **Step 1: Use cancelWorkflow + cancelling in the page**

In `src/pages/WorkflowActivated.jsx`, change the hook destructure:
```jsx
  const { workflowRunning, activeWorkflowName, endWorkflow } = useWorkflow();
```
to:
```jsx
  const { workflowRunning, activeWorkflowName, cancelling, cancelWorkflow } = useWorkflow();
```

Replace `handleCancel`:
```jsx
  const handleCancel = () => {
    cancelWorkflow();
    // Stay on this page; the button shows "Annuleren…" until polling confirms cancelled.
  };
```
(`navigate`/`createPageUrl`/`endWorkflow` may become unused — remove those imports/lines if the linter flags them. The "Nieuwe workflow starten" `Link` already provides a way back to Home.)

- [ ] **Step 2: Reflect the cancelling state on the button**

Change the cancel button block:
```jsx
            {workflowRunning && (
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/8 transition-all duration-200 active:scale-[0.98]"
              >
                <XCircle className="w-3.5 h-3.5" />
                Workflow annuleren
              </button>
            )}
```
to:
```jsx
            {workflowRunning && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/8 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="w-3.5 h-3.5" />
                {cancelling ? "Annuleren…" : "Workflow annuleren"}
              </button>
            )}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 4: Commit + push**

```bash
git add src/pages/WorkflowActivated.jsx
git commit -m "feat(cancel): wire WorkflowActivated button to cancelWorkflow"
git push -u origin feat/workflow-cancel
```

---

## Task 10: Apply migration + live verification

**Files:** none (operational).

- [ ] **Step 1: Apply the migration to Supabase**

Run the contents of `Lead_finder/lead-discovery-service/scripts/sql/013_workflow_runs_cancel.sql` against the Supabase project (SQL editor or `psql`). It is idempotent (`add column if not exists`).
Verify: `select column_name from information_schema.columns where table_name='workflow_runs' and column_name in ('cancel_requested','cancelled_at');` returns both rows.

- [ ] **Step 2: Merge both branches so production runs the new code**

The discovery-service `main` is what GitHub Actions dispatches (`ref: "main"`), and the SPA auto-deploys from its `main`. Open a PR for each `feat/workflow-cancel` branch, ensure CI is green, and merge. (Do not skip — a cancel flag set by the SPA does nothing until the CLI on `main` knows how to read it.)

- [ ] **Step 3: Live smoke (costs one real run)**

Start a `specific-posts` run from the app, then within ~1 minute click "Workflow annuleren". Observe:
- The button shows "Annuleren…".
- Within ~10–15s the status poll returns `cancelled` and a "{naam} geannuleerd" toast appears (NOT "is klaar!").
- `select status, cancel_requested, cancelled_at from workflow_runs order by started_at desc limit 1;` shows `status='cancelled'`, `cancel_requested=true`, `cancelled_at` set.
- The GitHub Actions run finishes quickly (CLI exited 0) and the in-flight Apify actor run shows `ABORTED` in the Apify console.

- [ ] **Step 4: Confirm the failure-path guard**

Verify the run-workflow.yml run did NOT mark the row `failed` (the `if: failure()` step is skipped because the CLI exited 0). The row stays `cancelled`.

---

## Notes for the implementer

- **Two separate git repos.** Tasks 1–6 commit in `Lead_finder/lead-discovery-service/`; Tasks 7–9 in `lead-flow-311625f1/`. Each has its own `feat/workflow-cancel` branch.
- **The CLI must reach `main` of `lead-discovery-service`** for cancel to work in production — the SPA dispatches `ref: "main"`. Until merged, a cancel request just sets a flag nothing reads.
- **`stub` mode** does not scrape; it's the cheapest way to exercise the dispatch plumbing but it won't exercise the Apify-abort path. Use `specific-posts` for the real cancel smoke.
- **Run the full suite** (`npm test`) in the discovery-service before pushing — the cancellation threading touches shared helpers.
