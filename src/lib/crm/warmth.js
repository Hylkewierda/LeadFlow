// Warmte-formule voor warme accounts (spec §5). Puur — geen imports, geen I/O;
// "now" komt altijd als parameter binnen zodat alles deterministisch testbaar is.
// De constanten zijn een startpunt: bijstellen = hier wijzigen, tests leggen
// alleen het gedrag (ordening/caps) vast, niet exacte getallen.

export const HALF_LIFE_DAYS = 21;
export const TYPE_WEIGHTS = {
  competitor_engagement: 1.5,
  combined: 1.3,
  content: 1.0,
  lookalike: 0.7,
};
export const DEFAULT_TYPE_WEIGHT = 1.0;
export const EVENT_CAP = 3.0;
export const REDISCOVERY_BONUS = 1.2;
export const BREADTH_STEP = 0.4;
export const BREADTH_CAP = 2.2;
export const RECENT_DECAY_MIN = 0.1;
export const MIN_WARMTH = 0.5;
export const MAX_LAST_EVENT_AGE_DAYS = 60;

const MS_PER_DAY = 86400000;

export function decayFactor(ageDays) {
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function eventAgeDays(event, now) {
  const t = Date.parse(event?.at ?? "");
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / MS_PER_DAY);
}

export function eventWeight(event, now) {
  const age = eventAgeDays(event, now);
  if (age == null) return 0;
  const type = TYPE_WEIGHTS[event.signal_type] ?? DEFAULT_TYPE_WEIGHT;
  return type * decayFactor(age);
}

export function personQuality(score) {
  if (score == null || Number.isNaN(Number(score))) return 0.75;
  return 0.5 + 0.5 * (Number(score) / 100);
}

export function personWarmth(person, now) {
  const events = person.events ?? [];
  const sum = events.reduce((s, e) => s + eventWeight(e, now), 0);
  const bonus = person.status === "rediscovered" || events.length >= 2 ? REDISCOVERY_BONUS : 1;
  return personQuality(person.score) * bonus * Math.min(sum, EVENT_CAP);
}

function hasRecentEvent(person, now) {
  return (person.events ?? []).some((e) => {
    const age = eventAgeDays(e, now);
    return age != null && decayFactor(age) >= RECENT_DECAY_MIN;
  });
}

export function companyWarmth(people, now) {
  const sum = people.reduce((s, p) => s + personWarmth(p, now), 0);
  const recentPersonCount = people.filter((p) => hasRecentEvent(p, now)).length;
  const multiplier = Math.min(1 + BREADTH_STEP * Math.max(0, recentPersonCount - 1), BREADTH_CAP);
  return { warmth: sum * multiplier, recentPersonCount };
}

export function isWarmEligible(people, warmth, now) {
  if (warmth < MIN_WARMTH) return false;
  return people.some((p) =>
    (p.events ?? []).some((e) => {
      const age = eventAgeDays(e, now);
      return age != null && age <= MAX_LAST_EVENT_AGE_DAYS;
    })
  );
}
