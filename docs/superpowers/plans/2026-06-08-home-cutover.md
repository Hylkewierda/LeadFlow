# Home cutover to `/api/workflows` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 4 Home workflow buttons from the legacy n8n webhook onto the new `/api/workflows` code pipeline, one mode at a time, while keeping live "running → done" status with completion counts.

**Architecture:** `WORKFLOW_MODES` gains an `apiMode` + a per-mode `pipeline: "new" | "n8n"` flag. `triggerWorkflow` branches on that flag. `WorkflowContext` becomes run_id-aware: with a `runId` it polls `GET /api/workflows?run_id`, otherwise it keeps the legacy name-based Redis poll. Completion counts surface via the success toast — no `WorkflowActivated` change needed.

**Tech Stack:** React 18, Vite 6, React Router v6, `sonner` toasts, Vercel serverless (`/api/workflows` already deployed).

**Branch:** `feat/home-cutover-api-workflows` (already created; spec committed at `fa603e3`).

**Testing note:** The SPA has no component unit tests (repo convention = verify visually). Each code task is gated by `npm run typecheck && npm run lint`, and the final task runs a real end-to-end verification through the live Comment Posts button (re-using the already-green backend path).

---

### Task 1: Add `apiMode` + `pipeline` flags to `WORKFLOW_MODES`

**Files:**
- Modify: `src/pages/Home.jsx:11-16`

- [ ] **Step 1: Replace the `WORKFLOW_MODES` array**

Replace lines 11-16 with:

```jsx
const WORKFLOW_MODES = [
  { id: "AllPosts", storageId: "all_posts", label: "All Posts", description: "Analyseer alle posts", sheetUrl: null, apiMode: "all-posts", pipeline: "n8n" },
  { id: "SpecificPosts", storageId: "specific_posts_v2", label: "Specific Posts", description: "Selectieve post analyse", sheetUrl: "https://docs.google.com/spreadsheets/d/1VUHdVrfQbsL8nYMoD1nhAq1ayFFpy77W3Eu7je1CdAc", apiMode: "specific-posts", pipeline: "n8n" },
  { id: "Campaigns", storageId: "campaigns", label: "Campaigns", description: "Campaign leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1UJvwFAZQJ6q_VRp3_MjphJ3bbdAp-JNhe1I08iKlxxU", apiMode: "campaigns", pipeline: "n8n" },
  { id: "CommentPosts", storageId: "comment_posts", label: "Comment Posts", description: "Comment engagement", sheetUrl: "https://docs.google.com/spreadsheets/d/1y4gPlMXPCSn54FyRc3vpMSDfI-L46LqlHaxmOZacJZo", apiMode: "comment-posts", pipeline: "new" },
];
```

Note: only `CommentPosts` starts on `"new"` (it's the fully-validated mode). The other three stay on `"n8n"` until each is validated and flipped in Task 5.

- [ ] **Step 2: Typecheck + lint**

Run: `cd lead-flow-311625f1 && npm run typecheck && npm run lint`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "feat(home): add apiMode + pipeline flag to workflow modes"
```

---

### Task 2: Branch `triggerWorkflow` on `pipeline`

**Files:**
- Modify: `src/pages/Home.jsx:58-100`

- [ ] **Step 1: Replace the whole `triggerWorkflow` function**

Replace lines 58-100 (the current `triggerWorkflow` definition) with:

```jsx
  const triggerWorkflow = async (mode) => {
    const workflowMode = WORKFLOW_MODES.find(m => m.id === mode);
    const currentUsage = getUsageCount(workflowMode.storageId);

    if (currentUsage >= DAILY_LIMIT) {
      setError(`Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}).`);
      return;
    }

    setIsLoading(mode);
    setError(null);
    setWarningMessage(null);

    if (currentUsage === DAILY_LIMIT - 2) {
      setWarningMessage(`Nog 1 run over vandaag voor ${workflowMode.label}`);
    } else if (currentUsage === DAILY_LIMIT - 1) {
      setWarningMessage(`Laatste run vandaag voor ${workflowMode.label}`);
    }

    try {
      if (workflowMode.pipeline === "new") {
        const response = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: workflowMode.apiMode }),
        });

        if (response.status === 409) {
          setError(`Er draait al een run voor ${workflowMode.label}.`);
          return;
        }
        if (response.status === 429) {
          setError(`Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}).`);
          return;
        }
        if (!response.ok) throw new Error("Workflow kon niet worden gestart");

        const data = await response.json();
        startWorkflow(workflowMode.label, data.runId);
      } else {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });

        if (!response.ok) throw new Error("Workflow kon niet worden gestart");

        startWorkflow(workflowMode.label);
      }

      incrementUsage(workflowMode.storageId);
      setUsageCounts(prev => ({
        ...prev,
        [workflowMode.storageId]: currentUsage + 1
      }));

      navigate(createPageUrl("WorkflowActivated"));
    } catch {
      endWorkflow("");
      setError("Er ging iets mis. Controleer de verbinding.");
    } finally {
      setIsLoading(null);
    }
  };
```

Key changes vs the original:
- `startWorkflow(...)` is no longer called up-front; it's called per branch **after** a successful trigger so the `"new"` path can pass `data.runId`.
- `"new"` path posts `{ mode: apiMode }` to `/api/workflows`, handles `409`/`429` with friendly errors (no usage increment, `finally` still clears `isLoading`), and on `200` calls `startWorkflow(label, runId)`.
- `"n8n"` path is unchanged behaviour: posts the PascalCase `mode` id to `WEBHOOK_URL`, then `startWorkflow(label)` (no runId).
- The catch message no longer mentions "webhook URL".

- [ ] **Step 2: Typecheck + lint**

Run: `cd lead-flow-311625f1 && npm run typecheck && npm run lint`
Expected: PASS. (`startWorkflow`/`endWorkflow` accept the new arity after Task 3; this still typechecks because they are untyped JS context functions — but run Task 3 before any runtime test.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "feat(home): branch triggerWorkflow on pipeline flag"
```

---

### Task 3: Make `WorkflowContext` run_id-aware + count toast

**Files:**
- Modify: `src/components/WorkflowContext.jsx`

- [ ] **Step 1: Add `runId` to `loadState` defaults**

Replace the `loadState` function with:

```jsx
const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { workflowRunning: false, activeWorkflowName: "", startedAt: null, runId: null };
    return JSON.parse(stored);
  } catch {
    return { workflowRunning: false, activeWorkflowName: "", startedAt: null, runId: null };
  }
};
```

- [ ] **Step 2: Add a `runIdRef` next to the other refs**

After the line `const startedAtRef = useRef(initial.startedAt);`, add:

```jsx
  const runIdRef = useRef(initial.runId);
```

- [ ] **Step 3: Replace `endWorkflow` to accept a result and surface counts**

Replace the `endWorkflow` callback with:

```jsx
  const endWorkflow = useCallback((completedName, result) => {
    const name = completedName || activeNameRef.current;
    setWorkflowRunning(false);
    setActiveWorkflowName("");
    activeNameRef.current = "";
    startedAtRef.current = null;
    runIdRef.current = null;
    saveState({ workflowRunning: false, activeWorkflowName: "", startedAt: null, runId: null });

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (result && result.failed) {
      toast.error(`${name || "Workflow"} is mislukt${result.error ? `: ${result.error}` : ""}`);
    } else if (name) {
      const added = result && typeof result.appended === "number" ? result.appended : null;
      toast.success(
        added !== null
          ? `${name} is klaar! ${added} ${added === 1 ? "rij" : "rijen"} toegevoegd`
          : `${name} is klaar!`
      );
    }
  }, []);
```

- [ ] **Step 4: Replace `pollStatus` to branch on `runId`**

Replace the `pollStatus` callback with:

```jsx
  const pollStatus = useCallback(async () => {
    const name = activeNameRef.current;
    const startedAt = startedAtRef.current;
    const runId = runIdRef.current;
    if (!name) return;

    try {
      if (runId) {
        const res = await fetch(`/api/workflows?run_id=${encodeURIComponent(runId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          endWorkflow(name, { appended: data.counts?.appended });
        } else if (data.status === "failed") {
          endWorkflow(name, { failed: true, error: data.error });
        }
        return;
      }

      if (!startedAt) return;
      const res = await fetch(`/api/workflow-status?workflow_name=${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "completed" && data.completed_at > startedAt) {
        endWorkflow(name);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [endWorkflow]);
```

- [ ] **Step 5: Replace `startWorkflow` to store `runId`**

Replace the `startWorkflow` function with:

```jsx
  const startWorkflow = (name, runId = null) => {
    const now = Date.now();
    setWorkflowRunning(true);
    setActiveWorkflowName(name);
    activeNameRef.current = name;
    startedAtRef.current = now;
    runIdRef.current = runId;
    saveState({ workflowRunning: true, activeWorkflowName: name, startedAt: now, runId });
  };
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `cd lead-flow-311625f1 && npm run typecheck && npm run lint && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkflowContext.jsx
git commit -m "feat(workflow): run_id-aware polling + completion count toast"
```

---

### Task 4: Local smoke of the new trigger path (mocked)

**Files:**
- None (manual verification with the dev server + mock).

- [ ] **Step 1: Start the dev server**

Run: `cd lead-flow-311625f1 && npm run dev`
Expected: Vite serves on `http://localhost:5173`.

- [ ] **Step 2: Verify the Comment Posts button hits `/api/workflows`**

In the browser devtools Network tab, click **Comment Posts**. Expected: a `POST /api/workflows` with body `{"mode":"comment-posts"}`. (Against `npm run dev` there is no serverless backend, so this will 404/network-error — that is fine for this step; we are only confirming the request shape and that the **other three** buttons still POST to the n8n `WEBHOOK_URL` with their PascalCase id.)

- [ ] **Step 3: Verify the n8n buttons are unchanged**

Click **All Posts**. Expected: a `POST` to `https://hylkewnl.app.n8n.cloud/webhook/...` with body `{"mode":"AllPosts"}`. Confirms the incremental cutover leaves un-flipped modes on the legacy path.

- [ ] **Step 4: Stop the dev server** (Ctrl-C).

---

### Task 5: Deploy + real end-to-end validation, then flip remaining modes

**Files:**
- Modify (per mode, when validated): `src/pages/Home.jsx` (`pipeline: "n8n"` → `"new"`)

- [ ] **Step 1: Push the branch and open a PR (or merge to main per user preference)**

```bash
git push -u origin feat/home-cutover-api-workflows
```
Then merge to `main` so Vercel deploys (the live `/api/workflows` + `GITHUB_PAT` only exist on the deployed site).

- [ ] **Step 2: Validate Comment Posts end-to-end on the live site**

Open the deployed LeadFlow, click **Comment Posts**. Expected: navigates to WorkflowActivated; within ~1-2 min the GitHub Action runs; `WorkflowContext` poll flips to completed and a toast shows the count (e.g. "Comment Posts is klaar! N rijen toegevoegd"). Cross-check the run in `gh run list -R Hylkewierda/lead-discovery-service` and the output sheets.

- [ ] **Step 3: Flip `specific-posts`, validate, commit**

In `src/pages/Home.jsx`, change the `SpecificPosts` entry `pipeline: "n8n"` → `pipeline: "new"`.
Run: `npm run typecheck && npm run lint`
```bash
git add src/pages/Home.jsx
git commit -m "feat(home): cut over specific-posts to /api/workflows"
```
Deploy, then trigger **Specific Posts** on the live site and confirm a green run + sheet output. (The Specific_posts input sheet must have at least one post URL.)

- [ ] **Step 4: Flip `campaigns`, validate, commit**

Change the `Campaigns` entry to `pipeline: "new"`.
Run: `npm run typecheck && npm run lint`
```bash
git add src/pages/Home.jsx
git commit -m "feat(home): cut over campaigns to /api/workflows"
```
Deploy, trigger **Campaigns** live, confirm green run + sheet output. (Campaigns reads 90+ rows — expect a longer run.)

- [ ] **Step 5: Flip `all-posts`, validate, commit**

Change the `AllPosts` entry to `pipeline: "new"`.
Run: `npm run typecheck && npm run lint`
```bash
git add src/pages/Home.jsx
git commit -m "feat(home): cut over all-posts to /api/workflows"
```
Deploy, trigger **All Posts** live, confirm green run + sheet output. (Validate the CLI's `WORKFLOW_COMPANY_URL` resolves to the right company vs the old n8n flow — see the all-posts note in the migration memory.)

- [ ] **Step 6: Retire the legacy path**

Once all 4 modes are `"new"` and validated:
- Disable the big n8n workflow in n8n.
- Remove the `WEBHOOK_URL` constant and the now-dead `"n8n"` branch from `triggerWorkflow`.
- Optionally remove `/api/workflow-status` (Redis) and its env vars if nothing else uses it.
Run: `npm run typecheck && npm run lint && npm run build`
```bash
git add -A
git commit -m "chore(home): retire legacy n8n webhook path after full cutover"
```

---

## Self-Review

**Spec coverage:**
- Spec component 1 (mode config) → Task 1. ✓
- Spec component 2 (triggerWorkflow branch + 409/429) → Task 2. ✓
- Spec component 3 (run_id-aware polling + counts) → Task 3. ✓
- Spec component 4 (surface counts) → satisfied by the toast in Task 3 Step 3; no `WorkflowActivated` change required (documented above). ✓
- Cutover/rollout (per-mode, retire n8n) → Task 5. ✓
- "Do NOT change" items (client limiter, `/api/workflow-status` kept until full cutover, no new pages) → respected; limiter untouched, legacy endpoint removed only in Task 5 Step 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type/name consistency:** `startWorkflow(name, runId)`, `endWorkflow(name, result)` with `result.{appended,failed,error}`, and `pollStatus` reading `data.status/counts.appended/error` are consistent across Tasks 2 and 3. The API contract (`{runId}` on POST; `{status, counts, error}` on GET) matches `api/workflows.js`. ✓
