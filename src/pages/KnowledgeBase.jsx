import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, Loader2, Plus, Sparkles } from "lucide-react";

const EASING = [0.22, 1, 0.36, 1];
const KB_PREFIX = "kb/actuals/";
const CATEGORIES = ["Product", "Klanten", "ICP", "Overig"];

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Quick update
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState(null); // { ok, text }

  // Editor
  const [selected, setSelected] = useState(null); // { path, sha, content }
  const [editText, setEditText] = useState("");
  const [openingPath, setOpeningPath] = useState(null);
  const [savingFile, setSavingFile] = useState(false);
  const [fileMessage, setFileMessage] = useState(null);

  // New file
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTree = async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/kb?op=tree");
      if (!r.ok) throw new Error();
      const data = await r.json();
      setFiles(data.files ?? []);
    } catch {
      setLoadError("Kon de knowledge base niet laden.");
    }
  };

  useEffect(() => {
    (async () => { await loadTree(); setLoading(false); })();
  }, []);

  const grouped = useMemo(() => {
    const groups = {};
    for (const f of files) {
      const rel = f.path.slice(KB_PREFIX.length);
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "Algemeen";
      (groups[dir] ??= []).push({ path: f.path, name: rel.slice(rel.lastIndexOf("/") + 1) });
    }
    return Object.entries(groups).sort(([a], [b]) => (a === "Algemeen" ? -1 : b === "Algemeen" ? 1 : a.localeCompare(b)));
  }, [files]);

  const submitNote = async () => {
    setSavingNote(true);
    setNoteMessage(null);
    try {
      const r = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "quick-update", note: note.trim(), ...(category ? { category } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Opslaan mislukt");
      setNote("");
      setCategory("");
      setNoteMessage({ ok: true, text: "Toegevoegd — telt mee vanaf de eerstvolgende run." });
      await loadTree();
    } catch (err) {
      setNoteMessage({ ok: false, text: err.message });
    } finally {
      setSavingNote(false);
    }
  };

  const openFile = async (path) => {
    setOpeningPath(path);
    setFileMessage(null);
    try {
      const r = await fetch(`/api/kb?op=file&path=${encodeURIComponent(path)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Kon bestand niet openen");
      setSelected(data);
      setEditText(data.content);
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setOpeningPath(null);
    }
  };

  const saveFile = async () => {
    setSavingFile(true);
    setFileMessage(null);
    try {
      const r = await fetch("/api/kb", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, content: editText, sha: selected.sha }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) {
        // Conflict: refetch the latest sha so a retry can succeed; keep the user's edit.
        const cur = await fetch(`/api/kb?op=file&path=${encodeURIComponent(selected.path)}`);
        const curData = await cur.json().catch(() => ({}));
        if (cur.ok) setSelected(curData);
        throw new Error("Bestand was intussen gewijzigd — nieuwste versie opgehaald; opnieuw opslaan overschrijft die.");
      }
      if (!r.ok) throw new Error(data.error || "Opslaan mislukt");
      setSelected({ ...selected, sha: data.sha, content: editText });
      setFileMessage({ ok: true, text: "Opgeslagen — live vanaf de eerstvolgende run." });
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setSavingFile(false);
    }
  };

  const createFile = async () => {
    const name = newName.trim().replace(/\.md$/i, "");
    if (!name) return;
    setCreating(true);
    setFileMessage(null);
    try {
      const path = `${KB_PREFIX}${name}.md`;
      const content = `# ${name}\n\n`;
      const r = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", path, content }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Aanmaken mislukt");
      setNewName("");
      await loadTree();
      await openFile(path);
    } catch (err) {
      setFileMessage({ ok: false, text: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASING }} className="mb-6">
          <button onClick={() => navigate(createPageUrl("Leadfinder"))} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Leadfinder
          </button>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-accent" /> Knowledge base
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Wat de leadfinder weet over Actuals. Wijzigingen tellen mee vanaf de eerstvolgende run.
          </p>
        </motion.div>

        {/* Quick update */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5, ease: EASING }} className="glass-card rounded-2xl p-4 mb-4">
          <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-1.5 mb-1">
            <Sparkles className="w-4 h-4 text-accent" /> Snelle update
          </h3>
          <p className="text-[12px] text-muted-foreground mb-3">
            Iets nieuws binnen Actuals? Typ het hier — de leadfinder neemt het direct mee.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Bijv. 'Nieuwe Adyen-connector live; ICP nu ook quick commerce in DACH.'"
            className="w-full px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Categorie (optioneel)</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={submitNote}
              disabled={savingNote || !note.trim()}
              className={`ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                savingNote || !note.trim() ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-accent text-white hover:accent-glow"
              }`}
            >
              {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toevoegen"}
            </button>
          </div>
          {noteMessage && (
            <p className={`text-[12px] mt-2 ${noteMessage.ok ? "text-accent" : "text-destructive"}`}>{noteMessage.text}</p>
          )}
        </motion.div>

        {/* Editor or file list */}
        {selected ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASING }} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { setSelected(null); setFileMessage(null); }} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Alle bestanden
              </button>
              <span className="text-[12px] font-medium text-muted-foreground truncate ml-3">{selected.path.slice(KB_PREFIX.length)}</span>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] font-mono text-foreground focus:outline-none focus:border-accent transition-colors"
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={saveFile}
                disabled={savingFile || editText === selected.content}
                className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                  savingFile || editText === selected.content ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-accent text-white hover:accent-glow"
                }`}
              >
                {savingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Opslaan"}
              </button>
            </div>
            {fileMessage && (
              <p className={`text-[12px] mt-2 ${fileMessage.ok ? "text-accent" : "text-destructive"}`}>{fileMessage.text}</p>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: EASING }} className="glass-card rounded-2xl p-4">
            <h3 className="text-[15px] font-semibold text-foreground mb-3">Bestanden</h3>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : loadError ? (
              <p className="text-[13px] text-destructive">{loadError}</p>
            ) : (
              <div className="space-y-4">
                {grouped.map(([dir, items]) => (
                  <div key={dir}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{dir}</p>
                    <div className="space-y-1">
                      {items.map((f) => (
                        <button
                          key={f.path}
                          onClick={() => openFile(f.path)}
                          disabled={openingPath !== null}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[13px] text-foreground hover:bg-foreground/[0.04] transition-colors"
                        >
                          {openingPath === f.path ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t border-foreground/[0.06]">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="nieuw-bestand"
                    className="flex-1 px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                  />
                  <button
                    onClick={createFile}
                    disabled={creating || !newName.trim()}
                    className={`px-3 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-1 transition-all ${
                      creating || !newName.trim() ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-foreground/[0.06] text-foreground hover:bg-accent hover:text-white"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Nieuw
                  </button>
                </div>
                {fileMessage && !selected && (
                  <p className={`text-[12px] ${fileMessage.ok ? "text-accent" : "text-destructive"}`}>{fileMessage.text}</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
