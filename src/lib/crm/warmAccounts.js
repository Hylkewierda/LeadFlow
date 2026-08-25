// Aggregatie van candidates + home_top_leads naar warme accounts (spec §4).
// Puur: alle data en "now" komen als parameters binnen; de API-route doet de
// Supabase-selects en geeft de rijen door.

import { normalizeCompanyName } from "./companyMatch.js";
import { companyWarmth, isWarmEligible } from "./warmth.js";
import { classifyPersona, personaCoverage } from "./personas.js";

function candidateEvents(row) {
  const hist = Array.isArray(row.signal_history) ? row.signal_history : [];
  const events = hist
    .filter((e) => e && e.at)
    .map((e) => ({ at: e.at, signal_type: e.signal_type ?? row.signal_type ?? "content" }));
  if (events.length > 0) return events;
  // Fallback (spec §5): lege/afwijkende history mag nooit tot 0 events leiden.
  if (!row.created_at) return [];
  return [{ at: row.created_at, signal_type: row.signal_type ?? "content" }];
}

function homeTopLeadEvent(row) {
  if (!row.scored_at) return [];
  return [{ at: row.scored_at, signal_type: row.signal_context?.signal_type ?? "content" }];
}

// Bouwt de gegroepeerde personen-map: key → Map(linkedin_url → person).
// De drie bronnen dragen bedrijfs-/rolinfo in verschillende shapes aan:
// home_top_leads en oude snapshots als platte company/role-velden, de
// lookalike-profielscraper als currentPosition[0].{companyName,position}.
// Discovery-kandidaten (content/competitor) hebben geen werkgever-data —
// die kunnen pas meedoen zodra de scraper dat veld levert.
function profileCompany(p) {
  if (p.company) return p.company;
  const cp = Array.isArray(p.currentPosition) ? p.currentPosition[0] : null;
  return cp?.companyName ?? cp?.company ?? null;
}

function profileName(p) {
  if (p.name) return p.name;
  const composed = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return composed || null;
}

function profileRole(p) {
  if (p.role) return p.role;
  const cp = Array.isArray(p.currentPosition) ? p.currentPosition[0] : null;
  return cp?.position ?? cp?.title ?? null;
}

function groupPeople(candidates, homeTopLeads) {
  const groups = new Map();
  const upsert = (companyName, person) => {
    const key = normalizeCompanyName(companyName);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { name: companyName, people: new Map() });
    const g = groups.get(key);
    const existing = g.people.get(person.linkedin_url);
    if (existing) {
      // Candidates zijn rijker en winnen; events worden altijd samengevoegd,
      // en een ontbrekende score wordt aangevuld vanuit de andere bron.
      const winner = existing.source === "candidate" ? existing : person;
      const loser = winner === existing ? person : existing;
      winner.events = [...winner.events, ...loser.events];
      if (winner.score == null) winner.score = loser.score;
      g.people.set(person.linkedin_url, winner);
    } else {
      g.people.set(person.linkedin_url, person);
    }
  };

  for (const row of candidates ?? []) {
    const p = row.linkedin_profile ?? {};
    const company = profileCompany(p);
    if (!company) continue;
    upsert(company, {
      linkedin_url: row.linkedin_url,
      name: profileName(p),
      role: profileRole(p),
      headline: p.headline ?? null,
      score: row.llm_score != null ? Number(row.llm_score) : null,
      status: row.status ?? "new",
      source: "candidate",
      events: candidateEvents(row),
    });
  }
  for (const row of homeTopLeads ?? []) {
    const p = row.profile ?? {};
    const company = profileCompany(p);
    if (!company) continue;
    upsert(company, {
      linkedin_url: row.linkedin_url,
      name: profileName(p),
      role: profileRole(p),
      headline: p.headline ?? null,
      score: row.icp_score != null ? Number(row.icp_score) : null,
      status: "new",
      source: "home_top_lead",
      events: homeTopLeadEvent(row),
    });
  }
  return groups;
}

function summarize(key, group, crmByName, now) {
  const people = [...group.people.values()].map((p) => ({
    ...p,
    persona: classifyPersona(p.role, p.headline),
  }));
  const { warmth } = companyWarmth(people, now);
  const allEvents = people.flatMap((p) => p.events);
  const typeCounts = {};
  for (const e of allEvents) typeCounts[e.signal_type] = (typeCounts[e.signal_type] ?? 0) + 1;
  const lastAt = allEvents.reduce((m, e) => (m == null || e.at > m ? e.at : m), null);
  const crm = crmByName.get(key) ?? null;
  return {
    key,
    name: group.name,
    in_crm: crm != null,
    company_id: crm?.id ?? null,
    warmth,
    person_count: people.length,
    signal_count: allEvents.length,
    last_signal_at: lastAt,
    signal_type_counts: typeCounts,
    personas: personaCoverage(people),
    _people: people, // intern; detail-builder gebruikt dit, de API stript het
  };
}

export function buildWarmAccounts({ candidates, homeTopLeads, crmCompanies, now }) {
  const crmByName = new Map((crmCompanies ?? []).map((c) => [c.name_normalized, c]));
  const groups = groupPeople(candidates, homeTopLeads);
  const out = [];
  for (const [key, group] of groups) {
    const s = summarize(key, group, crmByName, now);
    if (!isWarmEligible(s._people, s.warmth, now)) continue;
    delete s._people;
    out.push(s);
  }
  return out.sort((a, b) => b.warmth - a.warmth);
}

export function buildWarmAccountDetail({ candidates, homeTopLeads, crmCompanies, now, key }) {
  const crmByName = new Map((crmCompanies ?? []).map((c) => [c.name_normalized, c]));
  const groups = groupPeople(candidates, homeTopLeads);
  const group = groups.get(key);
  if (!group) return null;
  const s = summarize(key, group, crmByName, now);
  const people = s._people.map(({ events, ...p }) => p);
  const timeline = s._people
    .flatMap((p) => p.events.map((e) => ({ at: e.at, person: p.name ?? "Onbekend", signal_type: e.signal_type })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  delete s._people;
  return { ...s, people, timeline };
}
