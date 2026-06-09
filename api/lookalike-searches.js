import { createClient } from "@supabase/supabase-js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeUrls(urls) {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .filter((u) => /linkedin\.com\/in\//i.test(u));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

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
    // Already terminal or unknown — idempotent no-op; return current status.
    const current = await supabase
      .from("lookalike_searches")
      .select("status")
      .eq("id", searchId)
      .single();
    return res.status(200).json({ status: current.data?.status ?? "unknown" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const slug = typeof body.workspaceSlug === "string" ? body.workspaceSlug.trim() : "actuals";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const urls = normalizeUrls(body.urls);
  // Steering text the worker threads into both the Opus playbook prompt and
  // the Haiku scoring prompt. Capped at 500 chars server-side — the UI textarea
  // shows a counter at the same limit, and the backend prompt builders defensively
  // slice again so a CLI bypass can't blow up the prompt size.
  const feedback =
    typeof body.feedback === "string" && body.feedback.trim()
      ? body.feedback.trim().slice(0, 500)
      : null;

  if (urls.length === 0) {
    return res
      .status(400)
      .json({ error: "urls[] required (1+ LinkedIn profile URLs containing 'linkedin.com/in/')" });
  }

  const supabase = serverSupabase();

  // Resolve workspace.
  const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws.data) {
    return res.status(404).json({ error: `Workspace "${slug}" not found` });
  }

  // Insert pending row. The CLI worker (triggered via GH Action below) updates
  // status as it progresses; on hard failure the workflow step PATCHes
  // status='failed' so the UI stops polling.
  const inserted = await supabase
    .from("lookalike_searches")
    .insert({
      workspace_id: ws.data.id,
      name: name || null,
      source_urls: urls,
      feedback,
      status: "pending",
    })
    .select("id")
    .single();
  if (!inserted.data) {
    return res
      .status(500)
      .json({ error: `Insert lookalike_searches failed: ${inserted.error?.message ?? "unknown"}` });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return res.status(500).json({ error: "Missing GITHUB_PAT env var" });
  }

  // Dispatch the lookalike-search.yml workflow in the lead-discovery-service
  // repo. The workflow re-reads source_urls[] from the row we just inserted,
  // so we don't pass the URLs through the GH inputs (clean separation + no
  // URL-length limits).
  const dispatch = await fetch(
    "https://api.github.com/repos/Hylkewierda/lead-discovery-service/actions/workflows/lookalike-search.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { workspace: slug, search_id: inserted.data.id },
      }),
    },
  );

  if (!dispatch.ok) {
    const errText = (await dispatch.text()).slice(0, 200);
    await supabase
      .from("lookalike_searches")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: `GitHub dispatch failed: ${errText}`,
      })
      .eq("id", inserted.data.id);
    return res.status(502).json({ error: "Failed to dispatch workflow" });
  }

  return res.status(200).json({ searchId: inserted.data.id });
}
