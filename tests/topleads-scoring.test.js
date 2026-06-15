import { describe, it, expect } from "vitest";
import { combinedScore, rankTopLeads, W_ICP, W_ENG } from "../src/lib/topleads/scoring.js";

describe("combinedScore", () => {
  it("weighs ICP and engagement by the configured weights", () => {
    expect(W_ICP + W_ENG).toBeCloseTo(1);
    expect(combinedScore({ icp_score: 100, engagement_score: 0 })).toBeCloseTo(W_ICP * 100);
    expect(combinedScore({ icp_score: 0, engagement_score: 100 })).toBeCloseTo(W_ENG * 100);
  });
  it("rankTopLeads sorts desc by combined and slices to the limit", () => {
    const leads = [
      { id: "a", icp_score: 50, engagement_score: 0 },
      { id: "b", icp_score: 100, engagement_score: 100 },
      { id: "c", icp_score: 60, engagement_score: 80 },
    ];
    expect(rankTopLeads(leads, 2).map((l) => l.id)).toEqual(["b", "c"]);
  });
});
