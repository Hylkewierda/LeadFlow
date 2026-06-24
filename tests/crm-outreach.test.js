import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { workspaces: [{ id: "ws-1", slug: "actuals" }], contact: null, contactError: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "crm_contacts") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.contact, error: state.contactError }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }

function installFetch({ githubOk = true, anthropicOk = true } = {}) {
  global.fetch = vi.fn(async (url) => {
    if (url.includes("api.github.com")) {
      if (url.includes("/git/trees/")) {
        if (!githubOk) return { ok: false, status: 502, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ tree: [{ type: "blob", path: "kb/actuals/x.md" }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ content: b64("KB body") }) };
    }
    if (url.includes("api.anthropic.com")) {
      if (!anthropicOk) return { ok: false, status: 500, text: async () => "boom" };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Hoi Ann, ik zag je post..." }] }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function makeReqRes(method, { query, body } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, query: query ?? {}, body: body ?? {} }, res];
}

const CONTACT = {
  id: "ct-1", full_name: "Ann", role: "Controller", headline: null, location: "NL", linkedin_url: "u1", stage: "nieuw",
  crm_companies: { name: "ShopCo" },
  candidates: { signal_type: "content", signal_context: { posts: [{ post_text: "maandafsluiting" }] }, llm_reasoning: "match", linkedin_profile: {} },
};

let handler;
beforeEach(async () => {
  vi.resetModules();
  state.workspaces = [{ id: "ws-1", slug: "actuals" }];
  state.contact = null;
  state.contactError = null;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.ANTHROPIC_API_KEY = "anthropic-key";
  process.env.GITHUB_PAT = "gh-pat";
  handler = (await import("../api/crm-outreach.js")).default;
});

describe("POST /api/crm-outreach", () => {
  it("405 on non-POST", async () => {
    installFetch();
    const [req, res] = makeReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("400 when contactId is missing", async () => {
    installFetch();
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: {} });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404 when the contact is not found", async () => {
    installFetch();
    state.contact = null;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { contactId: "ct-1" } });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns a message with kbAvailable true on the happy path", async () => {
    installFetch();
    state.contact = CONTACT;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { contactId: "ct-1" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain("Hoi Ann");
    expect(res.body.kbAvailable).toBe(true);
  });

  it("still returns a message with kbAvailable false when the KB fetch fails", async () => {
    installFetch({ githubOk: false });
    state.contact = CONTACT;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { contactId: "ct-1" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.kbAvailable).toBe(false);
    expect(res.body.message).toContain("Hoi Ann");
  });

  it("500 when the Anthropic call fails", async () => {
    installFetch({ anthropicOk: false });
    state.contact = CONTACT;
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals" }, body: { contactId: "ct-1" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});
