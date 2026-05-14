const OPTIONS = [
  { key: "new", label: "New" },
  { key: "rediscovered", label: "Rediscovered" },
  { key: "qualified", label: "Qualified" },
  { key: "disqualified", label: "Disqualified" },
];

export function StatusFilter({ value, onChange, counts }) {
  function toggle(key) {
    if (value.includes(key)) onChange(value.filter((v) => v !== key));
    else onChange([...value, key]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((o) => {
        const active = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => toggle(o.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {o.label}
            <span
              className={`rounded px-1 text-[10px] ${
                active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts[o.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
