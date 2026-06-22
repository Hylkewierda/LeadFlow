import { createClient } from "@supabase/supabase-js";

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const COMPRESS_MODEL = process.env.ANTHROPIC_COMPRESS_MODEL || "claude-sonnet-4-6";
const MIN_TO_COMPRESS = 4; // not worth an LLM call below this

/**
 * Parse a JSON object out of an LLM text response. Models often wrap JSON in
 * markdown fences or add a sentence of preamble despite instructions, so we
 * strip ```json fences and fall back to the first {...last } slice.
 */
export function extractJsonObject(raw) {
  let t = (raw || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s !== -1 && e > s) t = t.slice(s, e + 1);
  }
  return JSON.parse(t);
}

/**
 * Distil raw human verdicts into compact GO/NO-GO patterns via one Anthropic
 * call. Returns an array of { verdict, pattern } (throws on missing key or
 * unparseable output — the caller maps that to a 500).
 */
async function distilPatterns(rows) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const fmt = (r) => {
    const bits = [r.role, r.company, r.location].filter(Boolean).join(", ");
    return (
      `- [${r.verdict}] ${r.headline || "(geen headline)"}` +
      `${bits ? ` (${bits})` : ""}${r.reasoning ? ` — ${r.reasoning}` : ""}`
    );
  };

  const system =
    "Je distilleert door mensen bevestigde lead-oordelen (GO/NO-GO) voor de Actuals lead-qualifier " +
    "tot een korte set generaliseerbare patronen. Elk patroon is één bondige Nederlandse regel die een " +
    'herkenbaar profieltype koppelt aan GO of NO-GO (bv. "Controller bij D2C e-commerce 10-50M = GO", ' +
    '"Founder bij finance-dienstverlener = NO-GO"). Voeg gelijksoortige oordelen samen; verzin niets dat ' +
    "niet door de input wordt gedragen. Geef UITSLUITEND dit JSON-object terug, geen markdown:\n" +
    '{ "patterns": [ { "verdict": "GO" | "NO-GO", "pattern": "<korte regel>" } ] }';

  const user = `Bevestigde oordelen om te comprimeren:\n${rows.map(fmt).join("\n")}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: COMPRESS_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const t = (await resp.text()).slice(0, 200);
    throw new Error(`Anthropic error ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const text = (json?.content ?? []).map((b) => (b?.type === "text" ? b.text : "")).join("").trim();
  let parsed;
  try {
    parsed = extractJsonObject(text);
  } catch {
    throw new Error("compress: could not parse model output as JSON");
  }
  const patterns = Array.isArray(parsed?.patterns) ? parsed.patterns : [];
  return patterns
    .filter(
      (p) =>
        (p?.verdict === "GO" || p?.verdict === "NO-GO") &&
        typeof p?.pattern === "string" &&
        p.pattern.trim(),
    )
    .map((p) => ({ verdict: p.verdict, pattern: p.pattern.trim() }));
}

export default async function handler(req, res) {
  const supabase = serverSupabase();

  if (req.method === "GET") {
    const slug = (req.query?.workspace || "actuals").trim();
    const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (ws.error) return res.status(500).json({ error: ws.error.message });
    if (!ws.data) return res.status(404).json({ error: `Workspace "${slug}" not found` });
    const { data, error } = await supabase
      .from("qualifier_exemplars")
      .select("id, verdict, headline, role, company, location, reasoning, pinned, source, created_at")
      .eq("workspace_id", ws.data.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ exemplars: data ?? [], count: (data ?? []).length });
  }

  // POST ?action=compress — distil non-pinned raw verdicts into compressed patterns.
  if (req.method === "POST" && req.query?.action === "compress") {
    const slug = (req.query?.workspace || "actuals").trim();
    const ws = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (ws.error) return res.status(500).json({ error: ws.error.message });
    if (!ws.data) return res.status(404).json({ error: `Workspace "${slug}" not found` });

    // Candidates to distil: active (non-archived), non-pinned, raw verdicts.
    const raw = await supabase
      .from("qualifier_exemplars")
      .select("id, verdict, headline, role, company, location, reasoning")
      .eq("workspace_id", ws.data.id)
      .eq("source", "maybe-triage")
      .eq("pinned", false)
      .is("archived_at", null);
    if (raw.error) return res.status(500).json({ error: raw.error.message });
    const rows = raw.data ?? [];
    if (rows.length < MIN_TO_COMPRESS) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        compressed: 0,
        archived: 0,
        reason: `Minder dan ${MIN_TO_COMPRESS} oordelen om te comprimeren`,
      });
    }

    let patterns;
    try {
      patterns = await distilPatterns(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    if (patterns.length === 0) {
      return res.status(500).json({ error: "compress: model returned no usable patterns" });
    }

    // 1) Insert the compressed patterns first (durable before we archive raw rows).
    const ins = await supabase.from("qualifier_exemplars").insert(
      patterns.map((p) => ({
        workspace_id: ws.data.id,
        verdict: p.verdict,
        headline: p.pattern,
        reasoning: `Gecomprimeerd patroon uit ${rows.length} bevestigde oordelen`,
        source: "compressed",
      })),
    );
    if (ins.error) return res.status(500).json({ error: ins.error.message });

    // 2) Archive the raw rows we just distilled (retained for audit, no longer injected).
    const archivedAt = new Date().toISOString();
    const upd = await supabase
      .from("qualifier_exemplars")
      .update({ archived_at: archivedAt })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (upd.error) return res.status(500).json({ error: upd.error.message });

    return res.status(200).json({ ok: true, compressed: patterns.length, archived: rows.length });
  }

  if (req.method === "PATCH") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const pinned = !!(req.body || {}).pinned;
    const { error } = await supabase.from("qualifier_exemplars").update({ pinned }).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { error } = await supabase.from("qualifier_exemplars").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
