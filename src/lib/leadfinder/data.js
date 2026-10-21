import { getJSON, sendJSON } from "../api.js";

// All reads/writes go through the API routes (service-role key server-side,
// session cookie required). The browser no longer talks to Supabase.
const WORKSPACE_SLUG = "actuals";

export async function listCandidates({ statuses, search } = {}) {
  const params = new URLSearchParams({ view: "list", workspace: WORKSPACE_SLUG });
  if (statuses && statuses.length > 0) params.set("statuses", statuses.join(","));
  if (search && search.trim()) params.set("search", search.trim());
  const { candidates } = await getJSON(`/api/maybe-leads?${params}`);
  return candidates ?? [];
}

async function patchCandidate(id, body) {
  const { candidate } = await sendJSON(`/api/maybe-leads?id=${encodeURIComponent(id)}`, "PATCH", body);
  return candidate;
}

export async function qualifyCandidate(id) {
  const data = await patchCandidate(id, { action: "qualify" });

  // Fire-and-forget: append the now-qualified lead to the overview Google Sheet.
  // The export must never break the qualify action, so failures are logged, not thrown.
  // The endpoint is idempotent (skips candidates whose exported_to_sheet_at is set).
  exportQualifiedToSheet([id]).catch((e) => console.error("Sheet export failed:", e));

  return data;
}

async function exportQualifiedToSheet(candidateIds) {
  const res = await fetch("/api/export-to-sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateIds }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function disqualifyCandidate(id, reason, note) {
  return patchCandidate(id, { action: "disqualify", reason, note });
}

export async function resetCandidate(id) {
  return patchCandidate(id, { action: "reset" });
}

export async function listRecentRuns(limit = 5) {
  const { runs } = await getJSON(`/api/runs?view=recent&workspace=${WORKSPACE_SLUG}&limit=${limit}`);
  return runs ?? [];
}

export async function startRun(manualPosts = []) {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceSlug: WORKSPACE_SLUG, manualPosts }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function cancelRun(runId) {
  const res = await fetch(`/api/runs?run_id=${encodeURIComponent(runId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`cancelRun failed: ${res.status}`);
  return res.json();
}

export async function getScopeSteering() {
  const settings = await getJSON(`/api/workspace?view=settings&workspace=${WORKSPACE_SLUG}`);
  return settings.scope_steering ?? "";
}

export async function saveScopeSteering(text) {
  await sendJSON("/api/workspace", "PUT", { field: "scope_steering", value: text, workspaceSlug: WORKSPACE_SLUG });
}

export async function listPostAnalyses(runId) {
  const { analyses } = await getJSON(`/api/runs?view=post-analyses&run_id=${encodeURIComponent(runId)}`);
  return analyses ?? [];
}
