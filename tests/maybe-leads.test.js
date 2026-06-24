import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeDedupKey } from "../src/lib/dedupKey.js";

describe("normalizeDedupKey", () => {
  it("lowercases and joins role|company|verdict", () => {
    expect(normalizeDedupKey("Controller", "ShopCo", "GO")).toBe("controller|shopco|GO");
  });
  it("tolerates nulls", () => {
    expect(normalizeDedupKey(null, null, "NO-GO")).toBe("||NO-GO");
  });
});

const state = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  candidates: [],
  existingExemplars: [],
  candidateById: null,
  // Injectable write/read errors (default null = success).
  candidateError: null,
  dedupError: null,
  insertError: null,
  updateError: null,
  crmCompanies: [],
  crmContactError: null,
};
const inserted = { exemplars: [], candidateUpdates: [], crmContacts: [] };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "candidates") {
        return {
          // GET list: select().eq(workspace).gte(score).lt(score).in(status)
          select: () => ({
            eq: () => ({
              gte: () => ({
                lt: () => ({
                  in: () => Promise.resolve({ data: state.candidates, error: null }),
                }),
              }),
              maybeSingle: () => Promise.resolve({ data: state.candidateById, error: state.candidateError }),
            }),
          }),
          update: (patch) => ({ eq: (_c, id) => { inserted.candidateUpdates.push({ patch, id }); return Promise.resolve({ error: state.updateError }); } }),
        };
      }
      if (table === "qualifier_exemplars") {
        // Supports the new dedup chain: select().eq(workspace_id).eq(field).limit(1)
        // Both byUrl and byKey queries use the same shape; return existingExemplars for both.
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: state.existingExemplars, error: state.dedupError }),
              }),
            }),
          }),
          insert: (row) => { inserted.exemplars.push(row); return Promise.resolve({ error: state.insertError }); },
        };
      }
      if (table === "crm_companies") {
        // upsertCompany: match by url/name (select().eq().eq().limit()), else insert().select().maybeSingle().
        return {
          select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.crmCompanies, error: null }) }) }) }),
          insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "co-1" }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "crm_contacts") {
        return { insert: (row) => { inserted.crmContacts.push(row); return Promise.resolve({ error: state.crmContactError }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function makeReqRes(method, { body, query } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, body: body ?? {}, query: query ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.workspaces = [{ id: "ws-1", slug: "actuals" }];
  state.candidates = [];
  state.existingExemplars = [];
  state.candidateById = null;
  state.candidateError = null;
  state.dedupError = null;
  state.insertError = null;
  state.updateError = null;
  state.crmCompanies = [];
  state.crmContactError = null;
  inserted.exemplars.length = 0;
  inserted.candidateUpdates.length = 0;
  inserted.crmContacts.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/maybe-leads.js")).default;
});

describe("GET /api/maybe-leads", () => {
  it("returns MAYBE-band candidates flattened from linkedin_profile", async () => {
    state.candidates = [
      { id: "c1", linkedin_url: "u1", llm_score: 50, llm_reasoning: "twijfel", status: "new",
        linkedin_profile: { name: "Ann", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" } },
    ];
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.candidates[0]).toMatchObject({ id: "c1", headline: "Controller", company: "ShopCo", llm_score: 50 });
  });
});

describe("POST /api/maybe-leads", () => {
  it("rejects an invalid verdict", async () => {
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c1", verdict: "MAYBE" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("updates the candidate and inserts an exemplar on GO", async () => {
    state.candidateById = { id: "c1", workspace_id: "ws-1", linkedin_url: "u1",
      linkedin_profile: { name: "Ann", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" }, llm_reasoning: "twijfel" };
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c1", verdict: "GO" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(inserted.candidateUpdates[0].patch.status).toBe("qualified");
    expect(inserted.candidateUpdates[0].patch.qualified_by).toBe("user_maybe_triage");
    expect(inserted.exemplars[0]).toMatchObject({ verdict: "GO", company: "ShopCo", dedup_key: "controller|shopco|GO" });
    expect(res.body.deduped).toBe(false);
    // GO also creates the CRM follow-up contact (instroom #1, design §4).
    expect(inserted.crmContacts).toHaveLength(1);
    expect(inserted.crmContacts[0]).toMatchObject({ source: "candidate", linkedin_url: "u1", full_name: "Ann", company_id: "co-1" });
    expect(res.body.crmContactCreated).toBe(true);
  });

  it("does NOT create a CRM contact on NO-GO", async () => {
    state.candidateById = { id: "c1", workspace_id: "ws-1", linkedin_url: "u1",
      linkedin_profile: { name: "Ann", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" }, llm_reasoning: "twijfel" };
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c1", verdict: "NO-GO" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(inserted.crmContacts).toHaveLength(0);
  });

  it("skips the exemplar insert when a duplicate already exists", async () => {
    state.candidateById = { id: "c1", workspace_id: "ws-1", linkedin_url: "u1",
      linkedin_profile: { name: "Ann", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" }, llm_reasoning: "x" };
    state.existingExemplars = [{ id: "e1" }];
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c1", verdict: "GO" } });
    await handler(req, res);
    expect(res.body.deduped).toBe(true);
    expect(inserted.exemplars).toHaveLength(0);
    expect(inserted.candidateUpdates[0].patch.status).toBe("qualified");
  });

  it("regression: inserts exactly one exemplar when company contains a comma", async () => {
    // This is the bug scenario: company "Smith, Jones & Partners" previously caused the
    // PostgREST .or() filter to split at the comma → malformed query → silent dedup miss.
    // With two separate .eq() queries the comma is a bound value, not filter grammar.
    state.candidateById = {
      id: "c2", workspace_id: "ws-1", linkedin_url: "u2",
      linkedin_profile: { name: "Bob", headline: "VP Engineering", role: "VP, Engineering", company: "Smith, Jones & Partners", location: "UK" },
      llm_reasoning: "strong fit",
    };
    state.existingExemplars = []; // no pre-existing exemplar
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c2", verdict: "GO" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.deduped).toBe(false);
    expect(inserted.exemplars).toHaveLength(1);
    // The dedup_key must contain the comma — proving it was stored as data, not truncated.
    expect(inserted.exemplars[0].dedup_key).toContain(",");
    expect(inserted.exemplars[0].company).toBe("Smith, Jones & Partners");
  });

  it("returns 500 and does NOT mark the candidate when the exemplar insert fails", async () => {
    // Insert-first ordering: a failed learning-signal insert must abort before the
    // candidate is marked triaged, so the verdict is not silently lost and can be retried.
    state.candidateById = { id: "c3", workspace_id: "ws-1", linkedin_url: "u3",
      linkedin_profile: { name: "Cara", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" }, llm_reasoning: "x" };
    state.existingExemplars = [];
    state.insertError = { message: "insert boom" };
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c3", verdict: "GO" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(inserted.candidateUpdates).toHaveLength(0); // status update never ran
  });

  it("returns 500 when the candidate status update fails", async () => {
    state.candidateById = { id: "c4", workspace_id: "ws-1", linkedin_url: "u4",
      linkedin_profile: { name: "Dee", headline: "Controller", role: "Controller", company: "ShopCo", location: "NL" }, llm_reasoning: "x" };
    state.existingExemplars = [];
    state.updateError = { message: "update boom" };
    const [req, res] = makeReqRes("POST", { body: { candidateId: "c4", verdict: "GO" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(inserted.exemplars).toHaveLength(1); // insert ran first (durable), then update failed
  });
});
