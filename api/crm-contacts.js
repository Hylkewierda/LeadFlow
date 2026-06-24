import { createClient } from "@supabase/supabase-js";
import { normalizeDedupKey } from "../src/lib/dedupKey.js";
import { resolveWorkspaceId, upsertCompany } from "../src/lib/crm/companyMatch.js";
import { fetchKbText } from "../src/lib/kb/readKb.js";
import { buildOutreachPrompt } from "../src/lib/crm/outreachPrompt.js";

const OUTREACH_MODEL = process.env.ANTHROPIC_OUTREACH_MODEL || "claude-sonnet-4-6";

// CRM contacts route — list / get / create / update-stage / claim / add-note.
// All writes use the service-role key; every query is explicitly workspace-scoped
// (invariant §0.5 / §6 — never lean on RLS). Design: crm/leadflow-crm-design.md §7.

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const STAGES = ["nieuw", "benaderd", "gesprek", "voorstel", "gewonnen", "verloren"];
const DISQUALIFY_REASONS = [
  "wrong_persona",
  "competitor_employee",
  "too_small",
  "already_customer",
  "bad_geo",
  "other",
];

const CONTACT_COLS =
  "id, workspace_id, candidate_id, company_id, linkedin_url, full_name, headline, role, location, source, source_score, stage, owner, disqualify_reason, last_activity_at, next_action_at, created_at, updated_at";

export default async function handler(req, res) {
  const supabase = serverSupabase();

  try {
    // ---- GET: list (with filters) or get-by-id ----
    if (req.method === "GET") {
      const id = req.query?.id;
      const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
      if (!wsId) return res.status(404).json({ error: "Workspace not found" });

      if (id) {
        const c = await supabase
          .from("crm_contacts")
          .select(`${CONTACT_COLS}, crm_companies ( id, name, linkedin_company_url, domain, industry, size_bucket, location )`)
          .eq("workspace_id", wsId)
          .eq("id", id)
          .maybeSingle();
        if (c.error) return res.status(500).json({ error: c.error.message });
        if (!c.data) return res.status(404).json({ error: "Contact not found" });

        const notes = await supabase
          .from("crm_notes")
          .select("id, author, kind, body, created_at")
          .eq("contact_id", id)
          .order("created_at", { ascending: false });
        if (notes.error) return res.status(500).json({ error: notes.error.message });

        // Pull the originating profile/signal so the detail view has full context.
        let source_profile = null;
        if (c.data.candidate_id) {
          const cand = await supabase
            .from("candidates")
            .select("linkedin_profile, signal_type, signal_context, llm_score, llm_reasoning, status")
            .eq("id", c.data.candidate_id)
            .maybeSingle();
          if (!cand.error && cand.data) source_profile = { kind: "candidate", ...cand.data };
        }
        if (!source_profile) {
          const htl = await supabase
            .from("home_top_leads")
            .select("profile, icp_score, engagement_score, source_mode, signal_context")
            .eq("workspace_id", wsId)
            .eq("linkedin_url", c.data.linkedin_url)
            .maybeSingle();
          if (!htl.error && htl.data) source_profile = { kind: "home_top_lead", ...htl.data };
        }

        return res.status(200).json({ contact: c.data, notes: notes.data ?? [], source_profile });
      }

      // List with optional filters.
      let q = supabase
        .from("crm_contacts")
        .select(`${CONTACT_COLS}, crm_companies ( id, name )`)
        .eq("workspace_id", wsId);

      const { stage, owner, company_id, q: search } = req.query || {};
      if (stage) q = q.in("stage", String(stage).split(",").filter(Boolean));
      if (owner === "none") q = q.is("owner", null);
      else if (owner) q = q.eq("owner", owner);
      if (company_id) q = q.eq("company_id", company_id);
      if (search) q = q.ilike("full_name", `%${String(search).replace(/[%_]/g, "")}%`);

      q = q.order("last_activity_at", { ascending: true });
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ contacts: data ?? [] });
    }

    // ---- POST: create (no action) or add-note (?action=note) ----
    if (req.method === "POST") {
      const action = req.query?.action;
      const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
      if (!wsId) return res.status(404).json({ error: "Workspace not found" });

      // Generate a first outreach message from the contact's context + the live KB.
      // Stateless: returns text only, logs nothing, changes no stage. (Folded in here
      // rather than a separate route to stay under the Vercel 12-function limit.)
      if (action === "outreach") {
        const id = req.query?.id;
        if (!id) return res.status(400).json({ error: "Missing id" });

        const oc = await supabase
          .from("crm_contacts")
          .select("id, full_name, role, headline, location, linkedin_url, stage, crm_companies ( name ), candidates ( signal_type, signal_context, llm_reasoning, linkedin_profile )")
          .eq("workspace_id", wsId)
          .eq("id", id)
          .maybeSingle();
        if (oc.error) return res.status(500).json({ error: oc.error.message });
        if (!oc.data) return res.status(404).json({ error: "Contact not found" });

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
          contact: oc.data,
          candidate: oc.data.candidates || null,
          companyName: oc.data.crm_companies?.name ?? null,
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
      }

      if (action === "note") {
        const id = req.query?.id;
        if (!id) return res.status(400).json({ error: "Missing id" });
        const body = req.body || {};
        if (!body.body || !String(body.body).trim()) {
          return res.status(400).json({ error: "Note body required" });
        }
        const kind = ["note", "contact_moment", "stage_change"].includes(body.kind) ? body.kind : "note";

        const contact = await supabase
          .from("crm_contacts")
          .select("id, stage")
          .eq("workspace_id", wsId)
          .eq("id", id)
          .maybeSingle();
        if (contact.error) return res.status(500).json({ error: contact.error.message });
        if (!contact.data) return res.status(404).json({ error: "Contact not found" });

        const ins = await supabase.from("crm_notes").insert({
          workspace_id: wsId,
          contact_id: id,
          author: body.author ?? null,
          kind,
          body: String(body.body).trim(),
        });
        if (ins.error) return res.status(500).json({ error: ins.error.message });

        // A logged contact moment advances nieuw → benaderd automatically (§4) and
        // clears next_action_at (the follow-up is done).
        if (kind === "contact_moment" && contact.data.stage === "nieuw") {
          const adv = await supabase.rpc("crm_set_stage", {
            p_contact_id: id,
            p_stage: "benaderd",
            p_note_body: "Automatisch benaderd na contactmoment",
            p_author: body.author ?? null,
          });
          if (adv.error) return res.status(500).json({ error: adv.error.message });
          await supabase.from("crm_contacts").update({ next_action_at: null }).eq("id", id);
        } else {
          const patch = { last_activity_at: new Date().toISOString() };
          if (kind === "contact_moment") patch.next_action_at = null;
          await supabase.from("crm_contacts").update(patch).eq("id", id);
        }
        return res.status(200).json({ ok: true });
      }

      // Create a contact. Snapshot from a candidate / home_top_lead when an id is
      // given, else from the supplied fields (manual). Company is upserted + linked.
      const body = req.body || {};
      const source = body.source;
      if (!["candidate", "home_top_lead", "manual"].includes(source)) {
        return res.status(400).json({ error: "source must be candidate | home_top_lead | manual" });
      }

      let snapshot = {
        linkedin_url: body.linkedin_url ?? null,
        full_name: body.full_name ?? null,
        headline: body.headline ?? null,
        role: body.role ?? null,
        location: body.location ?? null,
        candidate_id: null,
        source_score: body.source_score ?? null,
        company: body.company ?? null, // { name, linkedinCompanyUrl, ... }
      };

      if (source === "candidate" && body.candidateId) {
        const cand = await supabase
          .from("candidates")
          .select("id, workspace_id, linkedin_url, linkedin_profile, llm_score")
          .eq("id", body.candidateId)
          .maybeSingle();
        if (cand.error) return res.status(500).json({ error: cand.error.message });
        if (!cand.data) return res.status(404).json({ error: "Candidate not found" });
        if (cand.data.workspace_id !== wsId) return res.status(400).json({ error: "Candidate is in another workspace" });
        const p = cand.data.linkedin_profile || {};
        snapshot = {
          linkedin_url: cand.data.linkedin_url,
          full_name: p.name ?? "Onbekend",
          headline: p.headline ?? null,
          role: p.role ?? null,
          location: p.location ?? null,
          candidate_id: cand.data.id,
          source_score: cand.data.llm_score ?? null,
          company: { name: p.company ?? null },
        };
      } else if (source === "home_top_lead") {
        const htl = await supabase
          .from("home_top_leads")
          .select("linkedin_url, profile, icp_score")
          .eq("workspace_id", wsId)
          .eq("linkedin_url", body.linkedin_url)
          .maybeSingle();
        if (htl.error) return res.status(500).json({ error: htl.error.message });
        if (!htl.data) return res.status(404).json({ error: "Home top lead not found" });
        const p = htl.data.profile || {};
        snapshot = {
          linkedin_url: htl.data.linkedin_url,
          full_name: p.name ?? "Onbekend",
          headline: p.headline ?? null,
          role: p.role ?? null,
          location: p.location ?? null,
          candidate_id: null,
          source_score: htl.data.icp_score ?? null,
          company: { name: p.company ?? null },
        };
      }

      if (!snapshot.linkedin_url) return res.status(400).json({ error: "linkedin_url required" });
      if (!snapshot.full_name) return res.status(400).json({ error: "full_name required" });

      const companyId = await upsertCompany(supabase, wsId, snapshot.company || {});

      const row = {
        workspace_id: wsId,
        candidate_id: snapshot.candidate_id,
        company_id: companyId,
        linkedin_url: snapshot.linkedin_url,
        full_name: snapshot.full_name,
        headline: snapshot.headline,
        role: snapshot.role,
        location: snapshot.location,
        source,
        source_score: snapshot.source_score,
        owner: body.owner ?? null,
      };

      const ins = await supabase.from("crm_contacts").insert(row).select(CONTACT_COLS).maybeSingle();
      if (!ins.error && ins.data) return res.status(201).json({ contact: ins.data, created: true });

      // Idempotent on (workspace_id, linkedin_url): return the existing row.
      if (ins.error?.code === "23505") {
        const existing = await supabase
          .from("crm_contacts")
          .select(CONTACT_COLS)
          .eq("workspace_id", wsId)
          .eq("linkedin_url", snapshot.linkedin_url)
          .maybeSingle();
        if (existing.error) return res.status(500).json({ error: existing.error.message });
        return res.status(200).json({ contact: existing.data, created: false });
      }
      return res.status(500).json({ error: ins.error?.message || "insert failed" });
    }

    // ---- PATCH: ?action=stage  |  ?action=claim ----
    if (req.method === "PATCH") {
      const id = req.query?.id;
      const action = req.query?.action;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const wsId = await resolveWorkspaceId(supabase, req.query?.workspace);
      if (!wsId) return res.status(404).json({ error: "Workspace not found" });
      const body = req.body || {};

      if (action === "claim") {
        // owner null/empty -> unclaim.
        const owner = body.owner ? String(body.owner) : null;
        const upd = await supabase
          .from("crm_contacts")
          .update({ owner })
          .eq("workspace_id", wsId)
          .eq("id", id)
          .select(CONTACT_COLS)
          .maybeSingle();
        if (upd.error) return res.status(500).json({ error: upd.error.message });
        if (!upd.data) return res.status(404).json({ error: "Contact not found" });
        return res.status(200).json({ contact: upd.data });
      }

      if (action === "schedule") {
        const next = body.next_action_at ?? null;
        if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(next))) {
          return res.status(400).json({ error: "next_action_at must be YYYY-MM-DD or null" });
        }
        const upd = await supabase
          .from("crm_contacts")
          .update({ next_action_at: next })
          .eq("workspace_id", wsId)
          .eq("id", id)
          .select(CONTACT_COLS)
          .maybeSingle();
        if (upd.error) return res.status(500).json({ error: upd.error.message });
        if (!upd.data) return res.status(404).json({ error: "Contact not found" });
        return res.status(200).json({ contact: upd.data });
      }

      if (action === "stage") {
        const stage = body.stage;
        if (!STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of ${STAGES.join(", ")}` });

        const contact = await supabase
          .from("crm_contacts")
          .select("id, role, crm_companies ( name )")
          .eq("workspace_id", wsId)
          .eq("id", id)
          .maybeSingle();
        if (contact.error) return res.status(500).json({ error: contact.error.message });
        if (!contact.data) return res.status(404).json({ error: "Contact not found" });

        let disqualifyReason = null;
        if (stage === "verloren") {
          disqualifyReason = body.disqualify_reason;
          if (!DISQUALIFY_REASONS.includes(disqualifyReason)) {
            return res.status(400).json({ error: `verloren requires disqualify_reason in ${DISQUALIFY_REASONS.join(", ")}` });
          }
        }

        // Build the feedback-loop payload for outcome stages (dedup_key reuses the
        // shared JS helper — single source of truth with the maybe-triage path).
        let dedupKey = null;
        let exemplarCompany = null;
        let exemplarReasoning = null;
        const companyName = contact.data.crm_companies?.name ?? null;
        if (stage === "gewonnen" || stage === "verloren") {
          const verdict = stage === "gewonnen" ? "GO" : "NO-GO";
          dedupKey = normalizeDedupKey(contact.data.role, companyName, verdict);
          exemplarCompany = companyName;
          exemplarReasoning =
            stage === "gewonnen"
              ? body.note?.trim() || "Gewonnen deal (CRM-uitkomst)"
              : [disqualifyReason, body.note?.trim()].filter(Boolean).join(" — ");
        }

        const rpc = await supabase.rpc("crm_set_stage", {
          p_contact_id: id,
          p_stage: stage,
          p_disqualify_reason: disqualifyReason,
          p_note_body: body.note?.trim() || null,
          p_author: body.author ?? null,
          p_dedup_key: dedupKey,
          p_exemplar_company: exemplarCompany,
          p_exemplar_reasoning: exemplarReasoning,
        });
        if (rpc.error) return res.status(500).json({ error: rpc.error.message });
        return res.status(200).json({ contact: Array.isArray(rpc.data) ? rpc.data[0] : rpc.data });
      }

      return res.status(400).json({ error: "Unknown PATCH action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
