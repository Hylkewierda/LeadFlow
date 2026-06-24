import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  candidate: null,
  contactForStage: null, // { id, role, crm_companies: { name } }
  crmCompaniesByName: [],
  contactInsertError: null,
  rpcError: null,
};
const calls = { companyInserts: [], contactInserts: [], rpc: [] };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "candidates") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.candidate, error: null }) }) }) };
      }
      if (table === "crm_companies") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.crmCompaniesByName, error: null }) }) }) }),
          insert: (row) => { calls.companyInserts.push(row); return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "co-1" }, error: null }) }) }; },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "crm_contacts") {
        return {
          // create: insert().select().maybeSingle()
          insert: (row) => { calls.contactInserts.push(row); return { select: () => ({ maybeSingle: () => Promise.resolve(state.contactInsertError ? { data: null, error: state.contactInsertError } : { data: { id: "ct-1", ...row }, error: null }) }) }; },
          // stage PATCH fetches: select().eq(workspace).eq(id).maybeSingle()
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.contactForStage, error: null }) }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name, params) => { calls.rpc.push({ name, params }); return Promise.resolve({ data: { id: params.p_contact_id, stage: params.p_stage }, error: state.rpcError }); },
  }),
}));

function makeReqRes(method, { body, query } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, body: body ?? {}, query: query ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.candidate = null;
  state.contactForStage = null;
  state.crmCompaniesByName = [];
  state.contactInsertError = null;
  state.rpcError = null;
  calls.companyInserts.length = 0;
  calls.contactInserts.length = 0;
  calls.rpc.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/crm-contacts.js")).default;
});

describe("POST /api/crm-contacts (create from candidate)", () => {
  it("snapshots the candidate, upserts the company, and inserts the contact", async () => {
    state.candidate = { id: "c1", workspace_id: "ws-1", linkedin_url: "u1", llm_score: 72,
      linkedin_profile: { name: "Ann", headline: "CFO bij ShopCo", role: "CFO", company: "ShopCo B.V.", location: "NL" } };
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { source: "candidate", candidateId: "c1" } });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(calls.companyInserts[0]).toMatchObject({ name: "ShopCo B.V.", name_normalized: "shopco" });
    expect(calls.contactInserts[0]).toMatchObject({ source: "candidate", linkedin_url: "u1", full_name: "Ann", role: "CFO", source_score: 72, company_id: "co-1" });
    expect(calls.contactInserts[0].stage).toBeUndefined(); // relies on the DB default 'nieuw'
    expect(res.body.created).toBe(true);
  });

  it("rejects an unknown source", async () => {
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { source: "bogus" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/crm-contacts?action=stage", () => {
  it("gewonnen calls crm_set_stage with a GO exemplar payload", async () => {
    state.contactForStage = { id: "ct-1", role: "CFO", crm_companies: { name: "ShopCo" } };
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "stage" }, body: { stage: "gewonnen", note: "getekend" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.rpc[0].name).toBe("crm_set_stage");
    expect(calls.rpc[0].params).toMatchObject({ p_stage: "gewonnen", p_dedup_key: "cfo|shopco|GO", p_exemplar_company: "ShopCo" });
  });

  it("verloren without a disqualify_reason is rejected", async () => {
    state.contactForStage = { id: "ct-1", role: "CFO", crm_companies: { name: "ShopCo" } };
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "stage" }, body: { stage: "verloren" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(calls.rpc).toHaveLength(0);
  });

  it("verloren with a reason builds a NO-GO payload", async () => {
    state.contactForStage = { id: "ct-1", role: "CFO", crm_companies: { name: "ShopCo" } };
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "stage" }, body: { stage: "verloren", disqualify_reason: "too_small", note: "te klein" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.rpc[0].params).toMatchObject({ p_stage: "verloren", p_disqualify_reason: "too_small", p_dedup_key: "cfo|shopco|NO-GO", p_exemplar_reasoning: "too_small — te klein" });
  });

  it("a non-outcome stage passes null feedback params", async () => {
    state.contactForStage = { id: "ct-1", role: "CFO", crm_companies: { name: "ShopCo" } };
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "stage" }, body: { stage: "gesprek" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.rpc[0].params).toMatchObject({ p_stage: "gesprek", p_dedup_key: null, p_exemplar_company: null });
  });
});
