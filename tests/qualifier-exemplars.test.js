import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  exemplars: [], // active list returned by GET
  rawRows: [], // non-pinned raw rows returned to the compress reader
  fetchOk: true,
  fetchPatterns: [{ verdict: "GO", pattern: "Controller bij e-commerce = GO" }],
};
const calls = { updates: [], deletes: [], inserted: null, archiveIn: null, archivePatch: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "qualifier_exemplars") {
        const b = {
          _eqs: {},
          select() { return b; },
          eq(col, val) { b._eqs[col] = val; return b; },
          is() { return b; },
          order() { return b; },
          insert(rows) { calls.inserted = rows; return Promise.resolve({ error: null }); },
          update(patch) {
            return {
              eq: (_c, id) => { calls.updates.push({ patch, id }); return Promise.resolve({ error: null }); },
              in: (_c, ids) => { calls.archivePatch = patch; calls.archiveIn = ids; return Promise.resolve({ error: null }); },
            };
          },
          delete() { return { eq: (_c, id) => { calls.deletes.push(id); return Promise.resolve({ error: null }); } }; },
          // Terminal await on a select chain: compress reader filters source=maybe-triage.
          then(resolve) {
            const data = b._eqs.source === "maybe-triage" ? state.rawRows : state.exemplars;
            resolve({ data, error: null });
          },
        };
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const fetchMock = vi.fn(async () => ({
  ok: state.fetchOk,
  json: async () => ({ content: [{ type: "text", text: JSON.stringify({ patterns: state.fetchPatterns }) }] }),
  text: async () => "anthropic error body",
}));
vi.stubGlobal("fetch", fetchMock);

function makeReqRes(method, { query, body } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, body: body ?? { pinned: true }, query: query ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.exemplars = [{ id: "e1", verdict: "GO", company: "ShopCo", pinned: false }];
  state.rawRows = [];
  state.fetchOk = true;
  state.fetchPatterns = [{ verdict: "GO", pattern: "Controller bij e-commerce = GO" }];
  calls.updates.length = 0;
  calls.deletes.length = 0;
  calls.inserted = null;
  calls.archiveIn = null;
  calls.archivePatch = null;
  fetchMock.mockClear();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.ANTHROPIC_API_KEY = "sk-test";
  handler = (await import("../api/qualifier-exemplars.js")).default;
});

describe("api/qualifier-exemplars", () => {
  it("GET returns the active list and a count", async () => {
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.exemplars[0].id).toBe("e1");
  });

  it("PATCH toggles pinned", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { id: "e1" } });
    await handler(req, res);
    expect(calls.updates[0]).toEqual({ patch: { pinned: true }, id: "e1" });
  });

  it("DELETE removes a row", async () => {
    const [req, res] = makeReqRes("DELETE", { query: { id: "e1" } });
    await handler(req, res);
    expect(calls.deletes).toContain("e1");
  });
});

describe("api/qualifier-exemplars compress", () => {
  const fourRaw = [
    { id: "r1", verdict: "GO", headline: "Controller", role: "Controller", company: "A", reasoning: "x" },
    { id: "r2", verdict: "GO", headline: "Finance Mgr", role: "Finance Manager", company: "B", reasoning: "y" },
    { id: "r3", verdict: "NO-GO", headline: "Recruiter", role: "Recruiter", company: "C", reasoning: "z" },
    { id: "r4", verdict: "NO-GO", headline: "Founder", role: "Founder", company: "D", reasoning: "w" },
  ];

  it("skips when there are fewer than the minimum raw rows (no LLM call)", async () => {
    state.rawRows = [fourRaw[0], fourRaw[1]]; // 2 < 4
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", action: "compress" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.compressed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distils patterns, inserts compressed rows, and archives the raw rows", async () => {
    state.rawRows = fourRaw;
    state.fetchPatterns = [
      { verdict: "GO", pattern: "Finance-rollen bij e-commerce = GO" },
      { verdict: "NO-GO", pattern: "Recruiters/founders = NO-GO" },
    ];
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", action: "compress" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, compressed: 2, archived: 4 });
    // compressed rows inserted with source 'compressed' and the pattern as headline
    expect(calls.inserted).toHaveLength(2);
    expect(calls.inserted[0]).toMatchObject({ source: "compressed", verdict: "GO", headline: "Finance-rollen bij e-commerce = GO" });
    // the four raw rows archived
    expect(calls.archivePatch.archived_at).toBeTruthy();
    expect(calls.archiveIn).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    state.rawRows = fourRaw;
    delete process.env.ANTHROPIC_API_KEY;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", action: "compress" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(calls.inserted).toBeNull(); // nothing inserted/archived on failure
    expect(calls.archiveIn).toBeNull();
  });

  it("returns 500 when the Anthropic call fails", async () => {
    state.rawRows = fourRaw;
    state.fetchOk = false;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", action: "compress" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(calls.inserted).toBeNull();
  });
});
