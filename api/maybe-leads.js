import { createClient } from "@supabase/supabase-js";
import { normalizeDedupKey } from "../src/lib/dedupKey.js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MAYBE_MIN = 40;
const MAYBE_MAX = 65; // exclusive upper bound: [40, 65) === MAYBE 40-64

export default async function handler(req, res) {
  const supabase = serverSupabase();

  if (req.method === "GET") {
    const slug = (req.query?.workspace || "actuals").trim();
    const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (ws.error) return res.status(500).json({ error: ws.error.message });
    if (!ws.data) return res.status(404).json({ error: `Workspace "${slug}" not found` });

    const { data, error } = await supabase
      .from("candidates")
      .select("id, linkedin_url, llm_score, llm_reasoning, status, linkedin_profile")
      .eq("workspace_id", ws.data.id)
      .gte("llm_score", MAYBE_MIN)
      .lt("llm_score", MAYBE_MAX)
      .in("status", ["new", "rediscovered"]);
    if (error) return res.status(500).json({ error: error.message });

    const candidates = (data ?? []).map((c) => {
      const p = c.linkedin_profile || {};
      return {
        id: c.id,
        linkedin_url: c.linkedin_url,
        name: p.name ?? null,
        headline: p.headline ?? null,
        role: p.role ?? null,
        company: p.company ?? null,
        location: p.location ?? null,
        llm_score: c.llm_score,
        llm_reasoning: c.llm_reasoning,
      };
    });
    return res.status(200).json({ candidates });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const candidateId = body.candidateId;
    const verdict = body.verdict;
    if (!candidateId) return res.status(400).json({ error: "Missing candidateId" });
    if (verdict !== "GO" && verdict !== "NO-GO") {
      return res.status(400).json({ error: "verdict must be GO or NO-GO" });
    }

    const cand = await supabase
      .from("candidates")
      .select("id, workspace_id, linkedin_url, linkedin_profile, llm_reasoning")
      .eq("id", candidateId)
      .maybeSingle();
    if (!cand.data) return res.status(404).json({ error: "Candidate not found" });

    const p = cand.data.linkedin_profile || {};
    const dedupKey = normalizeDedupKey(p.role, p.company, verdict);

    // 1) Resolve the lead: write the human verdict onto the candidate.
    const status = verdict === "GO" ? "qualified" : "disqualified";
    await supabase
      .from("candidates")
      .update({ status, qualified_by: "user_maybe_triage" })
      .eq("id", candidateId);

    // 2) Dedup-guarded insert into the learning store.
    // Use two separate equality queries (not .or() with string interpolation) so that
    // commas/quotes in role/company values are passed as bound parameters and never
    // parsed as PostgREST filter grammar.
    const byUrl = await supabase
      .from("qualifier_exemplars")
      .select("id")
      .eq("workspace_id", cand.data.workspace_id)
      .eq("linkedin_url", cand.data.linkedin_url)
      .limit(1);
    const byKey = await supabase
      .from("qualifier_exemplars")
      .select("id")
      .eq("workspace_id", cand.data.workspace_id)
      .eq("dedup_key", dedupKey)
      .limit(1);
    const isDup = (byUrl.data ?? []).length > 0 || (byKey.data ?? []).length > 0;

    if (!isDup) {
      await supabase.from("qualifier_exemplars").insert({
        workspace_id: cand.data.workspace_id,
        candidate_id: cand.data.id,
        linkedin_url: cand.data.linkedin_url,
        headline: p.headline ?? null,
        role: p.role ?? null,
        company: p.company ?? null,
        location: p.location ?? null,
        verdict,
        reasoning: cand.data.llm_reasoning ?? null,
        dedup_key: dedupKey,
        source: "maybe-triage",
      });
    }

    return res.status(200).json({ ok: true, deduped: isDup });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
