import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = {
  todayCount: 0,
  running: [],
  inserted: { id: "wf-new" },
  dispatchOk: true,
};
const insertCalls = [];
const fetchCalls = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== "workflow_runs") throw new Error(`unexpected table ${table}`);
      return {
        select: (_cols, opts) => ({
          eq: (_c, _v) => ({
            eq: () => Promise.resolve({ data: mockState.running, error: null, count: mockState.running.length }),
            gte: () =>
              Promise.resolve({ data: null, error: null, count: mockState.todayCount }),
          }),
        }),
        insert: (payload) => {
          insertCalls.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: mockState.inserted, error: null }),
            }),
          };
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  }),
}));

const fetchMock = vi.fn(async (url, opts) => {
  fetchCalls.push({ url, opts });
  return { ok: mockState.dispatchOk, text: async () => "" };
});
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  mockState.todayCount = 0;
  mockState.running = [];
  mockState.inserted = { id: "wf-new" };
  mockState.dispatchOk = true;
  insertCalls.length = 0;
  fetchCalls.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.GITHUB_PAT = "ghp_test";
});

function makeReqRes(method, body, query = {}) {
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
    end() { return this; },
  };
  return [{ method, body, query }, res];
}

let handler;
beforeEach(async () => {
  handler = (await import("../api/workflows.js")).default;
});

describe("POST /api/workflows", () => {
  it("405 for non-POST/GET", async () => {
    const [req, res] = makeReqRes("PUT", {});
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("400 for unknown mode", async () => {
    const [req, res] = makeReqRes("POST", { mode: "nope" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("409 if a run for that mode is already running", async () => {
    mockState.running = [{ id: "x" }];
    const [req, res] = makeReqRes("POST", { mode: "stub" });
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("429 when the daily limit is reached", async () => {
    mockState.todayCount = 5;
    const [req, res] = makeReqRes("POST", { mode: "stub" });
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("inserts a run and dispatches the GitHub workflow on happy path", async () => {
    const [req, res] = makeReqRes("POST", { mode: "stub" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.runId).toBe("wf-new");
    expect(insertCalls[0].mode).toBe("stub");
    expect(insertCalls[0].triggered_by).toBe("cloud-ui");
    expect(fetchCalls[0].url).toMatch(/run-workflow\.yml\/dispatches$/);
    const body = JSON.parse(fetchCalls[0].opts.body);
    expect(body.inputs.mode).toBe("stub");
    expect(body.inputs.run_id).toBe("wf-new");
  });

  it("returns 500 and does NOT insert a row when GITHUB_PAT is missing", async () => {
    delete process.env.GITHUB_PAT;
    const [req, res] = makeReqRes("POST", { mode: "stub" });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    // No orphaned status='running' row may be created when the PAT is absent.
    expect(insertCalls).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });
});
