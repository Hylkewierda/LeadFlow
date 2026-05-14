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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const slug = typeof body.workspaceSlug === "string" ? body.workspaceSlug.trim() : "actuals";

  const supabase = serverSupabase();

  const ws = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!ws.data) {
    return res.status(404).json({ error: `Workspace "${slug}" not found` });
  }

  const running = await supabase
    .from("runs")
    .select("id")
    .eq("workspace_id", ws.data.id)
    .eq("status", "running")
    .limit(1);
  if ((running.data ?? []).length > 0) {
    return res.status(409).json({ error: "Run already in progress" });
  }

  const inserted = await supabase
    .from("runs")
    .insert({
      workspace_id: ws.data.id,
      status: "running",
      started_at: new Date().toISOString(),
      triggered_by: "cloud-ui",
      playbook: {},
      apify_run_ids: {},
      counts: {},
    })
    .select("id")
    .single();
  if (!inserted.data) {
    return res.status(500).json({
      error: `Insert run failed: ${inserted.error?.message ?? "unknown"}`,
    });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return res.status(500).json({ error: "Missing GITHUB_PAT env var" });
  }

  const dispatch = await fetch(
    "https://api.github.com/repos/Hylkewierda/lead-discovery-service/actions/workflows/discover.yml/dispatches",
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
        inputs: { workspace: slug, run_id: inserted.data.id },
      }),
    },
  );

  if (!dispatch.ok) {
    const errText = (await dispatch.text()).slice(0, 200);
    await supabase
      .from("runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: `GitHub dispatch failed: ${errText}`,
      })
      .eq("id", inserted.data.id);
    return res.status(502).json({ error: "Failed to dispatch workflow" });
  }

  return res.status(200).json({ runId: inserted.data.id });
}
