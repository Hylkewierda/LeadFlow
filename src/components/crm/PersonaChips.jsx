import { PERSONAS } from "@/lib/crm/personas";

// Vijf chips: gevuld (emerald) = persona aanwezig, outline = ontbreekt.
export default function PersonaChips({ personas }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERSONAS.map((p) => {
        const present = personas?.[p.key]?.present;
        return (
          <span
            key={p.key}
            title={present ? personas[p.key].people.join(", ") : `${p.label} ontbreekt`}
            className={`text-[10px] font-medium rounded-md px-1.5 py-0.5 ring-1 ring-inset ${
              present
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-transparent text-foreground/35 ring-foreground/15"
            }`}
          >
            {p.label}
          </span>
        );
      })}
    </div>
  );
}
