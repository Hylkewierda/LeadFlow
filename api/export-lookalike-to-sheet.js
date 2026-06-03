import { createClient } from "@supabase/supabase-js";
import { disqualifierFlag, formatReasoning } from "./export-to-sheet.js";

// Columns needed to build a lookalike-search row. `lookalike_sim` (candidates.lookalike_sim)
// and `lookalike_search_id` (FK → lookalike_searches.id) come from migration 008.
const SELECT_COLS =
  "id, linkedin_url, linkedin_profile, signal_type, signal_context, status, exported_to_sheet_at, llm_score, llm_reasoning, llm_qualified_at, lookalike_search_id, lookalike_sim";

// Dedicated n8n webhook → dedicated Google Sheet for lookalike-search results.
// Separate from the regular Sheet so the two flows stay legible. Env override
// keeps the secret-rotation story clean.
const N8N_LOOKALIKE_WEBHOOK_URL =
  process.env.N8N_LOOKALIKE_WEBHOOK_URL ||
  "https://hylkewnl.app.n8n.cloud/webhook/09a32e4d-c034-4a01-ac84-b4e117be3956";

/**
 * Build a row for the n8n → Lookalike Sheet payload.
 *
 * Mirrors buildRow() from export-to-sheet.js for the shared fields (naam,
 * bedrijf, rol, ai_score, reasoning, disqualifier, linkedin_url, exported_at)
 * and adds two lookalike-specific columns:
 *  - lookalike_sim: 2-decimal cosine sim between the candidate's profile
 *    embedding and the nearest search-anchor (NOT the workspace exemplars).
 *  - search_name: human-readable label of the lookalike_searches row that
 *    produced this candidate, so the Sheet stays interpretable when multiple
 *    searches share the same destination.
 *
 * `searchNameById` is a Map(candidate.lookalike_search_id → name) that the
 * caller resolves once per request.
 */
export function buildLookalikeRow(candidate, searchNameById) {
  const p = candidate.linkedin_profile ?? {};
  const hasLlm = !!candidate.llm_qualified_at;
  return {
    naam: p.name ?? "",
    bedrijf: p.company ?? "",
    rol: p.role ?? p.headline ?? "",
    ai_score:
      hasLlm && candidate.llm_score != null
        ? String(Math.round(candidate.llm_score))
        : "",
    lookalike_sim:
      candidate.lookalike_sim != null
        ? Number(candidate.lookalike_sim).toFixed(2)
        : "",
    search_name: searchNameById.get(candidate.lookalike_search_id) ?? "",
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

  const { candidateIds, backfillAll, lookalikeSearchId } = req.body || {};
  if (!backfillAll && !lookalikeSearchId && (!Array.isArray(candidateIds) || candidateIds.length === 0)) {
    return res
      .status(400)
      .json({ error: "candidateIds array, backfillAll, or lookalikeSearchId required" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Resolve the candidate set. Always restrict to lookalike-origin rows
  // (lookalike_search_id IS NOT NULL) so this endpoint can never accidentally
  // export a regular discovery candidate to the lookalike Sheet.
  let query = supabase
    .from("candidates")
    .select(SELECT_COLS)
    .eq("status", "qualified")
    .not("lookalike_search_id", "is", null);

  if (lookalikeSearchId) {
    query = query.eq("lookalike_search_id", lookalikeSearchId);
  }
  if (backfillAll || lookalikeSearchId) {
    query = query.is("exported_to_sheet_at", null);
  } else {
    query = query.in("id", candidateIds);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // For caller-supplied candidateIds we still drop already-exported rows
  // (Supabase doesn't filter inside .in()-only queries).
  const candidates = (data ?? []).filter((c) => !c.exported_to_sheet_at);

  if (candidates.length === 0) {
    return res.status(200).json({ exported: 0, skipped: true });
  }

  // Resolve search names in one round-trip (we typically have 1–3 distinct
  // lookalike_search_ids per request).
  const uniqueSearchIds = [...new Set(candidates.map((c) => c.lookalike_search_id))];
  const { data: searchRows } = await supabase
    .from("lookalike_searches")
    .select("id, name")
    .in("id", uniqueSearchIds);
  const searchNameById = new Map((searchRows ?? []).map((s) => [s.id, s.name ?? ""]));

  // POST one row per candidate. n8n's webhook is set to "Respond When Last Node
  // Finishes", so each fetch returns only after the Sheets-append completes —
  // serializing the writes and preventing the "find first empty row" race we
  // hit on the original Sheet.
  //
  // Checkpoint exported_to_sheet_at PER candidate (not in one batched UPDATE at
  // the end). With 200+ candidates a single export easily exceeds Vercel's
  // 5-min function timeout; without the per-row checkpoint the next retry
  // re-pushes everything → duplicate rows in the Sheet. With it, retry only
  // touches what's still pending.
  const exportedIds = [];
  const failed = [];
  for (const c of candidates) {
    try {
      const resp = await fetch(N8N_LOOKALIKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLookalikeRow(c, searchNameById)),
      });
      if (!resp.ok) throw new Error(`n8n webhook returned ${resp.status}`);
      await supabase
        .from("candidates")
        .update({ exported_to_sheet_at: new Date().toISOString() })
        .eq("id", c.id);
      exportedIds.push(c.id);
    } catch (e) {
      failed.push({ id: c.id, message: (e?.message || "unknown").slice(0, 200) });
    }
  }

  return res.status(200).json({ exported: exportedIds.length, failed });
}
