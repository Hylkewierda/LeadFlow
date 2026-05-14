import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  running: [],
  inserted: { id: "run-new" },
  insertError: null,
  dispatchOk: true,
  dispatchError: "",
};

const updateCalls = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return {
          select: () => ({
            eq: (_c, slug) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: mockState.workspaces.find((w) => w.slug === slug) ?? null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: mockState.running, error: null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: mockState.insertError ? null : mockState.inserted,
                  error: mockState.insertError ? { message: mockState.insertError } : null,
                }),
            }),
          }),
          update: (patch) => ({
            eq: (_c, id) => {
              updateCalls.push({ patch, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const fetchCalls = [];
const fetchMock = vi.fn(async (url, opts) => {
  fetchCalls.push({ url, opts });
  return {
    ok: mockState.dispatchOk,
    text: async () => mockState.dispatchError,
  };
});
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  mockState.workspaces = [{ id: "ws-1", slug: "actuals" }];
  mockState.running = [];
  mockState.inserted = { id: "run-new" };
  mockState.insertError = null;
  mockState.dispatchOk = true;
  mockState.dispatchError = "";
  updateCalls.length = 0;
  fetchCalls.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.GITHUB_PAT = "ghp_test";
});

function makeReqRes(method, body) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return [{ method, body }, res];
}

let handler;
beforeEach(async () => {
  handler = (await import("../api/runs.js")).default;
});

describe("POST /api/runs", () => {
  it("returns 405 for non-POST", async () => {
    const [req, res] = makeReqRes("GET", {});
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 404 if workspace not found", async () => {
    mockState.workspaces = [];
    const [req, res] = makeReqRes("POST", { workspaceSlug: "actuals" });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 if run already in progress", async () => {
    mockState.running = [{ id: "stuck" }];
    const [req, res] = makeReqRes("POST", { workspaceSlug: "actuals" });
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("inserts run and dispatches GitHub workflow on happy path", async () => {
    const [req, res] = makeReqRes("POST", { workspaceSlug: "actuals" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.runId).toBe("run-new");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toMatch(/workflows\/discover\.yml\/dispatches$/);
    const body = JSON.parse(fetchCalls[0].opts.body);
    expect(body.ref).toBe("main");
    expect(body.inputs.workspace).toBe("actuals");
    expect(body.inputs.run_id).toBe("run-new");
  });

  it("marks run as failed and returns 502 on dispatch failure", async () => {
    mockState.dispatchOk = false;
    mockState.dispatchError = "Bad credentials";
    const [req, res] = makeReqRes("POST", { workspaceSlug: "actuals" });
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.status).toBe("failed");
    expect(updateCalls[0].id).toBe("run-new");
  });
});
