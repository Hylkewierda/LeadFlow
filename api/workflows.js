import { createClient } from "@supabase/supabase-js";

const VALID_MODES = ["all-posts", "specific-posts", "campaigns", "comment-posts", "stub"];
const DAILY_LIMIT = 5;
const ACCOUNT_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/(company|in)\/[^/?#]+/i;

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res) {
  const supabase = serverSupabase();

  // GET ?run_id=<id> — status polling
  if (req.method === "GET") {
    const runId = req.query?.run_id;
    if (!runId) return res.status(400).json({ error: "Missing run_id" });
    const { data, error } = await supabase
      .from("workflow_runs")
      .select("id, mode, status, counts, error, started_at, finished_at, cancelled_at")
      .eq("id", runId)
      .single();
    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data || { status: "unknown" });
  }

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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mode = typeof req.body?.mode === "string" ? req.body.mode : "";
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `Unknown mode "${mode}"` });
  }

  let accountUrl = null;
  if (req.body?.accountUrl != null && String(req.body.accountUrl).trim() !== "") {
    accountUrl = String(req.body.accountUrl).trim();
    if (!ACCOUNT_URL_RE.test(accountUrl)) {
      return res.status(400).json({ error: "accountUrl must be a linkedin.com/company/... or linkedin.com/in/... URL" });
    }
  }

  // Guard 1: no run for this mode already in progress.
  const running = await supabase
    .from("workflow_runs")
    .select("id")
    .eq("mode", mode)
    .eq("status", "running");
  if ((running.data ?? []).length > 0) {
    return res.status(409).json({ error: "A run for this mode is already in progress" });
  }

  // Guard 2: daily limit per mode (UTC day).
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const today = await supabase
    .from("workflow_runs")
    .select("id", { count: "exact", head: true })
    .eq("mode", mode)
    .gte("started_at", since.toISOString());
  if ((today.count ?? 0) >= DAILY_LIMIT) {
    return res.status(429).json({ error: `Daily limit reached for "${mode}" (${DAILY_LIMIT}/day)` });
  }

  // Check the PAT BEFORE inserting, so a misconfigured env never orphans a
  // status='running' row (which would permanently block this mode via Guard 1).
  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "Missing GITHUB_PAT env var" });

  const inserted = await supabase
    .from("workflow_runs")
    .insert({ mode, status: "running", triggered_by: "cloud-ui", counts: {}, input_url: accountUrl })
    .select("id")
    .single();
  if (!inserted.data) {
    return res.status(500).json({ error: `Insert failed: ${inserted.error?.message ?? "unknown"}` });
  }

  const dispatch = await fetch(
    "https://api.github.com/repos/Hylkewierda/lead-discovery-service/actions/workflows/run-workflow.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { mode, run_id: inserted.data.id, account_url: accountUrl ?? "" } }),
    },
  );

  if (!dispatch.ok) {
    const errText = (await dispatch.text()).slice(0, 200);
    await supabase
      .from("workflow_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: `GitHub dispatch failed: ${errText}` })
      .eq("id", inserted.data.id);
    return res.status(502).json({ error: "Failed to dispatch workflow" });
  }

  return res.status(200).json({ runId: inserted.data.id });
}
