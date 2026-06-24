import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Building2, UserPlus, UserMinus, Radio, MessageSquarePlus, Sparkles, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCrmContact, useClaimContact, useAddNote, useGenerateOutreach, useScheduleFollowup } from "@/lib/crm/hooks";
import { createPageUrl } from "@/utils";
import StageStepper from "@/components/crm/StageStepper";
import {
  scorePillClasses,
  roundScore,
  initials,
  stageMeta,
  signalLabel,
  relativeNL,
  addDaysISO,
  formatDateNL,
} from "@/lib/crm/format";

const EASE = [0.22, 1, 0.36, 1];

const NOTE_KIND_LABEL = { note: "Notitie", contact_moment: "Contactmoment", stage_change: "Stage-wijziging" };

function Field({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-foreground/[0.05] last:border-0">
      <span className="text-[12px] text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-[12px] text-foreground/80 text-right">{value}</span>
    </div>
  );
}

export default function CrmContact() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.email ?? null;

  const { data, isLoading, isError, error } = useCrmContact(id);
  const claim = useClaimContact();
  const addNote = useAddNote();

  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState("note");

  const generateOutreach = useGenerateOutreach();
  const schedule = useScheduleFollowup();
  const [draft, setDraft] = useState("");
  const [kbAvailable, setKbAvailable] = useState(true);
  const [copyState, setCopyState] = useState(null); // null | "ok" | "failed"

  const generate = () => {
    setCopyState(null);
    generateOutreach.mutate(
      { contactId: id },
      { onSuccess: (d) => { setDraft(d.message); setKbAvailable(d.kbAvailable); } },
    );
  };

  const copyAndLog = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      copied = false;
    }
    addNote.mutate(
      { id, body: draft, kind: "contact_moment", author: me },
      { onSuccess: () => setCopyState(copied ? "ok" : "failed") },
    );
  };

  if (!id) return <Empty msg="Geen contact geselecteerd." />;
  if (isLoading) return <Empty msg="Laden…" />;
  if (isError) return <Empty msg={error?.message || "Fout bij laden."} />;

  const contact = data?.contact;
  if (!contact) return <Empty msg="Contact niet gevonden." />;

  const notes = data?.notes ?? [];
  const sp = data?.source_profile;
  const profile = sp?.kind === "candidate" ? sp.linkedin_profile : sp?.kind === "home_top_lead" ? sp.profile : null;
  const company = contact.crm_companies;
  const score = roundScore(contact.source_score);
  const stage = stageMeta(contact.stage);
  const sig = signalLabel(sp?.signal_type);
  const reasoning = sp?.llm_reasoning;

  const submitNote = () => {
    if (!noteBody.trim()) return;
    addNote.mutate(
      { id, body: noteBody.trim(), kind: noteKind, author: me },
      { onSuccess: () => setNoteBody("") },
    );
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-foreground/60 hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="glass-card-elevated rounded-2xl p-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[14px] font-semibold text-foreground/70">
              {initials(contact.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-[18px] font-bold tracking-tight text-foreground truncate">{contact.full_name}</h1>
                  <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                    {[contact.role, company?.name].filter(Boolean).join(" · ") || contact.headline || "—"}
                  </p>
                </div>
                {score != null && (
                  <span className={`text-[12px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0 ${scorePillClasses(score)}`}>{score}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${stage.chip}`}>{stage.label}</span>
                {sig && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/60 bg-foreground/[0.05] rounded-md px-2 py-0.5">
                    <Radio className="w-3 h-3" /> {sig}
                  </span>
                )}
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline">
                    <ExternalLink className="w-3 h-3" /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Claim */}
          <div className="mt-3 flex items-center justify-between gap-2">
            {contact.owner ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground/70">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold">{initials(contact.owner)}</span>
                Geclaimd door {contact.owner}
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">Ongeclaimd</span>
            )}
            {contact.owner === me ? (
              <button onClick={() => claim.mutate({ id, owner: null })} disabled={claim.isPending} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/60 hover:text-foreground rounded-lg px-3 py-1.5 bg-foreground/[0.05] disabled:opacity-50">
                <UserMinus className="w-3.5 h-3.5" /> Loslaten
              </button>
            ) : (
              <button onClick={() => claim.mutate({ id, owner: me })} disabled={claim.isPending || !me} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white bg-emerald-600 rounded-lg px-3 py-1.5 disabled:opacity-50">
                <UserPlus className="w-3.5 h-3.5" /> Claim
              </button>
            )}
          </div>
        </motion.div>

        {/* Stage stepper */}
        <div className="glass-card rounded-2xl p-4 mb-3">
          <h2 className="text-[13px] font-semibold text-foreground mb-2.5">Fase</h2>
          <StageStepper contactId={id} stage={contact.stage} />
        </div>

        {/* Volg op */}
        <div className="glass-card rounded-2xl p-4 mb-3">
          <h2 className="text-[13px] font-semibold text-foreground mb-1.5">Volg op</h2>
          <p className="text-[12px] text-foreground/70">
            {contact.next_action_at ? `Gepland: ${formatDateNL(contact.next_action_at)}` : "Geen opvolging gepland"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button onClick={() => schedule.mutate({ id, next_action_at: addDaysISO(1) })} disabled={schedule.isPending} className="rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 disabled:opacity-50">Morgen</button>
            <button onClick={() => schedule.mutate({ id, next_action_at: addDaysISO(3) })} disabled={schedule.isPending} className="rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 disabled:opacity-50">+3 dagen</button>
            <button onClick={() => schedule.mutate({ id, next_action_at: addDaysISO(7) })} disabled={schedule.isPending} className="rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 disabled:opacity-50">Volgende week</button>
            <input
              type="date"
              onChange={(e) => e.target.value && schedule.mutate({ id, next_action_at: e.target.value })}
              className="text-[12px] rounded-lg border border-foreground/10 bg-background px-2 py-1.5"
            />
            {contact.next_action_at && (
              <button onClick={() => schedule.mutate({ id, next_action_at: null })} disabled={schedule.isPending} className="rounded-lg text-rose-600/80 hover:text-rose-700 text-[12px] font-medium px-2 py-1.5 disabled:opacity-50">Wissen</button>
            )}
          </div>
        </div>

        {/* Score + reasoning */}
        {reasoning && (
          <div className="glass-card rounded-2xl p-4 mb-3">
            <h2 className="text-[13px] font-semibold text-foreground mb-1.5">Kwalificatie-redenering</h2>
            <p className="text-[12px] text-foreground/70 leading-relaxed">{reasoning}</p>
          </div>
        )}

        {/* Outreach */}
        <div className="glass-card rounded-2xl p-4 mb-3">
          <h2 className="text-[13px] font-semibold text-foreground mb-2.5">Outreach</h2>
          {!draft && (
            <button
              onClick={generate}
              disabled={generateOutreach.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium px-3 py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {generateOutreach.isPending ? "Genereren…" : "Genereer bericht"}
            </button>
          )}
          {generateOutreach.isError && (
            <p className="text-[12px] text-rose-600 mt-2">{generateOutreach.error?.message || "Genereren mislukt."}</p>
          )}
          {draft && (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="w-full text-[13px] rounded-xl border border-foreground/10 bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              {!kbAvailable && (
                <p className="text-[11px] text-amber-700 mt-1.5">Actuals-context (KB) even niet beschikbaar — bericht zonder KB gegenereerd.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  onClick={copyAndLog}
                  disabled={addNote.isPending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" /> Kopieer & markeer benaderd
                </button>
                <button
                  onClick={generate}
                  disabled={generateOutreach.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Regenereer
                </button>
                {copyState === "ok" && <span className="text-[11px] text-emerald-700">Gekopieerd ✓</span>}
                {copyState === "failed" && <span className="text-[11px] text-amber-700">Kopiëren mislukt — plak handmatig</span>}
              </div>
            </>
          )}
        </div>

        {/* Full profile */}
        {profile && (
          <div className="glass-card rounded-2xl p-4 mb-3">
            <h2 className="text-[13px] font-semibold text-foreground mb-1.5">Profiel</h2>
            <Field label="Naam" value={profile.name} />
            <Field label="Headline" value={profile.headline} />
            <Field label="Rol" value={profile.role} />
            <Field label="Bedrijf" value={profile.company} />
            <Field label="Locatie" value={profile.location} />
            {profile.about && <p className="text-[12px] text-foreground/70 leading-relaxed mt-2">{profile.about}</p>}
          </div>
        )}

        {/* Signal context */}
        {sp?.signal_context && Object.keys(sp.signal_context).length > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-3">
            <h2 className="text-[13px] font-semibold text-foreground mb-1.5">Signaal-context</h2>
            <pre className="text-[11px] text-foreground/60 leading-relaxed whitespace-pre-wrap break-words">
              {JSON.stringify(sp.signal_context, null, 2)}
            </pre>
          </div>
        )}

        {/* Company link */}
        {company?.id && (
          <Link to={`${createPageUrl("CrmCompany")}?id=${company.id}`} className="glass-card rounded-2xl p-4 mb-3 flex items-center gap-2 hover:bg-foreground/[0.02] transition-colors">
            <Building2 className="w-4 h-4 text-foreground/50" />
            <span className="text-[13px] font-medium text-foreground flex-1">{company.name}</span>
            <span className="text-[12px] text-emerald-700">Bekijk bedrijf →</span>
          </Link>
        )}

        {/* Notes timeline */}
        <div className="glass-card rounded-2xl p-4">
          <h2 className="text-[13px] font-semibold text-foreground mb-2.5">Notities & activiteit</h2>

          {/* Add note */}
          <div className="mb-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Voeg een notitie of contactmoment toe…"
              rows={2}
              className="w-full text-[13px] rounded-xl border border-foreground/10 bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <div className="flex items-center gap-2 mt-2">
              <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)} className="text-[12px] rounded-lg border border-foreground/10 bg-background px-2 py-1.5">
                <option value="note">Notitie</option>
                <option value="contact_moment">Contactmoment</option>
              </select>
              <button
                onClick={submitNote}
                disabled={addNote.isPending || !noteBody.trim()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" /> Toevoegen
              </button>
            </div>
            {noteKind === "contact_moment" && contact.stage === "nieuw" && (
              <p className="text-[11px] text-muted-foreground mt-1.5">Een contactmoment zet de fase automatisch op “benaderd”.</p>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-2.5">
            {notes.length === 0 && <p className="text-[13px] text-muted-foreground">Nog geen notities.</p>}
            {notes.map((n) => (
              <div key={n.id} className="border-l-2 border-foreground/10 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{NOTE_KIND_LABEL[n.kind] ?? n.kind}</span>
                  <span className="text-[10px] text-muted-foreground">{relativeNL(n.created_at)}</span>
                  {n.author && <span className="text-[10px] text-muted-foreground">· {n.author}</span>}
                </div>
                <p className="text-[12px] text-foreground/80 mt-0.5 leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10">
      <div className="w-full max-w-lg">
        <Link to={createPageUrl("CrmDashboard")} className="inline-flex items-center gap-1.5 text-[13px] text-foreground/60 hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> CRM
        </Link>
        <p className="text-[13px] text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}
