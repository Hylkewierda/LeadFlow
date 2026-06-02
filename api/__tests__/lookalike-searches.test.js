import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { createClient } from "@supabase/supabase-js";
import handler from "../lookalike-searches.js";

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
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
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fake";
  process.env.GITHUB_PAT = "pat_fake";
  globalThis.fetch = vi.fn();
});

describe("POST /api/lookalike-searches", () => {
  it("returns 405 on non-POST", async () => {
    const res = makeRes();
    await handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 204 on OPTIONS preflight", async () => {
    const res = makeRes();
    await handler({ method: "OPTIONS" }, res);
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 when urls[] is missing or empty", async () => {
    const res = makeRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/urls/);
  });

  it("returns 400 when urls don't look like LinkedIn profiles", async () => {
    const res = makeRes();
    await handler(
      { method: "POST", body: { urls: ["not-a-linkedin-url", "https://example.com"] } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when workspace slug doesn't exist", async () => {
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
    });
    const res = makeRes();
    await handler(
      {
        method: "POST",
        body: { workspaceSlug: "doesnotexist", urls: ["https://www.linkedin.com/in/x"] },
      },
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it("inserts row + dispatches GH Action on happy path", async () => {
    const insertedId = "abc-uuid-123";
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = dispatchSpy;

    // Two queries are made: workspace lookup, then insert.
    let callIdx = 0;
    createClient.mockReturnValue({
      from: (table) => {
        if (table === "workspaces") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: "ws-1" } }) }),
            }),
          };
        }
        if (table === "lookalike_searches") {
          callIdx++;
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: insertedId } }),
              }),
            }),
          };
        }
        return {};
      },
    });

    const res = makeRes();
    await handler(
      {
        method: "POST",
        body: {
          workspaceSlug: "actuals",
          name: "test",
          urls: ["https://www.linkedin.com/in/jane-doe", "https://www.linkedin.com/in/joe"],
        },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.searchId).toBe(insertedId);
    expect(dispatchSpy).toHaveBeenCalledOnce();
    const dispatchUrl = dispatchSpy.mock.calls[0][0];
    expect(dispatchUrl).toContain("lookalike-search.yml/dispatches");
    const dispatchBody = JSON.parse(dispatchSpy.mock.calls[0][1].body);
    expect(dispatchBody.inputs).toEqual({ workspace: "actuals", search_id: insertedId });
  });

  it("returns 502 + marks row failed when GH dispatch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "GitHub error",
    });
    const updateSpy = vi.fn(() => ({ eq: async () => ({ data: null }) }));
    createClient.mockReturnValue({
      from: (table) => {
        if (table === "workspaces") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: "ws-1" } }) }),
            }),
          };
        }
        if (table === "lookalike_searches") {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { id: "id-9" } }) }),
            }),
            update: updateSpy,
          };
        }
        return {};
      },
    });

    const res = makeRes();
    await handler(
      {
        method: "POST",
        body: { urls: ["https://www.linkedin.com/in/x"] },
      },
      res,
    );
    expect(res.statusCode).toBe(502);
    expect(updateSpy).toHaveBeenCalled();
  });
});
