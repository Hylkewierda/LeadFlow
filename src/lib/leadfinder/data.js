import { browserSupabase } from "./supabase.js";

const WORKSPACE_SLUG = "actuals";
let workspaceIdCache = null;

// Explicit column list for the candidate list. We must NOT `select("*")` here:
// the `embedding` column is a 1536-dim pgvector, and pulling it for up to 1000
// rows per page (2000+ candidates) makes PostgREST 500 on payload size/timeout.
// These are every column the UI needs minus `embedding`/`embedded_at`.
const CANDIDATE_LIST_COLUMNS =
  "id,linkedin_url,linkedin_profile,signal_type,signal_context,signal_history,pre_score,status,first_run_id,last_run_id,created_at,updated_at,workspace_id,disqualify_reason,disqualify_note,qualified_by,hubspot_contact_id,pushed_to_hubspot_at,pushed_by,exported_to_sheet_at,llm_score,llm_reasoning,llm_qualified_at,lookalike_search_id,lookalike_sim";

async function getWorkspaceId() {
  if (workspaceIdCache) return workspaceIdCache;
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", WORKSPACE_SLUG)
    .single();
  if (error) throw new Error(`Workspace lookup failed: ${error.message}`);
  workspaceIdCache = data.id;
  return workspaceIdCache;
}

export async function listCandidates({ statuses, search } = {}) {
  const supabase = browserSupabase();
  const workspaceId = await getWorkspaceId();

  // PostgREST returns max 1000 rows per request; paginate via .range().
  const PAGE_SIZE = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from("candidates")
      .select(CANDIDATE_LIST_COLUMNS)
      .eq("workspace_id", workspaceId);
    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }
    if (search && search.trim()) {
      const needle = `%${search.trim()}%`;
      query = query.or(
        `linkedin_profile->>name.ilike.${needle},linkedin_profile->>role.ilike.${needle},linkedin_profile->>headline.ilike.${needle},linkedin_profile->>company.ilike.${needle}`,
      );
    }
    const { data, error } = await query
      .order("pre_score", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function qualifyCandidate(id) {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("candidates")
    .update({
      status: "qualified",
      disqualify_reason: null,
      disqualify_note: null,
      qualified_by: "leadflow-user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

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
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("candidates")
    .update({
      status: "disqualified",
      disqualify_reason: reason,
      disqualify_note: note?.trim() || null,
      qualified_by: "leadflow-user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function resetCandidate(id) {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("candidates")
    .update({
      status: "new",
      disqualify_reason: null,
      disqualify_note: null,
      qualified_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listRecentRuns(limit = 5) {
  const supabase = browserSupabase();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
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

export async function getScopeSteering() {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .select("scope_steering")
    .eq("slug", WORKSPACE_SLUG)
    .single();
  if (error) throw new Error(error.message);
  return data?.scope_steering ?? "";
}

export async function saveScopeSteering(text) {
  const supabase = browserSupabase();
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase
    .from("workspaces")
    .update({ scope_steering: text.trim() ? text.trim().slice(0, 1500) : null })
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);
}

export async function listPostAnalyses(runId) {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("post_analyses")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
