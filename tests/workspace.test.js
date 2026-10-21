import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, mockRes } from "./helpers/supabase-mock.js";

let mock;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mock.client }));

const handler = (await import("../api/workspace.js")).default;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

function op(q, name) {
  return q.ops.find((o) => o[0] === name);
}

describe("PUT /api/workspace", () => {
  it("saves qualifier feedback", async () => {
    mock = makeSupabaseMock({ workspaces: { data: [{ id: "w1" }], error: null } });
    const res = mockRes();
    await handler({ method: "PUT", body: { field: "qualifier_feedback", value: "be strict" } }, res);
    expect(res.statusCode).toBe(200);
    expect(op(mock.calls[0], "update")[1]).toEqual({ qualifier_feedback: "be strict" });
    expect(op(mock.calls[0], "eq")).toEqual(["eq", "slug", "actuals"]);
  });

  it("rejects feedback over 4000 chars without writing", async () => {
    mock = makeSupabaseMock({});
    const res = mockRes();
    await handler({ method: "PUT", body: { field: "qualifier_feedback", value: "x".repeat(4001) } }, res);
    expect(res.statusCode).toBe(400);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("trims scope steering, caps it at 1500 chars and stores empty as null", async () => {
    mock = makeSupabaseMock({ workspaces: { data: [{ id: "w1" }], error: null } });
    await handler({ method: "PUT", body: { field: "scope_steering", value: `  ${"a".repeat(2000)}  ` } }, mockRes());
    expect(op(mock.calls[0], "update")[1].scope_steering).toHaveLength(1500);

    mock = makeSupabaseMock({ workspaces: { data: [{ id: "w1" }], error: null } });
    await handler({ method: "PUT", body: { field: "scope_steering", value: "   " } }, mockRes());
    expect(op(mock.calls[0], "update")[1]).toEqual({ scope_steering: null });
  });

  it("rejects unknown fields", async () => {
    mock = makeSupabaseMock({});
    const res = mockRes();
    await handler({ method: "PUT", body: { field: "name", value: "x" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("404s when the workspace does not exist", async () => {
    mock = makeSupabaseMock({ workspaces: { data: [], error: null } });
    const res = mockRes();
    await handler({ method: "PUT", body: { field: "qualifier_feedback", value: "x" } }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/workspace", () => {
  it("view=settings returns both text fields, empty string for null", async () => {
    mock = makeSupabaseMock({ workspaces: { data: { qualifier_feedback: "fb", scope_steering: null }, error: null } });
    const res = mockRes();
    await handler({ method: "GET", query: { view: "settings" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ qualifier_feedback: "fb", scope_steering: "" });
  });

  it("view=top-leads returns the workspace's leads, newest first", async () => {
    const leads = [{ id: "l1" }];
    mock = makeSupabaseMock({
      workspaces: { data: { id: "w1" }, error: null },
      home_top_leads: { data: leads, error: null },
    });
    const res = mockRes();
    await handler({ method: "GET", query: { view: "top-leads" } }, res);
    expect(res.body).toEqual({ leads });
    const q = mock.calls.find((c) => c.table === "home_top_leads");
    expect(op(q, "eq")).toEqual(["eq", "workspace_id", "w1"]);
    expect(op(q, "order")).toEqual(["order", "scored_at", { ascending: false }]);
  });

  it("view=audience-insight returns the latest insight or null", async () => {
    mock = makeSupabaseMock({ workflow_runs: { data: [], error: null } });
    const res = mockRes();
    await handler({ method: "GET", query: { view: "audience-insight" } }, res);
    expect(res.body).toEqual({ insight: null });
  });

  it("rejects an unknown view", async () => {
    mock = makeSupabaseMock({});
    const res = mockRes();
    await handler({ method: "GET", query: { view: "candidates" } }, res);
    expect(res.statusCode).toBe(400);
  });
});
