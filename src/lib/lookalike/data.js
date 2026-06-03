import { browserSupabase } from "../leadfinder/supabase.js";

/** Submit a new lookalike search. Returns the inserted searchId. */
export async function startLookalikeSearch({ urls, name, feedback }) {
  const resp = await fetch("/api/lookalike-searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, name, feedback }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) errMsg = parsed.error;
    } catch {
      // ignore parse failures, keep HTTP status
    }
    throw new Error(errMsg);
  }
  return JSON.parse(text);
}

/** Fetch one lookalike search by id. Returns null if not found. */
export async function getLookalikeSearch(id) {
  const supabase = browserSupabase();
  const { data, error } = await supabase
    .from("lookalike_searches")
    .select(
      "id, name, source_urls, feedback, status, playbook, candidates_found, candidates_qualified, error, created_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Lookup failed: ${error.message}`);
  return data;
}

/** Trigger the export of finished lookalike candidates to the lookalike Sheet. */
export async function exportLookalikeSearchToSheet(searchId) {
  const resp = await fetch("/api/export-lookalike-to-sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookalikeSearchId: searchId }),
  });
  if (!resp.ok) throw new Error(`Export failed: HTTP ${resp.status}`);
  return resp.json();
}

/** URL of the dedicated lookalike Sheet (LEADFINDER_LOOKALIKES) that n8n writes to. */
export const LOOKALIKE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1bzOLxMINE7HcmYi_4BYZaNfTAy1YGm69JYLImyY6FK0/edit?gid=0#gid=0";
