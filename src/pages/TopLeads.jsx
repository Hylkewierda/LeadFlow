import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Loader2, MessageSquare, ThumbsUp, FileText, Activity, Users, MessageSquarePlus } from "lucide-react";
import { listHomeTopLeads, getLatestAudienceInsight, getQualifierFeedback, saveQualifierFeedback } from "../lib/topleads/data";
import { rankTopLeads, combinedScore } from "../lib/topleads/scoring";

const ease = [0.22, 1, 0.36, 1];

function LeadCard({ lead, rank = null }) {
  const p = lead.profile || {};
  const ctx = lead.signal_context || {};
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {rank != null && (
          <div className="w-7 h-7 rounded-lg bg-emerald-600/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[12px] font-bold text-emerald-700">{rank}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-foreground hover:text-emerald-700 truncate block">
            {p.name || lead.linkedin_url}
          </a>
          {(p.headline || p.company) && (
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{[p.headline, p.company].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">ICP {Math.round(lead.icp_score)}</span>
            <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Engagement {Math.round(lead.engagement_score)}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Activity className="w-3 h-3" />{ctx.interactionCount ?? 0} interacties</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><FileText className="w-3 h-3" />{ctx.distinctPosts ?? 0} posts</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MessageSquare className="w-3 h-3" />{ctx.commentCount ?? 0}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ThumbsUp className="w-3 h-3" />{ctx.reactionCount ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudienceInsightCard({ insight }) {
  const a = insight.audience_insight || {};
  const d = a.distribution || {};
  const companies = (a.top_companies || []).slice(0, 3);
  return (
    <div className="glass-card rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-emerald-700" />
        <h2 className="text-[13px] font-semibold text-foreground">
          Publiek laatste run · {insight.mode}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] text-muted-foreground">{a.analyzed ?? 0} van {a.total_interactions ?? 0} beoordeeld</span>
        <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">GO {d.go ?? 0}</span>
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700">MAYBE {d.maybe ?? 0}</span>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">NO-GO {d.nogo ?? 0}</span>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">ICP-fit {a.icp_fit_pct ?? 0}%</span>
      </div>
      {companies.length > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2">
          Top bedrijven: {companies.map((c) => `${c.name} (${c.count})`).join(" · ")}
        </p>
      )}
      {a.conclusion && <p className="text-[13px] text-foreground/90">{a.conclusion}</p>}
    </div>
  );
}

const MAX_FEEDBACK = 3000;

function QualifierFeedbackCard() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(null); // "saving" | "saved" | error string
  const [entry, setEntry] = useState("");

  useEffect(() => {
    getQualifierFeedback().then((t) => { setText(t); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  function addEntry() {
    const e = entry.trim();
    if (!e) return;
    const date = new Date().toISOString().slice(0, 10);
    setText((prev) => (prev ? `${prev}\n` : "") + `- ${date}: ${e}`);
    setEntry("");
  }

  async function save() {
    setStatus("saving");
    try { await saveQualifierFeedback(text); setStatus("saved"); }
    catch (err) { setStatus(err.message); }
  }

  const over = text.length > MAX_FEEDBACK;
  return (
    <div className="glass-card rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquarePlus className="w-4 h-4 text-emerald-700" />
        <h2 className="text-[13px] font-semibold text-foreground">Qualifier-feedback (stuurt de volgende runs)</h2>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus(null); }}
        rows={6}
        placeholder="Bv. — 2026-06-17: scoor junior accountants niet als GO; weeg e-commerce/marketplaces zwaarder."
        className="w-full text-[13px] rounded-xl border border-foreground/10 bg-background/50 p-3 font-mono"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className={`text-[11px] ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{text.length} / {MAX_FEEDBACK}{over ? " — wordt afgekapt" : ""}</span>
        <button onClick={save} disabled={!loaded || status === "saving"} className="rounded-lg bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50">
          {status === "saving" ? "Bewaren…" : "Bewaar"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addEntry(); }}
          placeholder="Snel een regel toevoegen…"
          className="flex-1 text-[12px] rounded-lg border border-foreground/10 bg-background/50 px-2 py-1.5"
        />
        <button onClick={addEntry} className="text-[12px] text-emerald-700 font-semibold px-2 py-1.5">+ toevoegen</button>
      </div>
      {status === "saved" && <p className="mt-2 text-[11px] text-emerald-700">Opgeslagen — geldt vanaf je volgende run.</p>}
      {status && status !== "saving" && status !== "saved" && <p className="mt-2 text-[11px] text-destructive">{status}</p>}
    </div>
  );
}

export default function TopLeads() {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    listHomeTopLeads().then(setLeads).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    getLatestAudienceInsight().then(setInsight).catch(() => setInsight(null));
  }, []);

  const top10 = leads ? rankTopLeads(leads, 10) : [];
  const rest = leads ? [...leads].sort((a, b) => combinedScore(b) - combinedScore(a)) : [];

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center">
              <Trophy className="w-4.5 h-4.5 text-background" strokeWidth={2} />
            </div>
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Top leads</h1>
          </div>
          <p className="text-muted-foreground text-[13px] mt-2">De beste GO-leads, gewogen op profiel-fit én engagement.</p>
        </motion.div>

        {insight && <AudienceInsightCard insight={insight} />}
        <QualifierFeedbackCard />

        {error && <div className="px-4 py-3 bg-destructive/8 border border-destructive/15 rounded-2xl"><p className="text-destructive text-[13px] font-medium">{error}</p></div>}
        {!leads && !error && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

        {leads && leads.length === 0 && <p className="text-[13px] text-muted-foreground">Nog geen leads — start een workflow op Home.</p>}

        {top10.length > 0 && (
          <>
            <h2 className="text-[13px] font-semibold text-foreground mb-2">Top 10</h2>
            <div className="space-y-2.5 mb-8">
              {top10.map((lead, i) => <LeadCard key={lead.id} lead={lead} rank={i + 1} />)}
            </div>
          </>
        )}

        {rest.length > 10 && (
          <>
            <h2 className="text-[13px] font-semibold text-foreground mb-2">Alle GO-leads ({rest.length})</h2>
            <div className="space-y-2.5">
              {rest.slice(10).map((lead) => <LeadCard key={lead.id} lead={lead} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
