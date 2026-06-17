import { createClient } from "@supabase/supabase-js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MAX_LEN = 4000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  if (typeof body.feedback !== "string") return res.status(400).json({ error: "feedback must be a string" });
  const feedback = body.feedback.slice(0, MAX_LEN + 1);
  if (feedback.length > MAX_LEN) return res.status(400).json({ error: `feedback exceeds ${MAX_LEN} chars` });
  const slug = typeof body.workspaceSlug === "string" ? body.workspaceSlug.trim() : "actuals";

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .update({ qualifier_feedback: feedback })
    .eq("slug", slug)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: `workspace "${slug}" not found` });
  return res.status(200).json({ ok: true });
}
