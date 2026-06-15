import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Loader2, MessageSquare, ThumbsUp, FileText } from "lucide-react";
import { listHomeTopLeads } from "../lib/topleads/data";
import { rankTopLeads, combinedScore } from "../lib/topleads/scoring";

const ease = [0.22, 1, 0.36, 1];

function LeadCard({ lead, rank }) {
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
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><FileText className="w-3 h-3" />{ctx.distinctPosts ?? 0} posts</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MessageSquare className="w-3 h-3" />{ctx.commentCount ?? 0}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ThumbsUp className="w-3 h-3" />{ctx.reactionCount ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopLeads() {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listHomeTopLeads().then(setLeads).catch((e) => setError(e.message));
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
