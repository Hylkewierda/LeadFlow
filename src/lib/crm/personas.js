// Buying-committee-persona's voor Actuals (spec §6). Vaste v1-lijst; de
// array-volgorde is de matchprioriteit ("Head of Payment Operations" moet
// payments worden, niet finance_ops). Matching is substring, case-insensitive,
// eerst op role en dan op headline. Uitbreiden = patroon + testregel toevoegen.

export const PERSONAS = [
  { key: "payments", label: "Head of Payments", patterns: [/\bpayments?\b/] },
  {
    key: "finance_leadership",
    label: "Finance-leiderschap",
    patterns: [/\bcfo\b/, /chief financial/, /vp (?:of )?finance/, /finance director/, /financieel directeur/, /head of finance/],
  },
  { key: "controller", label: "Controller", patterns: [/\bcontroller\b/] },
  {
    key: "economic_buyer",
    label: "Economic buyer",
    patterns: [/\bceo\b/, /\bcoo\b/, /\bfounder\b/, /\boprichter\b/, /managing director/, /algemeen directeur/, /\beigenaar\b/, /\bowner\b/],
  },
  {
    key: "finance_ops",
    label: "Finance ops",
    patterns: [/\baccounting\b/, /\baccountant\b/, /finance operations/, /financial administration/, /financiële administratie/, /administrateur/, /\bboekhoud/],
  },
];

export const OTHER_KEY = "overig";
export const OTHER_LABEL = "Overig";

function matchText(text) {
  let t = (text ?? "").toLowerCase();
  if (!t) return null;
  // "Product owner" is een IC-rol, geen economic buyer — strip vóór het matchen
  // zodat het \bowner\b-patroon er niet op aanslaat.
  t = t.replace(/product owners?/g, " ");
  for (const p of PERSONAS) {
    if (p.patterns.some((re) => re.test(t))) return p.key;
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
