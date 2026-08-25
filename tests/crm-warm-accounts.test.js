import { describe, it, expect } from "vitest";
import { buildWarmAccounts, buildWarmAccountDetail } from "../src/lib/crm/warmAccounts.js";

const NOW = new Date("2026-08-22T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const cand = (over = {}) => ({
  linkedin_url: "https://li/x",
  linkedin_profile: { name: "Ann", role: "CFO", headline: "CFO bij ShopCo", company: "ShopCo B.V." },
  signal_type: "content",
  signal_context: {},
  signal_history: [{ run_id: "r1", signal_type: "content", at: daysAgo(3) }],
  llm_score: 70,
  status: "new",
  created_at: daysAgo(3),
  ...over,
});

describe("buildWarmAccounts", () => {
  it("groepeert op genormaliseerde naam en telt personen + signalen", () => {
    const rows = [
      cand({ linkedin_url: "u1" }),
      cand({ linkedin_url: "u2", linkedin_profile: { name: "Bob", role: "Controller", company: "ShopCo" } }),
    ];
    const out = buildWarmAccounts({ candidates: rows, homeTopLeads: [], crmCompanies: [], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("shopco");
    expect(out[0].person_count).toBe(2);
    expect(out[0].signal_count).toBe(2);
    expect(out[0].personas.finance_leadership.present).toBe(true);
    expect(out[0].personas.controller.present).toBe(true);
    expect(out[0].personas.payments.present).toBe(false);
  });

  it("dedupt personen over beide bronnen op linkedin_url en merget hun events", () => {
    const htl = {
      linkedin_url: "u1",
      profile: { name: "Ann", role: "CFO", company: "ShopCo" },
      signal_context: {},
      icp_score: 60,
      scored_at: daysAgo(1),
    };
    const out = buildWarmAccounts({ candidates: [cand({ linkedin_url: "u1" })], homeTopLeads: [htl], crmCompanies: [], now: NOW });
    expect(out[0].person_count).toBe(1);
    expect(out[0].signal_count).toBe(2); // candidate-event + htl-event
  });

  it("zet in_crm/company_id via de crm_companies-join", () => {
    const out = buildWarmAccounts({
      candidates: [cand()], homeTopLeads: [],
      crmCompanies: [{ id: "co-1", name_normalized: "shopco" }], now: NOW,
    });
    expect(out[0].in_crm).toBe(true);
    expect(out[0].company_id).toBe("co-1");
  });

  it("gebruikt de created_at-fallback bij lege signal_history en laat stale accounts weg", () => {
    const fresh = cand({ signal_history: [], created_at: daysAgo(2) });
    const stale = cand({
      linkedin_url: "u9",
      linkedin_profile: { name: "Old", role: "CFO", company: "OldCo" },
      signal_history: [], created_at: daysAgo(200),
    });
    const out = buildWarmAccounts({ candidates: [fresh, stale], homeTopLeads: [], crmCompanies: [], now: NOW });
    expect(out.map((a) => a.key)).toEqual(["shopco"]);
  });

  it("slaat rijen zonder bedrijfsnaam over en sorteert aflopend op warmte", () => {
    const noCompany = cand({ linkedin_url: "u5", linkedin_profile: { name: "X" } });
    const hot = [
      cand({ linkedin_url: "h1", linkedin_profile: { name: "A", role: "CFO", company: "HotCo" }, signal_type: "competitor_engagement", signal_history: [{ run_id: "r", signal_type: "competitor_engagement", at: daysAgo(1) }] }),
      cand({ linkedin_url: "h2", linkedin_profile: { name: "B", role: "CEO", company: "HotCo" }, signal_type: "competitor_engagement", signal_history: [{ run_id: "r", signal_type: "competitor_engagement", at: daysAgo(1) }] }),
    ];
    const out = buildWarmAccounts({ candidates: [noCompany, cand(), ...hot], homeTopLeads: [], crmCompanies: [], now: NOW });
    expect(out[0].key).toBe("hotco");
    expect(out.find((a) => a.key === "")).toBeUndefined();
  });
});

describe("buildWarmAccountDetail", () => {
  it("geeft people (met persona + source) en een tijdlijn nieuwste-eerst", () => {
    const rows = [
      cand({ linkedin_url: "u1", signal_history: [{ run_id: "r1", signal_type: "content", at: daysAgo(10) }] }),
      cand({ linkedin_url: "u2", linkedin_profile: { name: "Bob", role: "Growth", company: "ShopCo" }, signal_history: [{ run_id: "r2", signal_type: "competitor_engagement", at: daysAgo(1) }] }),
    ];
    const d = buildWarmAccountDetail({ candidates: rows, homeTopLeads: [], crmCompanies: [], now: NOW, key: "shopco" });
    expect(d.people).toHaveLength(2);
    expect(d.people.find((p) => p.name === "Ann").persona).toBe("finance_leadership");
    expect(d.people.find((p) => p.name === "Bob").persona).toBe("overig");
    expect(d.people[0].source).toBe("candidate");
    expect(d.timeline[0].person).toBe("Bob"); // nieuwste eerst
    expect(d.timeline[0].signal_type).toBe("competitor_engagement");
  });

  it("retourneert null voor een onbekende key", () => {
    expect(buildWarmAccountDetail({ candidates: [cand()], homeTopLeads: [], crmCompanies: [], now: NOW, key: "bestaatniet" })).toBeNull();
  });
});

describe("lookalike-profielshape (currentPosition)", () => {
  it("haalt bedrijf en rol uit currentPosition[0] als company/role ontbreken", () => {
    const row = cand({
      linkedin_url: "u-look",
      signal_type: "lookalike",
      linkedin_profile: {
        name: "Loes",
        headline: "Finance bij ShopCo",
        currentPosition: [{ companyName: "ShopCo B.V.", position: "Financial Controller" }],
      },
      signal_history: [{ search_id: "s1", signal_type: "lookalike", at: daysAgo(2) }],
    });
    const out = buildWarmAccounts({ candidates: [row], homeTopLeads: [], crmCompanies: [], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("shopco");
    const d = buildWarmAccountDetail({ candidates: [row], homeTopLeads: [], crmCompanies: [], now: NOW, key: "shopco" });
    expect(d.people[0].role).toBe("Financial Controller");
    expect(d.people[0].persona).toBe("controller");
  });

  it("laat rijen zonder enige bedrijfsinfo nog steeds weg", () => {
    const row = cand({
      linkedin_url: "u-none",
      linkedin_profile: { name: "X", role: "CFO", currentPosition: [] },
    });
    expect(buildWarmAccounts({ candidates: [row], homeTopLeads: [], crmCompanies: [], now: NOW })).toHaveLength(0);
  });
});
