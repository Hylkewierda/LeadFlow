import { createClient } from "@supabase/supabase-js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res) {
  const supabase = serverSupabase();

  if (req.method === "GET") {
    const slug = (req.query?.workspace || "actuals").trim();
    const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (ws.error) return res.status(500).json({ error: ws.error.message });
    if (!ws.data) return res.status(404).json({ error: `Workspace "${slug}" not found` });
    const { data, error } = await supabase
      .from("qualifier_exemplars")
      .select("id, verdict, headline, role, company, location, reasoning, pinned, source, created_at")
      .eq("workspace_id", ws.data.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ exemplars: data ?? [], count: (data ?? []).length });
  }

  if (req.method === "PATCH") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const pinned = !!(req.body || {}).pinned;
    const { error } = await supabase.from("qualifier_exemplars").update({ pinned }).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { error } = await supabase.from("qualifier_exemplars").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
