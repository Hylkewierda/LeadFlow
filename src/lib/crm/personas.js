// Buying-committee-persona's voor Actuals (spec §6). Vaste v1-lijst; de
// array-volgorde is de matchprioriteit ("Head of Payment Operations" moet
// payments worden, niet finance_ops). Matching is substring, case-insensitive,
// eerst op role en dan op headline. Uitbreiden = patroon + testregel toevoegen.

export const PERSONAS = [
  { key: "payments", label: "Head of Payments", patterns: ["payment"] },
  {
    key: "finance_leadership",
    label: "Finance-leiderschap",
    patterns: ["cfo", "chief financial", "vp finance", "finance director", "financieel directeur", "head of finance"],
  },
  { key: "controller", label: "Controller", patterns: ["controller"] },
  {
    key: "economic_buyer",
    label: "Economic buyer",
    patterns: ["ceo", "coo", "founder", "oprichter", "managing director", "algemeen directeur", "eigenaar", "owner"],
  },
  {
    key: "finance_ops",
    label: "Finance ops",
    patterns: ["accounting", "accountant", "finance operations", "financial administration", "financiële administratie", "administrateur", "boekhoud"],
  },
];

export const OTHER_KEY = "overig";
export const OTHER_LABEL = "Overig";

function matchText(text) {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  for (const p of PERSONAS) {
    if (p.patterns.some((pat) => t.includes(pat))) return p.key;
  }
  return null;
}

export function classifyPersona(role, headline) {
  return matchText(role) ?? matchText(headline) ?? OTHER_KEY;
}

export function personaCoverage(people) {
  const cov = {};
  for (const p of PERSONAS) cov[p.key] = { present: false, people: [] };
  for (const person of people ?? []) {
    const slot = cov[person.persona];
    if (!slot) continue; // "overig" telt niet als gap-vulling
    slot.present = true;
    if (person.name) slot.people.push(person.name);
  }
  return cov;
}
