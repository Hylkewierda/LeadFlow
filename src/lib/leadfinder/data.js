import { browserSupabase } from "./supabase.js";

const WORKSPACE_SLUG = "actuals";
let workspaceIdCache = null;

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
  let query = supabase
    .from("candidates")
    .select("*")
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
  const { data, error } = await query.order("pre_score", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
  return data;
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

export async function startRun() {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceSlug: WORKSPACE_SLUG }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return res.json();
}
