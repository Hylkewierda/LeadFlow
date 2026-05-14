const LABELS = {
  new: "New",
  rediscovered: "Rediscovered",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

const STYLES = {
  new: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rediscovered: "bg-violet-50 text-violet-700 ring-violet-200",
  qualified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  disqualified: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
