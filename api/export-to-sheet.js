import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const SHEET_RANGE = "Sheet1!A:H";
const SELECT_COLS =
  "id, linkedin_url, linkedin_profile, pre_score, signal_type, signal_context, status, exported_to_sheet_at";

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

export function buildRow(candidate) {
  const p = candidate.linkedin_profile ?? {};
  return [
    p.name ?? "",
    p.company ?? "",
    p.role ?? p.headline ?? "",
    candidate.pre_score != null ? String(candidate.pre_score) : "",
    formatReasoning(candidate),
    disqualifierFlag(p),
    candidate.linkedin_url ?? "",
    new Date().toISOString(),
  ];
}

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
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

  // Resolve the candidate set
  let candidates;
  if (backfillAll) {
    const { data, error } = await supabase
      .from("candidates")
      .select(SELECT_COLS)
      .eq("status", "qualified")
      .is("exported_to_sheet_at", null);
    if (error) return res.status(500).json({ error: error.message });
    candidates = data ?? [];
  } else {
    const { data, error } = await supabase.from("candidates").select(SELECT_COLS).in("id", candidateIds);
    if (error) return res.status(500).json({ error: error.message });
    // Idempotency: never write a candidate that's already in the sheet
    candidates = (data ?? []).filter((c) => !c.exported_to_sheet_at);
  }

  if (candidates.length === 0) {
    return res.status(200).json({ exported: 0, skipped: true });
  }

  // Append rows to the Google Sheet
  const rows = candidates.map(buildRow);
  try {
    const sheets = sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  } catch (e) {
    return res.status(502).json({ error: `Sheet append failed: ${(e?.message || "unknown").slice(0, 200)}` });
  }

  // Mark exported so re-qualify / backfill won't double-write
  const now = new Date().toISOString();
  const ids = candidates.map((c) => c.id);
  await supabase.from("candidates").update({ exported_to_sheet_at: now }).in("id", ids);

  return res.status(200).json({ exported: candidates.length, ids });
}
