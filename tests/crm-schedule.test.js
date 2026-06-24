import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  workspaces: [{ id: "ws-1", slug: "actuals" }],
  contact: { id: "ct-1", stage: "gesprek" }, // for the note branch's contact fetch
  updateError: null,
};
const calls = { updates: [], notes: [], rpc: [] };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "crm_contacts" || table === "crm_notes") {
        return {
          // update() supports BOTH update().eq().eq().select().maybeSingle() (schedule)
          // and `await update().eq()` (note-clear): chainable AND thenable.
          update: (patch) => {
            calls.updates.push(patch);
            const result = { data: state.updateError ? null : { id: "ct-1", ...patch }, error: state.updateError };
            const chain = {
              eq: () => chain,
              select: () => ({ maybeSingle: () => Promise.resolve(result) }),
              then: (resolve) => resolve({ error: state.updateError }),
            };
            return chain;
          },
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.contact, error: null }) }) }) }),
          insert: (row) => { calls.notes.push(row); return Promise.resolve({ error: null }); },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name, params) => { calls.rpc.push({ name, params }); return Promise.resolve({ data: { id: params.p_contact_id }, error: null }); },
  }),
}));

function makeReqRes(method, { query, body } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, query: query ?? {}, body: body ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.workspaces = [{ id: "ws-1", slug: "actuals" }];
  state.contact = { id: "ct-1", stage: "gesprek" };
  state.updateError = null;
  calls.updates.length = 0;
  calls.notes.length = 0;
  calls.rpc.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/crm-contacts.js")).default;
});

describe("PATCH /api/crm-contacts?action=schedule", () => {
  it("sets a valid date", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "schedule" }, body: { next_action_at: "2026-07-01" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.updates[0]).toEqual({ next_action_at: "2026-07-01" });
  });

  it("clears with null", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "schedule" }, body: { next_action_at: null } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.updates[0]).toEqual({ next_action_at: null });
  });

  it("rejects an invalid date format", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", id: "ct-1", action: "schedule" }, body: { next_action_at: "07-01-2026" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(calls.updates).toHaveLength(0);
  });

  it("400 when id is missing", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { workspace: "actuals", action: "schedule" }, body: { next_action_at: null } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/crm-contacts?action=note clears next_action_at on a contact_moment", () => {
  it("nulls next_action_at for a contact_moment (non-nieuw stage)", async () => {
    state.contact = { id: "ct-1", stage: "gesprek" };
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", id: "ct-1", action: "note" }, body: { body: "Gebeld", kind: "contact_moment" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.updates.some((p) => p.next_action_at === null)).toBe(true);
  });

  it("does NOT null next_action_at for a plain note", async () => {
    state.contact = { id: "ct-1", stage: "gesprek" };
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", id: "ct-1", action: "note" }, body: { body: "Interne notitie", kind: "note" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.updates.some((p) => "next_action_at" in p)).toBe(false);
  });

  it("clears next_action_at AND advances stage for a contact_moment in 'nieuw'", async () => {
    state.contact = { id: "ct-1", stage: "nieuw" };
    const [req, res] = makeReqRes("POST", { query: { workspace: "actuals", id: "ct-1", action: "note" }, body: { body: "Eerste belletje", kind: "contact_moment" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(calls.rpc.some((r) => r.name === "crm_set_stage" && r.params.p_stage === "benaderd")).toBe(true);
    expect(calls.updates.some((p) => p.next_action_at === null)).toBe(true);
  });
});
