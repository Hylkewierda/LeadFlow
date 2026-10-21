import { createClient } from "@supabase/supabase-js";
import { withAuth } from "./_lib/auth.js";

// Workspace-scoped reads/writes that the browser used to do with the anon key.
// Replaces api/qualifier-feedback.js (same function slot — Vercel Hobby caps a
// deployment at 12 functions).
//
// GET ?view=settings          → { qualifier_feedback, scope_steering }
// GET ?view=top-leads         → { leads }       (home_top_leads, newest first)
// GET ?view=audience-insight  → { insight }     (latest workflow_runs.audience_insight)
// PUT { field, value }        → field = qualifier_feedback (max 4000) | scope_steering (max 1500)

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const FEEDBACK_MAX = 4000;
const STEERING_MAX = 1500;
const TOP_LEAD_COLS =
  "id,linkedin_url,profile,icp_score,qualification,engagement_score,signal_context,source_mode,run_id,scored_at";

async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  const supabase = serverSupabase();
  const slug = (req.query?.workspace || req.body?.workspaceSlug || "actuals").trim();

  if (req.method === "GET") {
    const view = req.query?.view;

    if (view === "settings") {
      const { data, error } = await supabase
        .from("workspaces")
        .select("qualifier_feedback, scope_steering")
        .eq("slug", slug)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: `workspace "${slug}" not found` });
      return res.status(200).json({
        qualifier_feedback: data.qualifier_feedback ?? "",
        scope_steering: data.scope_steering ?? "",
      });
    }

    if (view === "top-leads") {
      const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
      if (ws.error) return res.status(500).json({ error: ws.error.message });
      if (!ws.data) return res.status(404).json({ error: `workspace "${slug}" not found` });
      const { data, error } = await supabase
        .from("home_top_leads")
        .select(TOP_LEAD_COLS)
        .eq("workspace_id", ws.data.id)
        .order("scored_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ leads: data ?? [] });
    }

    if (view === "audience-insight") {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("mode,started_at,audience_insight")
        .not("audience_insight", "is", null)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ insight: data?.[0] ?? null });
    }

    return res.status(400).json({ error: "view must be settings, top-leads or audience-insight" });
  }

  if (req.method === "PUT") {
    const { field, value } = req.body || {};
    if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
    let patch;
    if (field === "qualifier_feedback") {
      if (value.length > FEEDBACK_MAX) return res.status(400).json({ error: `value exceeds ${FEEDBACK_MAX} chars` });
      patch = { qualifier_feedback: value };
    } else if (field === "scope_steering") {
      const trimmed = value.trim();
      patch = { scope_steering: trimmed ? trimmed.slice(0, STEERING_MAX) : null };
    } else {
      return res.status(400).json({ error: "field must be qualifier_feedback or scope_steering" });
    }
    const { data, error } = await supabase.from("workspaces").update(patch).eq("slug", slug).select("id");
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `workspace "${slug}" not found` });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export default withAuth(handler);
