import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { workspaces: [{ id: "ws-1", slug: "actuals" }], contacts: [], contactsError: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "crm_contacts") {
        return { select: () => ({ eq: () => Promise.resolve({ data: state.contacts, error: state.contactsError }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function makeReqRes(method, { query } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, query: query ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.workspaces = [{ id: "ws-1", slug: "actuals" }];
  state.contacts = [];
  state.contactsError = null;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/crm-analytics.js")).default;
});

const SAMPLE = [
  { stage: "gewonnen", source: "candidate", source_score: 80, owner: "a@x", disqualify_reason: null, candidate_id: "c1", candidates: { signal_type: "content" } },
  { stage: "verloren", source: "candidate", source_score: 50, owner: "a@x", disqualify_reason: "too_small", candidate_id: "c2", candidates: { signal_type: "content" } },
  { stage: "verloren", source: "home_top_lead", source_score: 70, owner: null, disqualify_reason: "already_customer", candidate_id: null, candidates: null },
  { stage: "nieuw", source: "manual", source_score: null, owner: null, disqualify_reason: null, candidate_id: null, candidates: null },
  { stage: "gewonnen", source: "home_top_lead", source_score: 90, owner: "b@x", disqualify_reason: null, candidate_id: "c5", candidates: { signal_type: "lookalike" } },
];

describe("GET /api/crm-analytics", () => {
  it("404s on unknown workspace", async () => {
    const [req, res] = makeReqRes("GET", { query: { workspace: "nope" } });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns zeroed totals and empty dimensions for no contacts", async () => {
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.totals).toEqual({ won: 0, lost: 0, open: 0, closed: 0, winRate: null });
    expect(res.body.byDimension.scoreBand).toEqual([]);
    expect(res.body.lossReasons).toEqual([]);
    expect(res.body.byOwner).toEqual([]);
  });

  it("aggregates totals, dimensions, loss reasons and owners", async () => {
    state.contacts = SAMPLE;
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);

    expect(res.body.totals).toEqual({ won: 2, lost: 2, open: 1, closed: 4, winRate: 50 });

    const band = Object.fromEntries(res.body.byDimension.scoreBand.map((r) => [r.key, r]));
    expect(band.hoog).toMatchObject({ label: "65+", won: 2, lost: 1, open: 0, winRate: 67 });
    expect(band.midden).toMatchObject({ won: 0, lost: 1, open: 0, winRate: 0 });
    expect(band.onbekend).toMatchObject({ won: 0, lost: 0, open: 1, winRate: null });

    const sig = Object.fromEntries(res.body.byDimension.signalType.map((r) => [r.key, r]));
    expect(sig.content).toMatchObject({ label: "Content", won: 1, lost: 1, winRate: 50 });
    expect(sig.onbekend).toMatchObject({ won: 0, lost: 1, open: 1, winRate: 0 });
    expect(sig.lookalike).toMatchObject({ won: 1, lost: 0, winRate: 100 });

    const src = Object.fromEntries(res.body.byDimension.source.map((r) => [r.key, r]));
    expect(src.manual).toMatchObject({ label: "Handmatig", winRate: null });

    expect(res.body.lossReasons).toEqual(
      expect.arrayContaining([
        { reason: "too_small", label: "Te klein", count: 1 },
        { reason: "already_customer", label: "Al klant", count: 1 },
      ]),
    );

    const owners = Object.fromEntries(res.body.byOwner.map((o) => [o.owner ?? "__none__", o]));
    expect(owners["a@x"]).toMatchObject({ won: 1, lost: 1, winRate: 50 });
    expect(owners["b@x"]).toMatchObject({ won: 1, lost: 0, winRate: 100 });
    expect(owners["__none__"]).toMatchObject({ owner: null, won: 0, lost: 1, winRate: 0 });
  });

  it("500s when the contacts query errors", async () => {
    state.contactsError = { message: "boom" };
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});
