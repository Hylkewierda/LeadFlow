import { describe, it, expect } from "vitest";
import {
  decayFactor, eventWeight, personQuality, personWarmth, companyWarmth,
  isWarmEligible, EVENT_CAP, REDISCOVERY_BONUS, BREADTH_CAP,
} from "../src/lib/crm/warmth.js";

const NOW = new Date("2026-08-22T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("decayFactor", () => {
  it("is 1 vandaag, 0.5 na één halfwaardetijd (21d), ~0.125 na 63d", () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(21)).toBeCloseTo(0.5, 5);
    expect(decayFactor(63)).toBeCloseTo(0.125, 3);
  });
});

describe("eventWeight", () => {
  it("weegt competitor_engagement zwaarder dan content, lookalike lichter", () => {
    const comp = eventWeight({ at: daysAgo(0), signal_type: "competitor_engagement" }, NOW);
    const cont = eventWeight({ at: daysAgo(0), signal_type: "content" }, NOW);
    const look = eventWeight({ at: daysAgo(0), signal_type: "lookalike" }, NOW);
    expect(comp).toBeCloseTo(1.5);
    expect(cont).toBeCloseTo(1.0);
    expect(look).toBeCloseTo(0.7);
  });
  it("valt terug op DEFAULT_TYPE_WEIGHT voor onbekende types en negeert kapotte datums (weight 0)", () => {
    expect(eventWeight({ at: daysAgo(0), signal_type: "iets_nieuws" }, NOW)).toBeCloseTo(1.0);
    expect(eventWeight({ at: "geen-datum", signal_type: "content" }, NOW)).toBe(0);
    expect(eventWeight({ signal_type: "content" }, NOW)).toBe(0);
  });
});

describe("personQuality", () => {
  it("mapt score 0→0.5, 100→1.0, null→0.75", () => {
    expect(personQuality(0)).toBeCloseTo(0.5);
    expect(personQuality(100)).toBeCloseTo(1.0);
    expect(personQuality(null)).toBeCloseTo(0.75);
  });
});

describe("personWarmth", () => {
  it("capt de event-som op EVENT_CAP zodat één hyperactieve persoon niet domineert", () => {
    const events = Array.from({ length: 10 }, () => ({ at: daysAgo(0), signal_type: "competitor_engagement" }));
    const p = personWarmth({ score: 100, status: "new", events }, NOW);
    // events zouden 15 opleveren; cap 3 → kwaliteit 1.0 × bonus 1.2 (≥2 events) × 3
    expect(p).toBeCloseTo(1.0 * REDISCOVERY_BONUS * EVENT_CAP);
  });
  it("geeft de herontdekkingsbonus bij status=rediscovered met één event", () => {
    const one = [{ at: daysAgo(0), signal_type: "content" }];
    const base = personWarmth({ score: 50, status: "new", events: one }, NOW);
    const redis = personWarmth({ score: 50, status: "rediscovered", events: one }, NOW);
    expect(redis).toBeCloseTo(base * REDISCOVERY_BONUS);
  });
});

describe("companyWarmth", () => {
  it("twee personen met elk 1 signaal > één persoon met 2 signalen (breedte wint)", () => {
    const e = () => [{ at: daysAgo(0), signal_type: "content" }];
    const twoPeople = companyWarmth(
      [{ score: 50, status: "new", events: e() }, { score: 50, status: "new", events: e() }], NOW);
    const onePerson = companyWarmth(
      [{ score: 50, status: "new", events: [...e(), ...e()] }], NOW);
    expect(twoPeople.warmth).toBeGreaterThan(onePerson.warmth);
    expect(twoPeople.recentPersonCount).toBe(2);
  });
  it("maximeert de breedte-multiplier op BREADTH_CAP", () => {
    const many = Array.from({ length: 10 }, () => ({ score: 50, status: "new", events: [{ at: daysAgo(0), signal_type: "content" }] }));
    const sumP = many.reduce((s, p) => s + personWarmth(p, NOW), 0);
    expect(companyWarmth(many, NOW).warmth).toBeCloseTo(sumP * BREADTH_CAP);
  });
  it("telt personen zonder recent signaal (verval < 0.1) niet mee in recentPersonCount", () => {
    const old = { score: 50, status: "new", events: [{ at: daysAgo(120), signal_type: "content" }] };
    const fresh = { score: 50, status: "new", events: [{ at: daysAgo(1), signal_type: "content" }] };
    expect(companyWarmth([old, fresh], NOW).recentPersonCount).toBe(1);
  });
});

describe("isWarmEligible", () => {
  it("vereist warmth ≥ 0.5 én minstens één event ≤ 60 dagen", () => {
    const fresh = [{ score: 80, status: "new", events: [{ at: daysAgo(5), signal_type: "content" }] }];
    const stale = [{ score: 80, status: "new", events: [{ at: daysAgo(90), signal_type: "content" }] }];
    expect(isWarmEligible(fresh, 1.2, NOW)).toBe(true);
    expect(isWarmEligible(stale, 1.2, NOW)).toBe(false);
    expect(isWarmEligible(fresh, 0.1, NOW)).toBe(false);
  });
});
