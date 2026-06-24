// CRM outreach generation. The handler is added in a later task; this file first
// defines the pure prompt builder so it can be unit-tested without network.
// Design: docs/superpowers/specs/2026-06-24-crm-outreach-from-context-design.md.

export const ACTUALS_FALLBACK =
  "Actuals is een B2B-platform voor transaction matching, reconciliation en financial close voor high-volume digitale bedrijven (PSP-, accounting-, billing- en bankkoppelingen).";

// Short NL phrase describing the signal, from the candidate's signal_context.
function describeSignal(signalContext) {
  const ctx = signalContext || {};
  const post = Array.isArray(ctx.posts) ? ctx.posts.find((p) => p && p.post_text) : null;
  if (post) return `reageerde op / plaatste content: "${String(post.post_text).slice(0, 200)}"`;
  const eng = Array.isArray(ctx.engagements) ? ctx.engagements[0] : null;
  if (eng) {
    const what = eng.engagement_text ? `: "${String(eng.engagement_text).slice(0, 200)}"` : "";
    return `${eng.engagement_type || "engagement"} op content van ${eng.competitor_company || "een concurrent"}${what}`;
  }
  return null;
}

export function buildOutreachPrompt({ contact, candidate, companyName, kbText }) {
  const c = contact || {};
  const cand = candidate || null;
  const actualsContext = kbText && kbText.trim() ? kbText.trim() : ACTUALS_FALLBACK;
  const hook = cand ? describeSignal(cand.signal_context) : null;

  const system = [
    "Je bent een B2B sales-copywriter voor Actuals.",
    "Schrijf één kort Nederlands LinkedIn-eerste-bericht (3–5 zinnen), zakelijk-warm en concreet.",
    "Begin met een persoonlijke haak op basis van het signaal (waarom je contact opneemt).",
    "Gebruik de Actuals-context hieronder voor de waardepropositie; verzin GEEN claims die daar niet in staan.",
    "Geen placeholders zoals [naam] of [bedrijf] — gebruik de gegeven waarden, of laat ze weg.",
    "Geef UITSLUITEND de berichttekst terug, zonder uitleg of opmaak.",
  ].join(" ");

  const leadLines = [
    `Naam: ${c.full_name || "onbekend"}`,
    c.role ? `Rol: ${c.role}` : null,
    companyName ? `Bedrijf: ${companyName}` : null,
    c.location ? `Locatie: ${c.location}` : null,
    hook ? `Signaal: ${hook}` : null,
    cand && cand.llm_reasoning ? `Waarom een goede lead: ${cand.llm_reasoning}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Lead:\n${leadLines}\n\nActuals-context (waardepropositie):\n${actualsContext}\n\nSchrijf het eerste bericht.`;

  return { system, user };
}
