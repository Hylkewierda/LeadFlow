import { createClient } from "@supabase/supabase-js";
import { resolveWorkspaceId, furthestStageLabel, upsertCompany } from "../src/lib/crm/companyMatch.js";
import { buildWarmAccounts, buildWarmAccountDetail } from "../src/lib/crm/warmAccounts.js";

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
    const action = req.query?.action;

    if (req.method === "POST") {
      if (action !== "create") return res.status(405).json({ error: "Method not allowed" });
      const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
      if (!wsId) return res.status(404).json({ error: "Workspace not found" });
      const name = (req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      const companyId = await upsertCompany(supabase, wsId, { name });
      return res.status(201).json({ companyId });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
    if (!wsId) return res.status(404).json({ error: "Workspace not found" });

    if (action === "warm") {
      const [cands, htl, companies] = await Promise.all([
        supabase
          .from("candidates")
          .select("linkedin_url, linkedin_profile, signal_type, signal_context, signal_history, llm_score, status, created_at")
          .eq("workspace_id", wsId)
          .not("linkedin_profile->>company", "is", null),
        supabase
          .from("home_top_leads")
          .select("linkedin_url, profile, signal_context, icp_score, scored_at")
          .eq("workspace_id", wsId),
        supabase.from("crm_companies").select("id, name, name_normalized").eq("workspace_id", wsId),
      ]);
      for (const r of [cands, htl, companies]) {
        if (r.error) return res.status(500).json({ error: r.error.message });
      }
      const input = {
        candidates: cands.data ?? [],
        homeTopLeads: htl.data ?? [],
        crmCompanies: companies.data ?? [],
        now: new Date(),
      };
      const key = req.query?.key;
      if (key) {
        const account = buildWarmAccountDetail({ ...input, key });
        if (!account) return res.status(404).json({ error: "Account not found" });
        return res.status(200).json({ account });
      }
      return res.status(200).json({ accounts: buildWarmAccounts(input).slice(0, 15) });
    }

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
