import { createClient } from "@supabase/supabase-js";

const SELECT_COLS =
  "id, linkedin_url, linkedin_profile, pre_score, signal_type, signal_context, status, exported_to_sheet_at, llm_score, llm_reasoning, llm_qualified_at";

// n8n webhook that appends a row to the overview Google Sheet (Webhook → Google
// Sheets "Append Row"). n8n holds the Google OAuth credential, so we never need
// a static service-account key (blocked by the org policy
// iam.disableServiceAccountKeyCreation). Env override allowed; sensible default
// matches the existing hardcoded-webhook convention in src/pages/Home.jsx.
const N8N_SHEET_WEBHOOK_URL =
  process.env.N8N_SHEET_WEBHOOK_URL ||
  "https://hylkewnl.app.n8n.cloud/webhook/c1ae03e8-fb61-4d53-99fa-827b0f50b448";

// Disqualifier rules sourced from autoresearch/qualify_prompt.md DISQUALIFICATIE.
const DISQUALIFIER_RULES = [
  { pattern: /\bactuals\b/i, reason: "employee_actuals" },
  { pattern: /accountanc|cfo4\w+|accounting firm/i, reason: "finance_dienstverlener" },
];

export function disqualifierFlag(profile) {
  const company = (profile?.company ?? "").toString();
  const reasons = DISQUALIFIER_RULES.filter((r) => r.pattern.test(company)).map((r) => r.reason);
  return reasons.join("; ");
}

export function formatReasoning(candidate) {
  const ctx = candidate.signal_context ?? {};
  if (candidate.signal_type === "content" && Array.isArray(ctx.posts) && ctx.posts.length) {
    const p = ctx.posts[0];
    return `Reageerde op post "${p.title ?? ""}"${p.author ? ` van ${p.author}` : ""} (${p.likes ?? 0} likes, ${p.comments ?? 0} comments)`;
  }
  if (
    candidate.signal_type === "competitor_engagement" &&
    Array.isArray(ctx.engagements) &&
    ctx.engagements.length
  ) {
    const e = ctx.engagements[0];
    return `Engaged met competitor-content op ${e.engaged_at ?? "(onbekende datum)"}`;
  }
  return "";
}

// Returns a flat object whose keys match the n8n webhook -> Google Sheets mapping.
export function buildRow(candidate) {
  const p = candidate.linkedin_profile ?? {};
  // Only trust LLM fields when the qualification call actually completed.
  // If the LLM step failed (llm_qualified_at is null), we fall back to the
  // factual signal-context formatter so the sheet still gets a useful row.
  const hasLlm = !!candidate.llm_qualified_at;
  return {
    naam: p.name ?? "",
    bedrijf: p.company ?? "",
    rol: p.role ?? p.headline ?? "",
    pre_score: candidate.pre_score != null ? String(candidate.pre_score) : "",
    ai_score:
      hasLlm && candidate.llm_score != null
        ? String(Math.round(candidate.llm_score))
        : "",
    reasoning:
      hasLlm && candidate.llm_reasoning
        ? candidate.llm_reasoning
        : formatReasoning(candidate),
    disqualifier: disqualifierFlag(p),
    linkedin_url: candidate.linkedin_url ?? "",
    exported_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { candidateIds, backfillAll } = req.body || {};
  if (!backfillAll && (!Array.isArray(candidateIds) || candidateIds.length === 0)) {
    return res.status(400).json({ error: "candidateIds array or backfillAll required" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Resolve the candidate set. Lookalike-search hits live in a separate flow
  // (see api/export-lookalike-to-sheet.js + a dedicated Sheet) — we MUST exclude
  // them here so a backfill doesn't dump them into the regular Sheet.
  let candidates;
  if (backfillAll) {
    const { data, error } = await supabase
      .from("candidates")
      .select(SELECT_COLS + ", lookalike_search_id")
      .eq("status", "qualified")
      .is("exported_to_sheet_at", null)
      .is("lookalike_search_id", null);
    if (error) return res.status(500).json({ error: error.message });
    candidates = data ?? [];
  } else {
    const { data, error } = await supabase
      .from("candidates")
      .select(SELECT_COLS + ", lookalike_search_id")
      .in("id", candidateIds);
    if (error) return res.status(500).json({ error: error.message });
    // Idempotency: never write a candidate that's already in the sheet;
    // and never write a lookalike-origin candidate into the regular Sheet.
    candidates = (data ?? []).filter((c) => !c.exported_to_sheet_at && !c.lookalike_search_id);
  }

  if (candidates.length === 0) {
    return res.status(200).json({ exported: 0, skipped: true });
  }

  // POST one row per candidate to the n8n webhook (n8n appends to the Sheet).
  // Mark only the rows that actually made it, so failures get retried by a later
  // qualify/backfill instead of being silently lost.
  const exportedIds = [];
  const failed = [];
  for (const c of candidates) {
    try {
      const resp = await fetch(N8N_SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRow(c)),
      });
      if (!resp.ok) throw new Error(`n8n webhook returned ${resp.status}`);
      exportedIds.push(c.id);
    } catch (e) {
      failed.push({ id: c.id, message: (e?.message || "unknown").slice(0, 200) });
    }
  }

  if (exportedIds.length > 0) {
    const now = new Date().toISOString();
    await supabase.from("candidates").update({ exported_to_sheet_at: now }).in("id", exportedIds);
  }

  return res.status(200).json({ exported: exportedIds.length, failed });
}
