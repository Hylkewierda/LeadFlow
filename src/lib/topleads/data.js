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
