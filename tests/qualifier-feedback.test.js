import { describe, it, expect, vi, beforeEach } from "vitest";

const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: "w1" }], error: null }) })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: vi.fn(() => ({ update })) }) }));

const handler = (await import("../api/qualifier-feedback.js")).default;

function mockRes() {
  return { statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; } };
}

beforeEach(() => { process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; update.mockClear(); });

describe("PUT /api/qualifier-feedback", () => {
  it("saves feedback and returns ok", async () => {
    const res = mockRes();
    await handler({ method: "PUT", body: { feedback: "be strict on accountants" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ qualifier_feedback: "be strict on accountants" });
  });

  it("rejects feedback over 4000 chars", async () => {
    const res = mockRes();
    await handler({ method: "PUT", body: { feedback: "x".repeat(4001) } }, res);
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
