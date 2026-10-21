import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, mockRes } from "./helpers/supabase-mock.js";

// The reads/writes that moved off the browser anon key: candidate list +
// status changes (maybe-leads), recent runs + post analyses (runs), one
// lookalike search (lookalike-searches).

let mock;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mock.client }));

const maybeLeads = (await import("../api/maybe-leads.js")).default;
const runs = (await import("../api/runs.js")).default;
const lookalike = (await import("../api/lookalike-searches.js")).default;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

const ops = (q, name) => q.ops.filter((o) => o[0] === name);

describe("GET /api/maybe-leads?view=list", () => {
  it("pages through all candidates of the workspace, filtered by status", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}` }));
    let candidateCalls = 0;
    mock = makeSupabaseMock({
      workspaces: { data: { id: "w1" }, error: null },
      candidates: () => ({ data: candidateCalls++ === 0 ? page1 : [{ id: "last" }], error: null }),
    });
    const res = mockRes();
    await maybeLeads({ method: "GET", query: { view: "list", statuses: "new,rediscovered" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.candidates).toHaveLength(1001);
    const q = mock.calls.filter((c) => c.table === "candidates");
    expect(q).toHaveLength(2);
    expect(ops(q[0], "in")[0]).toEqual(["in", "status", ["new", "rediscovered"]]);
    expect(ops(q[1], "range")[0]).toEqual(["range", 1000, 1999]);
    // Never pull the pgvector column.
    expect(ops(q[0], "select")[0][1]).not.toContain("embedding");
  });

  it("strips PostgREST syntax from the search term", async () => {
    mock = makeSupabaseMock({
      workspaces: { data: { id: "w1" }, error: null },
      candidates: { data: [], error: null },
    });
    await maybeLeads({ method: "GET", query: { view: "list", search: "acme,status.eq.x)" } }, mockRes());
    const q = mock.calls.find((c) => c.table === "candidates");
    const orArg = ops(q, "or")[0][1];
    expect(orArg).toContain("ilike.%acme status.eq.x%");
    expect(orArg.split(",")).toHaveLength(4);
  });
});

describe("PATCH /api/maybe-leads?id=", () => {
  it("qualify clears the disqualify fields", async () => {
    mock = makeSupabaseMock({ candidates: { data: { id: "c1", status: "qualified" }, error: null } });
    const res = mockRes();
    await maybeLeads({ method: "PATCH", query: { id: "c1" }, body: { action: "qualify" } }, res);
    expect(res.statusCode).toBe(200);
    const patch = ops(mock.calls[0], "update")[0][1];
    expect(patch).toMatchObject({ status: "qualified", disqualify_reason: null, qualified_by: "leadflow-user" });
    expect(ops(mock.calls[0], "eq")[0]).toEqual(["eq", "id", "c1"]);
  });

  it("disqualify stores reason and trimmed note", async () => {
    mock = makeSupabaseMock({ candidates: { data: { id: "c1" }, error: null } });
    await maybeLeads({ method: "PATCH", query: { id: "c1" }, body: { action: "disqualify", reason: "geen_icp", note: "  te klein " } }, mockRes());
    expect(ops(mock.calls[0], "update")[0][1]).toMatchObject({ status: "disqualified", disqualify_reason: "geen_icp", disqualify_note: "te klein" });
  });

  it("rejects an unknown action and a missing id", async () => {
    mock = makeSupabaseMock({});
    const r1 = mockRes();
    await maybeLeads({ method: "PATCH", query: { id: "c1" }, body: { action: "delete" } }, r1);
    expect(r1.statusCode).toBe(400);
    const r2 = mockRes();
    await maybeLeads({ method: "PATCH", query: {}, body: { action: "qualify" } }, r2);
    expect(r2.statusCode).toBe(400);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("404s when the candidate does not exist", async () => {
    mock = makeSupabaseMock({ candidates: { data: null, error: null } });
    const res = mockRes();
    await maybeLeads({ method: "PATCH", query: { id: "nope" }, body: { action: "reset" } }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/runs", () => {
  it("view=recent returns the workspace's latest runs with a capped limit", async () => {
    mock = makeSupabaseMock({
      workspaces: { data: { id: "w1" }, error: null },
      runs: { data: [{ id: "r1" }], error: null },
    });
    const res = mockRes();
    await runs({ method: "GET", query: { view: "recent", limit: "500" } }, res);
    expect(res.body).toEqual({ runs: [{ id: "r1" }] });
    const q = mock.calls.find((c) => c.table === "runs");
    expect(ops(q, "limit")[0]).toEqual(["limit", 50]);
  });

  it("view=post-analyses needs a run_id", async () => {
    mock = makeSupabaseMock({ post_analyses: { data: [{ id: "p1" }], error: null } });
    const bad = mockRes();
    await runs({ method: "GET", query: { view: "post-analyses" } }, bad);
    expect(bad.statusCode).toBe(400);
    const ok = mockRes();
    await runs({ method: "GET", query: { view: "post-analyses", run_id: "r1" } }, ok);
    expect(ok.body).toEqual({ analyses: [{ id: "p1" }] });
  });
});

describe("GET /api/lookalike-searches?search_id=", () => {
  it("returns the search row, or null when unknown", async () => {
    mock = makeSupabaseMock({ lookalike_searches: { data: { id: "s1", status: "searching" }, error: null } });
    const res = mockRes();
    await lookalike({ method: "GET", query: { search_id: "s1" } }, res);
    expect(res.body).toEqual({ search: { id: "s1", status: "searching" } });

    mock = makeSupabaseMock({ lookalike_searches: { data: null, error: null } });
    const none = mockRes();
    await lookalike({ method: "GET", query: { search_id: "x" } }, none);
    expect(none.body).toEqual({ search: null });
  });
});
