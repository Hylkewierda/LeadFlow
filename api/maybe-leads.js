import { createClient } from "@supabase/supabase-js";
import { normalizeDedupKey } from "../src/lib/dedupKey.js";
import { upsertCompany } from "../src/lib/crm/companyMatch.js";
import { withAuth } from "./_lib/auth.js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MAYBE_MIN = 40;
const MAYBE_MAX = 55; // exclusive upper bound: [40, 55) === MAYBE 40-54 (GO >= 55)

// Candidate list for the Leadfinder page (was a browser anon-key read). Two
// limits shape it: Vercel caps a function response at 4.5 MB, and the full
// `linkedin_profile` (experience, education, ... ) is ~5 KB per candidate (16 MB
// for 3k rows). So: only the five profile fields the list shows, pulled out
// with PostgREST JSON paths, and pages of 500 the client walks through.
// `embedding`/`embedded_at` stay out (1536-dim pgvector).
const PROFILE_FIELDS = ["name", "role", "headline", "company", "location"];
const CANDIDATE_LIST_COLUMNS = [
  "id,linkedin_url,signal_type,signal_context,signal_history,pre_score,status,first_run_id,last_run_id,created_at,updated_at,workspace_id,disqualify_reason,disqualify_note,qualified_by,hubspot_contact_id,pushed_to_hubspot_at,pushed_by,exported_to_sheet_at,llm_score,llm_reasoning,llm_qualified_at,lookalike_search_id,lookalike_sim",
  ...PROFILE_FIELDS.map((f) => `p_${f}:linkedin_profile->>${f}`),
].join(",");
export const LIST_PAGE_SIZE = 500;

// Fold the p_* columns back into the linkedin_profile shape the UI expects.
function withSlimProfile(row) {
  const out = {};
  const profile = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("p_")) profile[k.slice(2)] = v ?? null;
    else out[k] = v;
  }
  out.linkedin_profile = profile;
  return out;
}

async function listCandidatePage(supabase, workspaceId, { statuses, search, page }) {
  let query = supabase.from("candidates").select(CANDIDATE_LIST_COLUMNS).eq("workspace_id", workspaceId);
  if (statuses.length > 0) query = query.in("status", statuses);
  if (search) {
    // Strip PostgREST filter syntax characters so a search term cannot add clauses.
    const needle = `%${search.replace(/[,()*%]/g, " ").trim()}%`;
    query = query.or(
      `linkedin_profile->>name.ilike.${needle},linkedin_profile->>role.ilike.${needle},linkedin_profile->>headline.ilike.${needle},linkedin_profile->>company.ilike.${needle}`,
    );
  }
  const from = page * LIST_PAGE_SIZE;
  const { data, error } = await query
    .order("pre_score", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + LIST_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map(withSlimProfile);
  return { candidates: rows, hasMore: rows.length === LIST_PAGE_SIZE };
}

// PATCH ?id=<candidateId> { action: qualify | disqualify | reset, reason?, note? }
const STATUS_PATCHES = {
  qualify: () => ({ status: "qualified", disqualify_reason: null, disqualify_note: null, qualified_by: "leadflow-user" }),
  disqualify: (b) => ({
    status: "disqualified",
    disqualify_reason: b.reason ?? null,
    disqualify_note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
    qualified_by: "leadflow-user",
  }),
  reset: () => ({ status: "new", disqualify_reason: null, disqualify_note: null, qualified_by: null }),
};

async function handler(req, res) {
  const supabase = serverSupabase();

  if (req.method === "GET" && req.query?.view === "list") {
    const slug = (req.query?.workspace || "actuals").trim();
    const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (ws.error) return res.status(500).json({ error: ws.error.message });
    if (!ws.data) return res.status(404).json({ error: `Workspace "${slug}" not found` });
    const statuses = (req.query?.statuses || "").split(",").map((s) => s.trim()).filter(Boolean);
    const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(parseInt(req.query?.page, 10) || 0, 0);
    try {
      return res.status(200).json(await listCandidatePage(supabase, ws.data.id, { statuses, search, page }));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "PATCH") {
    const id = req.query?.id;
    const body = req.body || {};
    const build = STATUS_PATCHES[body.action];
    if (!id) return res.status(400).json({ error: "Missing id" });
    if (!build) return res.status(400).json({ error: "action must be qualify, disqualify or reset" });
    const { data, error } = await supabase
      .from("candidates")
      .update({ ...build(body), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(CANDIDATE_LIST_COLUMNS)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Candidate not found" });
    // Same shape as a list row, so the page can swap it in place.
    return res.status(200).json({ candidate: withSlimProfile(data) });
  }

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
      .select("id, workspace_id, linkedin_url, linkedin_profile, llm_reasoning, llm_score")
      .eq("id", candidateId)
      .maybeSingle();
    if (cand.error) return res.status(500).json({ error: cand.error.message });
    if (!cand.data) return res.status(404).json({ error: "Candidate not found" });

    const p = cand.data.linkedin_profile || {};
    const dedupKey = normalizeDedupKey(p.role, p.company, verdict);

    // The two writes below are not transactional (Supabase REST has no client-side
    // transaction). We order them insert-first so the durable learning signal is
    // committed before the lead is marked triaged: if the insert fails we return 500
    // WITHOUT touching candidates.status, so the lead stays in the triage list and the
    // verdict can be retried (the retry dedups the insert). Every write error surfaces
    // as a 500 — a verdict is never silently lost.

    // 1) Dedup check. Two separate equality queries (not .or() with string
    // interpolation) so commas/quotes in role/company are bound parameters, never
    // parsed as PostgREST filter grammar.
    const byUrl = await supabase
      .from("qualifier_exemplars")
      .select("id")
      .eq("workspace_id", cand.data.workspace_id)
      .eq("linkedin_url", cand.data.linkedin_url)
      .limit(1);
    if (byUrl.error) return res.status(500).json({ error: byUrl.error.message });
    const byKey = await supabase
      .from("qualifier_exemplars")
      .select("id")
      .eq("workspace_id", cand.data.workspace_id)
      .eq("dedup_key", dedupKey)
      .limit(1);
    if (byKey.error) return res.status(500).json({ error: byKey.error.message });
    const isDup = (byUrl.data ?? []).length > 0 || (byKey.data ?? []).length > 0;

    // 2) Insert the learning signal FIRST (durable before we resolve the lead).
    if (!isDup) {
      const ins = await supabase.from("qualifier_exemplars").insert({
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
      if (ins.error) return res.status(500).json({ error: ins.error.message });
    }

    // 3) Resolve the lead: write the human verdict onto the candidate.
    const status = verdict === "GO" ? "qualified" : "disqualified";
    const upd = await supabase
      .from("candidates")
      .update({ status, qualified_by: "user_maybe_triage" })
      .eq("id", candidateId);
    if (upd.error) return res.status(500).json({ error: upd.error.message });

    // 4) On GO, also create the CRM follow-up contact (instroom #1, design §4).
    // Idempotent on (workspace_id, linkedin_url); a failure here must NOT lose the
    // verdict (already durable above), so we report it without rolling back.
    let crmContactCreated = false;
    if (verdict === "GO") {
      try {
        const companyId = await upsertCompany(supabase, cand.data.workspace_id, { name: p.company ?? null });
        const ins = await supabase.from("crm_contacts").insert({
          workspace_id: cand.data.workspace_id,
          candidate_id: cand.data.id,
          company_id: companyId,
          linkedin_url: cand.data.linkedin_url,
          full_name: p.name ?? "Onbekend",
          headline: p.headline ?? null,
          role: p.role ?? null,
          location: p.location ?? null,
          source: "candidate",
          source_score: cand.data.llm_score ?? null,
        });
        // 23505 = already a CRM contact for this person; that's fine (idempotent).
        if (!ins.error) crmContactCreated = true;
        else if (ins.error.code !== "23505") {
          return res.status(500).json({ error: ins.error.message });
        }
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(200).json({ ok: true, deduped: isDup, crmContactCreated });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export default withAuth(handler);
