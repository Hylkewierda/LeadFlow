// CRM presentation helpers. All numbers that hit the UI are rounded (invariant §0.7).

/** Score-pill colour bands on a 0–100 scale (design §5 / §8). */
export function scorePillClasses(score) {
  if (score == null) return "bg-slate-100 text-slate-500";
  const s = Math.round(Number(score));
  if (s >= 65) return "bg-emerald-100 text-emerald-700";
  if (s >= 40) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export function roundScore(score) {
  return score == null ? null : Math.round(Number(score));
}

/** Initials for the avatar, max two letters. */
export function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export const STAGES = ["nieuw", "benaderd", "gesprek", "voorstel", "gewonnen", "verloren"];

// The 5 progress stages (verloren is an end-outcome, handled separately).
export const PIPELINE_STAGES = ["nieuw", "benaderd", "gesprek", "voorstel", "gewonnen"];

export const STAGE_META = {
  nieuw: { label: "Nieuw", chip: "bg-slate-100 text-slate-600" },
  benaderd: { label: "Benaderd", chip: "bg-sky-100 text-sky-700" },
  gesprek: { label: "Gesprek", chip: "bg-indigo-100 text-indigo-700" },
  voorstel: { label: "Voorstel", chip: "bg-violet-100 text-violet-700" },
  gewonnen: { label: "Gewonnen", chip: "bg-emerald-100 text-emerald-700" },
  verloren: { label: "Verloren", chip: "bg-rose-100 text-rose-700" },
};

export function stageMeta(stage) {
  return STAGE_META[stage] ?? { label: stage ?? "—", chip: "bg-slate-100 text-slate-600" };
}

export const DISQUALIFY_REASONS = [
  { value: "wrong_persona", label: "Verkeerde persona" },
  { value: "competitor_employee", label: "Werkt bij concurrent" },
  { value: "too_small", label: "Te klein" },
  { value: "already_customer", label: "Al klant" },
  { value: "bad_geo", label: "Verkeerde regio" },
  { value: "other", label: "Anders" },
];

const SIGNAL_LABELS = {
  content: "Content-engagement",
  competitor_engagement: "Concurrent-engagement",
  combined: "Gecombineerd signaal",
  lookalike: "Lookalike",
};

export function signalLabel(signalType) {
  return SIGNAL_LABELS[signalType] ?? signalType ?? null;
}

/** Dutch relative time, rounded. */
export function relativeNL(iso) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} uur geleden`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} dag${day === 1 ? "" : "en"} geleden`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} maand${mo === 1 ? "" : "en"} geleden`;
  return `${Math.floor(day / 365)} jaar geleden`;
}

/** Days since an ISO timestamp (rounded down); used for the "stil >7d" badge. */
export function daysSince(iso) {
  if (!iso) return null;
  return Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Stacked-bar segment widths (integer %) for a won/lost/open split. All 0 when empty. */
export function barSegments(won = 0, lost = 0, open = 0) {
  const total = won + lost + open;
  if (total === 0) return { won: 0, lost: 0, open: 0 };
  return {
    won: Math.round((won / total) * 100),
    lost: Math.round((lost / total) * 100),
    open: Math.round((open / total) * 100),
  };
}

// ---- Follow-up dates ("Vandaag opvolgen") ----
// next_action_at is a YYYY-MM-DD date string; lexical compare == chronological.

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isDue(dateStr) {
  return !!dateStr && dateStr <= todayISO();
}

export function isOverdue(dateStr) {
  return !!dateStr && dateStr < todayISO();
}

const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function formatDateNL(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${Number(d)} ${NL_MONTHS[Number(m) - 1]} ${y}`;
}
