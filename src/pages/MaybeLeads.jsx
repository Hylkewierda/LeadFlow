import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, X, Pin, Trash2, Combine } from "lucide-react";
import MoreInfo from "../components/MoreInfo";

const EASE = [0.22, 1, 0.36, 1];
const WARN_AT = 60; // soft warning threshold for the feedback counter

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json()).error || "Request failed");
  return r.json();
}
async function sendJSON(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json()).error || "Request failed");
  return r.json();
}

export default function MaybeLeads() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("triage"); // "triage" | "manage"

  const leads = useQuery({
    queryKey: ["maybe-leads"],
    queryFn: () => getJSON("/api/maybe-leads?workspace=actuals"),
  });
  const exemplars = useQuery({
    queryKey: ["qualifier-exemplars"],
    queryFn: () => getJSON("/api/qualifier-exemplars?workspace=actuals"),
  });

  const verdict = useMutation({
    mutationFn: ({ candidateId, v }) =>
      sendJSON("/api/maybe-leads", "POST", { candidateId, verdict: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maybe-leads"] });
      qc.invalidateQueries({ queryKey: ["qualifier-exemplars"] });
    },
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }) => sendJSON(`/api/qualifier-exemplars?id=${id}`, "PATCH", { pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualifier-exemplars"] }),
  });
  const remove = useMutation({
    mutationFn: ({ id }) => sendJSON(`/api/qualifier-exemplars?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualifier-exemplars"] }),
  });
  const compress = useMutation({
    mutationFn: () => sendJSON("/api/qualifier-exemplars?workspace=actuals&action=compress", "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualifier-exemplars"] }),
  });

  const count = exemplars.data?.count ?? 0;
  const items = leads.data?.candidates ?? [];

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-6">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">Maybe Leads</h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Leads met een score van 40–64 die je handmatig beoordeelt. Je oordeel traint de qualifier voor de volgende run.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab("triage")} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${tab === "triage" ? "bg-emerald-600 text-white" : "bg-foreground/[0.06] text-foreground/70"}`}>
            Te beoordelen ({items.length})
          </button>
          <button onClick={() => setTab("manage")} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${tab === "manage" ? "bg-emerald-600 text-white" : "bg-foreground/[0.06] text-foreground/70"}`}>
            Bevestigd ({count})
          </button>
        </div>

        {tab === "manage" && count >= WARN_AT && (
          <div className="glass-card rounded-xl p-3 mb-3 text-[12px] text-amber-700 bg-amber-50/60">
            Je hebt {count} bevestigde oordelen. Overweeg minder waardevolle te verwijderen of te comprimeren — dit blok wordt elke run in de qualifier-prompt geladen.
          </div>
        )}

        {tab === "triage" && (
          <div className="space-y-3">
            {leads.isLoading && <p className="text-[13px] text-muted-foreground">Laden…</p>}
            {!leads.isLoading && items.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Geen maybe-leads om te beoordelen. 🎉</p>
            )}
            {items.map((c) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="glass-card rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-foreground truncate">{c.headline || c.name || "Onbekend profiel"}</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                      {[c.role, c.company, c.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-600 bg-amber-100 rounded-md px-2 py-0.5 flex-shrink-0">{Math.round(c.llm_score)}</span>
                </div>
                {c.llm_reasoning && <p className="text-[12px] text-foreground/70 mt-2 leading-relaxed">{c.llm_reasoning}</p>}
                <div className="flex gap-2 mt-3">
                  <button disabled={verdict.isPending} onClick={() => verdict.mutate({ candidateId: c.id, v: "GO" })} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50">
                    <Check className="w-4 h-4" /> GO
                  </button>
                  <button disabled={verdict.isPending} onClick={() => verdict.mutate({ candidateId: c.id, v: "NO-GO" })} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.06] text-foreground/70 text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50">
                    <X className="w-4 h-4" /> NO-GO
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {tab === "manage" && count > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              onClick={() => compress.mutate()}
              disabled={compress.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 hover:bg-foreground/[0.1] active:scale-[0.98] transition-all disabled:opacity-50"
              title="Distilleer de losse oordelen tot compacte patronen"
            >
              <Combine className="w-3.5 h-3.5" />
              {compress.isPending ? "Comprimeren…" : "Comprimeer oordelen"}
            </button>
            {compress.isSuccess && !compress.isPending && (
              <span className="text-[11px] text-muted-foreground">
                {compress.data?.skipped
                  ? compress.data?.reason
                  : `${compress.data?.compressed} patroon/patronen uit ${compress.data?.archived} oordelen`}
              </span>
            )}
            {compress.isError && (
              <span className="text-[11px] text-rose-600">Comprimeren mislukt</span>
            )}
          </div>
        )}

        {tab === "manage" && (
          <div className="space-y-2">
            {(exemplars.data?.exemplars ?? []).map((e) => (
              <div key={e.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
                <span className={`text-[11px] font-semibold rounded-md px-2 py-0.5 ${e.verdict === "GO" ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100"}`}>{e.verdict}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{e.headline || "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{[e.role, e.company].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => pin.mutate({ id: e.id, pinned: !e.pinned })} className={`p-1.5 rounded-lg ${e.pinned ? "text-emerald-600" : "text-foreground/30"}`} title="Pin">
                  <Pin className="w-4 h-4" />
                </button>
                <button onClick={() => remove.mutate({ id: e.id })} className="p-1.5 rounded-lg text-foreground/30 hover:text-rose-600" title="Verwijder">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {count === 0 && <p className="text-[13px] text-muted-foreground">Nog geen bevestigde oordelen.</p>}
          </div>
        )}

        <MoreInfo label="Hoe werkt dit?">
          <p>Elke lead krijgt een AI-score. <strong>40–64</strong> = MAYBE en komt hier terecht. Jouw GO/NO-GO bevestigt de lead én wordt als voorbeeld meegegeven aan de qualifier, zodat de eerste pass van de volgende run beter scoort. Bevestigde oordelen beheer je onder "Bevestigd"; pin de belangrijkste zodat ze nooit worden opgeschoond.</p>
        </MoreInfo>
      </div>
    </div>
  );
}
