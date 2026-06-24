import { describe, it, expect } from "vitest";
import { buildOutreachPrompt, ACTUALS_FALLBACK } from "../src/lib/crm/outreachPrompt.js";

const CONTACT = { full_name: "Ann de Vries", role: "Controller", location: "Amsterdam" };
const CANDIDATE = {
  signal_type: "content",
  signal_context: { posts: [{ post_text: "We worstelen met onze maandafsluiting en reconciliatie." }] },
  llm_reasoning: "Controller bij een high-volume webshop — sterke ICP-match.",
};

describe("buildOutreachPrompt", () => {
  it("includes lead context, the signal hook, reasoning and KB text", () => {
    const { system, user } = buildOutreachPrompt({
      contact: CONTACT, candidate: CANDIDATE, companyName: "ShopCo", kbText: "Actuals doet X en Y.",
    });
    expect(system).toMatch(/Nederlands/i);
    expect(user).toContain("Ann de Vries");
    expect(user).toContain("Controller");
    expect(user).toContain("ShopCo");
    expect(user).toContain("maandafsluiting");
    expect(user).toContain("sterke ICP-match");
    expect(user).toContain("Actuals doet X en Y.");
  });

  it("falls back to ACTUALS_FALLBACK when kbText is empty", () => {
    const { user } = buildOutreachPrompt({ contact: CONTACT, candidate: CANDIDATE, companyName: "ShopCo", kbText: "" });
    expect(user).toContain(ACTUALS_FALLBACK);
  });

  it("handles a missing candidate without a signal line and without crashing", () => {
    const { user } = buildOutreachPrompt({ contact: CONTACT, candidate: null, companyName: null, kbText: "KB" });
    expect(user).toContain("Ann de Vries");
    expect(user).not.toMatch(/Signaal:/);
  });
});
