import { createClient } from "@supabase/supabase-js";
import { resolveWorkspaceId } from "../src/lib/crm/companyMatch.js";
import { DISQUALIFY_REASONS } from "../src/lib/crm/format.js";

// CRM win/loss analytics — read-only, workspace-scoped, service-role. Aggregates
// crm_contacts (with the candidate's signal_type embedded) in JS and returns one
// JSON document. Design: docs/superpowers/specs/2026-06-24-crm-winloss-analytics-design.md.

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const SOURCE_LABELS = { candidate: "Candidate", home_top_lead: "Top lead", manual: "Handmatig" };
const SIGNAL_LABELS = { content: "Content", competitor_engagement: "Concurrent", combined: "Gecombineerd", lookalike: "Lookalike", onbekend: "Onbekend" };
const SCORE_BAND_LABEL = { hoog: "65+", midden: "40–64", laag: "<40", onbekend: "Onbekend" };
const SCORE_BAND_ORDER = ["hoog", "midden", "laag", "onbekend"];
const REASON_LABELS = Object.fromEntries(DISQUALIFY_REASONS.map((r) => [r.value, r.label]));

function scoreBandKey(score) {
  if (score == null) return "onbekend";
  const s = Number(score);
  if (s >= 65) return "hoog";
  if (s >= 40) return "midden";
  return "laag";
}

function winRate(won, lost) {
  const closed = won + lost;
  return closed === 0 ? null : Math.round((won / closed) * 100);
}

// Group rows into {key,label,won,lost,open,winRate}. `order` (optional) fixes row
// order; otherwise rows are sorted by total volume descending.
function tally(rows, keyFn, labelFn, order) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, { key, label: labelFn(key), won: 0, lost: 0, open: 0 });
    const b = map.get(key);
    if (r.stage === "gewonnen") b.won++;
    else if (r.stage === "verloren") b.lost++;
    else b.open++;
  }
  const arr = [...map.values()].map((b) => ({ ...b, winRate: winRate(b.won, b.lost) }));
  if (order) arr.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else arr.sort((a, b) => b.won + b.lost + b.open - (a.won + a.lost + a.open));
  return arr;
}

export default async function handler(req, res) {
  const supabase = serverSupabase();
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
    if (!wsId) return res.status(404).json({ error: "Workspace not found" });

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, stage, source, source_score, owner, disqualify_reason, candidate_id, candidates ( signal_type )")
      .eq("workspace_id", wsId);
    if (error) return res.status(500).json({ error: error.message });
    const rows = data ?? [];

    const won = rows.filter((r) => r.stage === "gewonnen").length;
    const lost = rows.filter((r) => r.stage === "verloren").length;
    const open = rows.length - won - lost;
    const totals = { won, lost, open, closed: won + lost, winRate: winRate(won, lost) };

    const signalKey = (r) => r.candidates?.signal_type ?? "onbekend";
    const byDimension = {
      scoreBand: tally(rows, (r) => scoreBandKey(r.source_score), (k) => SCORE_BAND_LABEL[k], SCORE_BAND_ORDER),
      source: tally(rows, (r) => r.source, (k) => SOURCE_LABELS[k] ?? k),
      signalType: tally(rows, signalKey, (k) => SIGNAL_LABELS[k] ?? k),
    };

    const lossMap = new Map();
    for (const r of rows.filter((r) => r.stage === "verloren")) {
      const key = r.disqualify_reason ?? "other";
      lossMap.set(key, (lossMap.get(key) ?? 0) + 1);
    }
    const lossReasons = [...lossMap.entries()]
      .map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] ?? reason, count }))
      .sort((a, b) => b.count - a.count);

    const ownerMap = new Map();
    for (const r of rows.filter((r) => r.stage === "gewonnen" || r.stage === "verloren")) {
      const mk = r.owner ?? "__none__";
      if (!ownerMap.has(mk)) ownerMap.set(mk, { owner: r.owner ?? null, won: 0, lost: 0 });
      const b = ownerMap.get(mk);
      if (r.stage === "gewonnen") b.won++;
      else b.lost++;
    }
    const byOwner = [...ownerMap.values()]
      .map((b) => ({ ...b, winRate: winRate(b.won, b.lost) }))
      .sort((a, b) => b.won + b.lost - (a.won + a.lost));

    return res.status(200).json({ totals, byDimension, lossReasons, byOwner });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
