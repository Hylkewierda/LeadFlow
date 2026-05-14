import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const REASONS = [
  { key: "wrong_persona", label: "Wrong persona" },
  { key: "competitor_employee", label: "Competitor employee" },
  { key: "too_small", label: "Company too small" },
  { key: "already_customer", label: "Already a customer" },
  { key: "bad_geo", label: "Geography mismatch" },
  { key: "other", label: "Other…", needsNote: true },
];

export function DisqualifyMenu({ onDisqualify, disabled }) {
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) {
        setOpen(false);
        setNoteOpen(false);
        setNote("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function pick(reason, withNote) {
    setBusy(true);
    try {
      await onDisqualify(reason, withNote);
      setOpen(false);
      setNoteOpen(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Disqualify
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {!noteOpen ? (
            <ul>
              {REASONS.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (r.needsNote) {
                        setNoteOpen(true);
                      } else {
                        void pick(r.key);
                      }
                    }}
                    className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 p-2">
              <label className="block text-xs font-medium text-slate-600">
                Reason note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Short explanation…"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(false);
                    setNote("");
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!note.trim() || busy}
                  onClick={() => void pick("other", note)}
                  className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  Disqualify
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
