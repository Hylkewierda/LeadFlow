import { createClient } from "@supabase/supabase-js";
import { resolveWorkspaceId, furthestStageLabel } from "../src/lib/crm/companyMatch.js";

// CRM companies route — list (with derived rollup) and get-by-id (rollup + contacts).
// Read-only in v1. Workspace-scoped. Design: crm/leadflow-crm-design.md §7.

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const COMPANY_COLS = "id, name, linkedin_company_url, domain, industry, size_bucket, location, created_at";

// Fetch the derived per-company aggregates from the crm_company_rollup view and
// index them by company_id. Returns a Map.
async function fetchRollups(supabase, companyIds) {
  if (companyIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("crm_company_rollup")
    .select("company_id, contact_count, max_source_score, last_activity_at, furthest_stage_rank")
    .in("company_id", companyIds);
  if (error) throw new Error(error.message);
  const map = new Map();
  for (const r of data ?? []) {
    map.set(r.company_id, {
      contact_count: r.contact_count ?? 0,
      max_source_score: r.max_source_score != null ? Math.round(Number(r.max_source_score)) : null,
      last_activity_at: r.last_activity_at,
      furthest_stage: furthestStageLabel(r.furthest_stage_rank),
    });
  }
  return map;
}

export default async function handler(req, res) {
  const supabase = serverSupabase();

  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
    if (!wsId) return res.status(404).json({ error: "Workspace not found" });

    const id = req.query?.id;

    if (id) {
      const company = await supabase
        .from("crm_companies")
        .select(COMPANY_COLS)
        .eq("workspace_id", wsId)
        .eq("id", id)
        .maybeSingle();
      if (company.error) return res.status(500).json({ error: company.error.message });
      if (!company.data) return res.status(404).json({ error: "Company not found" });

      const contacts = await supabase
        .from("crm_contacts")
        .select("id, full_name, headline, role, stage, owner, source_score, last_activity_at, linkedin_url")
        .eq("workspace_id", wsId)
        .eq("company_id", id)
        .order("last_activity_at", { ascending: true });
      if (contacts.error) return res.status(500).json({ error: contacts.error.message });

      const rollup = (await fetchRollups(supabase, [id])).get(id) ?? {
        contact_count: (contacts.data ?? []).length,
        max_source_score: null,
        last_activity_at: null,
        furthest_stage: "nieuw",
      };

      return res.status(200).json({ company: company.data, rollup, contacts: contacts.data ?? [] });
    }

    // List
    const { data, error } = await supabase
      .from("crm_companies")
      .select(COMPANY_COLS)
      .eq("workspace_id", wsId)
      .order("name", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    const rollups = await fetchRollups(supabase, (data ?? []).map((c) => c.id));
    const companies = (data ?? []).map((c) => ({
      ...c,
      rollup: rollups.get(c.id) ?? {
        contact_count: 0,
        max_source_score: null,
        last_activity_at: null,
        furthest_stage: "nieuw",
      },
    }));
    return res.status(200).json({ companies });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
