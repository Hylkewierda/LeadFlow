import { useEffect, useState } from "react";
import { Check, Loader2, SlidersHorizontal } from "lucide-react";
import { getScopeSteering, saveScopeSteering } from "@/lib/leadfinder/data";

const MAX_CHARS = 1500;

export function ScopeSteeringCard() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getScopeSteering()
      .then((v) => {
        if (active) {
          setText(v);
          setSaved(v);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const dirty = text !== saved;

  async function handleSave() {
    setSaving(true);
    try {
      await saveScopeSteering(text);
      setSaved(text);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      alert(`Opslaan mislukt: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Scope-sturing
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] text-slate-400">
            Stuur in gewone taal waar leads meer of minder op moeten lijken. Geldt voor elke
            volgende run (waar gezocht wordt én hoe gescoord wordt).
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHARS}
            rows={5}
            placeholder="Bijv. focus meer op marketplaces en D2C met >100 mensen; minder op kleine SaaS-startups…"
            className="w-full resize-y rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {text.length}/{MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Opslaan…
                </>
              ) : justSaved ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Opgeslagen
                </>
              ) : (
                "Opslaan"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
