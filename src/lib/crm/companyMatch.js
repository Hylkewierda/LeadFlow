// Shared CRM server helpers. Pure logic + a supabase client passed in by the
// caller — no secrets baked in, safe to live under src/lib. Used by the CRM
// server routes (api/crm-contacts.js, api/crm-companies.js) and the MAYBE-triage
// GO hook (api/maybe-leads.js). Design: crm/leadflow-crm-design.md §3 / §7.

/**
 * Normalize a company name for fallback dedup (design §3): lowercase, trim,
 * strip the b.v./bv and "nederland" tokens, collapse whitespace. This is the
 * effective dedup key in v1 because candidates.linkedin_profile carries no
 * company URL (finding B).
 */
export function normalizeCompanyName(name) {
  if (!name) return "";
  let n = String(name).trim().toLowerCase();
  n = n.replace(/\bb\.?v\.?\b/g, " ").replace(/\bnederland\b/g, " ");
  n = n.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return n;
}

/** Resolve a workspace slug to its id, or null if not found. */
export async function resolveWorkspaceId(supabase, slug) {
  const ws = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", (slug || "actuals").trim())
    .maybeSingle();
  if (ws.error) throw new Error(ws.error.message);
  return ws.data?.id ?? null;
}

/**
 * Upsert a crm_companies row for a workspace. Match strategy (design §3):
 * first on linkedin_company_url when present, else on name_normalized.
 * Returns the company id, or null when no usable name is supplied (we never
 * create a nameless company — `name` is NOT NULL).
 */
export async function upsertCompany(supabase, workspaceId, company = {}) {
  const name = (company.name ?? "").trim();
  if (!name) return null;
  const url = company.linkedinCompanyUrl ?? company.linkedin_company_url ?? null;
  const nameNorm = normalizeCompanyName(name);

  // 1) Match on the linkedin company url (primary key) when we have one.
  if (url) {
    const byUrl = await supabase
      .from("crm_companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_company_url", url)
      .limit(1);
    if (byUrl.error) throw new Error(byUrl.error.message);
    if ((byUrl.data ?? []).length > 0) return byUrl.data[0].id;
  }

  // 2) Fallback match on normalized name.
  const byName = await supabase
    .from("crm_companies")
    .select("id, linkedin_company_url")
    .eq("workspace_id", workspaceId)
    .eq("name_normalized", nameNorm)
    .limit(1);
  if (byName.error) throw new Error(byName.error.message);
  if ((byName.data ?? []).length > 0) {
    const existing = byName.data[0];
    // Backfill the url if we just learned one and the row had none.
    if (url && !existing.linkedin_company_url) {
      await supabase.from("crm_companies").update({ linkedin_company_url: url }).eq("id", existing.id);
    }
    return existing.id;
  }

  // 3) No match — insert. On a unique-violation race, re-select by name.
  const ins = await supabase
    .from("crm_companies")
    .insert({
      workspace_id: workspaceId,
      linkedin_company_url: url,
      name,
      name_normalized: nameNorm,
      domain: company.domain ?? null,
      industry: company.industry ?? null,
      size_bucket: company.sizeBucket ?? company.size_bucket ?? null,
      location: company.location ?? null,
    })
    .select("id")
    .maybeSingle();
  if (!ins.error && ins.data) return ins.data.id;

  const reselect = await supabase
    .from("crm_companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name_normalized", nameNorm)
    .limit(1);
  if (reselect.error) throw new Error(ins.error?.message || reselect.error.message);
  if ((reselect.data ?? []).length > 0) return reselect.data[0].id;
  throw new Error(ins.error?.message || "upsertCompany: insert failed");
}

const STAGE_RANK_TO_LABEL = {
  0: "verloren",
  1: "nieuw",
  2: "benaderd",
  3: "gesprek",
  4: "voorstel",
  5: "gewonnen",
};

/** Map crm_company_rollup.furthest_stage_rank back to a stage label. */
export function furthestStageLabel(rank) {
  return STAGE_RANK_TO_LABEL[rank] ?? "nieuw";
}
