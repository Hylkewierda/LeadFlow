import { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  RotateCcw,
  User,
} from "lucide-react";
import { formatRelative } from "@/lib/leadfinder/format";
import { ScorePill } from "./ScorePill";
import { StatusBadge } from "./StatusBadge";
import { SignalTypeIcon } from "./SignalTypeIcon";
import { DisqualifyMenu } from "./DisqualifyMenu";

const REASON_LABELS = {
  wrong_persona: "Wrong persona",
  competitor_employee: "Competitor employee",
  too_small: "Too small",
  already_customer: "Already a customer",
  bad_geo: "Geography mismatch",
  other: "Other",
};

export function CandidateCard({ candidate, onQualify, onDisqualify, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = candidate.linkedin_profile;

  async function handle(fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const terminal = candidate.status === "qualified" || candidate.status === "disqualified";

  return (
    <li className="glass-card group">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3 sm:flex-1 sm:min-w-0">
          <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-violet-500 text-sm font-semibold text-white">
            {p.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">{p.name}</h3>
              <StatusBadge status={candidate.status} />
              <ScorePill score={candidate.pre_score} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {p.role && (
                <span className="inline-flex items-center gap-1">
                  <User className="w-3.5 h-3.5" aria-hidden />
                  {p.role}
                </span>
              )}
              {p.company && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" aria-hidden />
                  {p.company}
                </span>
              )}
              {p.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" aria-hidden />
                  {p.location}
                </span>
              )}
            </div>
            {p.headline && (
              <p className="mt-1 truncate text-sm text-slate-600">{p.headline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <SignalTypeIcon type={candidate.signal_type} />
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                LinkedIn <ExternalLink className="w-3 h-3" aria-hidden />
              </a>
              <span className="text-xs text-slate-400">
                seen {formatRelative(candidate.updated_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:self-start">
          {!terminal && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle(() => onQualify(candidate.id))}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                Qualify
              </button>
              <DisqualifyMenu
                disabled={busy}
                onDisqualify={(reason, note) =>
                  handle(() => onDisqualify(candidate.id, reason, note))
                }
              />
            </>
          )}
          {terminal && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handle(() => onReset(candidate.id))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Reset to New"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              Reset
            </button>
          )}
        </div>
      </div>

      {candidate.status === "disqualified" && candidate.disqualify_reason && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">
            {REASON_LABELS[candidate.disqualify_reason]}
          </span>
          {candidate.disqualify_note && (
            <>
              {" — "}
              <span className="italic">{candidate.disqualify_note}</span>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
      >
        <span>
          {expanded ? "Hide" : "Show"} signal context (
          {candidate.signal_context.posts.length} posts ·{" "}
          {candidate.signal_context.engagements.length} engagements)
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 px-4 py-3 text-sm">
          {candidate.signal_context.posts.map((post, i) => (
            <div
              key={i}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono">query: &quot;{post.source_query}&quot;</span>
                <span>{formatRelative(post.posted_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{post.post_text}</p>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                <span>{post.likes} likes</span>
                <span>{post.comments} comments</span>
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  Open post ↗
                </a>
              </div>
            </div>
          ))}
          {candidate.signal_context.engagements.map((eng, i) => (
            <div
              key={i}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  <span className="font-medium text-slate-700">{eng.engagement_type}</span>{" "}
                  on <span className="font-medium">{eng.competitor_company}</span>
                </span>
                <span>{formatRelative(eng.engaged_at)}</span>
              </div>
              {eng.engagement_text && (
                <p className="mt-1 whitespace-pre-wrap text-slate-800">
                  &quot;{eng.engagement_text}&quot;
                </p>
              )}
              <div className="mt-1.5 text-xs">
                <a
                  href={eng.competitor_post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  Open competitor post ↗
                </a>
              </div>
            </div>
          ))}
          {candidate.signal_context.posts.length === 0 &&
            candidate.signal_context.engagements.length === 0 && (
              <p className="text-xs italic text-slate-400">No signal context stored.</p>
            )}
        </div>
      )}
    </li>
  );
}
