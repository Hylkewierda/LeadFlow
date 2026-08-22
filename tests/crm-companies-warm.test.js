import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query-mock: elke select/eq/in/not/order geeft zichzelf terug; await
// resolvet naar {data, error} uit state. Volgt het patroon van crm-contacts.test.js.
const state = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  candidates: [],
  homeTopLeads: [],
  crmCompanies: [],
  companyInsertResult: { id: "co-new" },
};
const calls = { companyInserts: [] };

function tableResult(table) {
  if (table === "candidates") return state.candidates;
  if (table === "home_top_leads") return state.homeTopLeads;
  if (table === "crm_companies") return state.crmCompanies;
  return [];
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: tableResult(table), error: null }),
        maybeSingle: () => Promise.resolve({ data: tableResult(table)[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: tableResult(table), error: null }),
        insert: (row) => {
          calls.companyInserts.push(row);
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: state.companyInsertResult, error: null }) }) };
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
      return chain;
    },
  }),
}));

function makeReqRes(method, query = {}, body = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, query, body }, res];
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const cand = (over = {}) => ({
  linkedin_url: "u1",
  linkedin_profile: { name: "Ann", role: "CFO", company: "ShopCo" },
  signal_type: "content", signal_context: {},
  signal_history: [{ run_id: "r1", signal_type: "content", at: daysAgo(2) }],
  llm_score: 80, status: "new", created_at: daysAgo(2), ...over,
});

let handler;
beforeEach(async () => {
  state.candidates = []; state.homeTopLeads = []; state.crmCompanies = [];
  calls.companyInserts.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/crm-companies.js")).default;
});

describe("GET ?action=warm", () => {
  it("geeft accounts terug, gesorteerd, met in_crm-join", async () => {
    state.candidates = [cand(), cand({ linkedin_url: "u2", linkedin_profile: { name: "Bob", role: "Controller", company: "ShopCo" } })];
    state.crmCompanies = [{ id: "co-1", name_normalized: "shopco", name: "ShopCo" }];
    const [req, res] = makeReqRes("GET", { workspace: "actuals", action: "warm" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0]).toMatchObject({ key: "shopco", in_crm: true, company_id: "co-1", person_count: 2 });
  });

  it("detail-modus: geeft people + timeline voor een key", async () => {
    state.candidates = [cand()];
    const [req, res] = makeReqRes("GET", { workspace: "actuals", action: "warm", key: "shopco" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.account.people).toHaveLength(1);
    expect(res.body.account.timeline).toHaveLength(1);
  });

  it("detail-modus: geeft account:null voor onbekende key", async () => {
    state.candidates = [cand()];
    const [req2, res2] = makeReqRes("GET", { workspace: "actuals", action: "warm", key: "nope" });
    await handler(req2, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.account).toBeNull();
  });

  it("onbekende workspace → 404", async () => {
    const [req, res] = makeReqRes("GET", { workspace: "bestaatniet", action: "warm" });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("POST ?action=create", () => {
  it("maakt een crm_companies-rij via upsertCompany en geeft 201 + companyId", async () => {
    const [req, res] = makeReqRes("POST", { workspace: "actuals", action: "create" }, { name: "ShopCo B.V." });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.companyId).toBe("co-new");
    expect(calls.companyInserts[0]).toMatchObject({ name: "ShopCo B.V.", name_normalized: "shopco" });
  });

  it("lege naam → 400; POST zonder action → 405", async () => {
    const [req, res] = makeReqRes("POST", { workspace: "actuals", action: "create" }, { name: "  " });
    await handler(req, res);
    expect(res.statusCode).toBe(400);

    const [req2, res2] = makeReqRes("POST", { workspace: "actuals" }, {});
    await handler(req2, res2);
    expect(res2.statusCode).toBe(405);
  });
});
