// CRM outreach generation. The handler is added in a later task; this file first
// defines the pure prompt builder so it can be unit-tested without network.
// Design: docs/superpowers/specs/2026-06-24-crm-outreach-from-context-design.md.

import { createClient } from "@supabase/supabase-js";
import { resolveWorkspaceId } from "../src/lib/crm/companyMatch.js";
import { fetchKbText } from "../src/lib/kb/readKb.js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const OUTREACH_MODEL = process.env.ANTHROPIC_OUTREACH_MODEL || "claude-sonnet-4-6";

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const supabase = serverSupabase();
  try {
    const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
    if (!wsId) return res.status(404).json({ error: "Workspace not found" });

    const contactId = (req.body || {}).contactId;
    if (!contactId) return res.status(400).json({ error: "Missing contactId" });

    const c = await supabase
      .from("crm_contacts")
      .select("id, full_name, role, headline, location, linkedin_url, stage, crm_companies ( name ), candidates ( signal_type, signal_context, llm_reasoning, linkedin_profile )")
      .eq("workspace_id", wsId)
      .eq("id", contactId)
      .maybeSingle();
    if (c.error) return res.status(500).json({ error: c.error.message });
    if (!c.data) return res.status(404).json({ error: "Contact not found" });

    // KB is best-effort: failure never blocks generation.
    let kbText = "";
    let kbAvailable = false;
    try {
      const kb = await fetchKbText(process.env.GITHUB_PAT);
      kbText = kb.text;
      kbAvailable = true;
    } catch (e) {
      console.error("KB fetch failed:", e.message);
    }

    const { system, user } = buildOutreachPrompt({
      contact: c.data,
      candidate: c.data.candidates || null,
      companyName: c.data.crm_companies?.name ?? null,
      kbText,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: OUTREACH_MODEL, max_tokens: 600, system, messages: [{ role: "user", content: user }] }),
    });
    if (!resp.ok) {
      const t = (await resp.text()).slice(0, 200);
      return res.status(500).json({ error: `Anthropic error ${resp.status}: ${t}` });
    }
    const json = await resp.json();
    const message = (json?.content ?? []).map((b) => (b?.type === "text" ? b.text : "")).join("").trim();
    if (!message) return res.status(500).json({ error: "Lege respons van het model" });

    return res.status(200).json({ message, kbAvailable });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
