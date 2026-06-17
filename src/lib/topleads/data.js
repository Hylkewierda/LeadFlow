import { browserSupabase } from "../leadfinder/supabase.js";

const WORKSPACE_SLUG = "actuals";
let workspaceIdCache = null;

async function getWorkspaceId() {
  if (workspaceIdCache) return workspaceIdCache;
  const supabase = browserSupabase();
  const { data, error } = await supabase.from("workspaces").select("id").eq("slug", WORKSPACE_SLUG).single();
  if (error) throw new Error(`Workspace lookup failed: ${error.message}`);
  workspaceIdCache = data.id;
  return workspaceIdCache;
}

export async function listHomeTopLeads() {
  const supabase = browserSupabase();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await supabase
    .from("home_top_leads")
    .select("id,linkedin_url,profile,icp_score,qualification,engagement_score,signal_context,source_mode,run_id,scored_at")
    .eq("workspace_id", workspaceId)
    .order("scored_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLatestAudienceInsight() {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("mode,started_at,audience_insight")
    .not("audience_insight", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function getQualifierFeedback() {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .select("qualifier_feedback")
    .eq("slug", WORKSPACE_SLUG)
    .single();
  if (error) throw new Error(error.message);
  return data?.qualifier_feedback ?? "";
}

export async function saveQualifierFeedback(text) {
  const res = await fetch("/api/qualifier-feedback", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback: text, workspaceSlug: WORKSPACE_SLUG }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed (${res.status})`);
  }
}
