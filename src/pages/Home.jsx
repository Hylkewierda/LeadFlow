import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { ExternalLink, Loader2, Zap, Lock, Activity, Radar, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useWorkflow } from "../components/WorkflowContext";
import MoreInfo from "../components/MoreInfo";

const DAILY_LIMIT = 5;

const WORKFLOW_MODES = [
  { id: "AllPosts", storageId: "all_posts", label: "Account posts", description: "Scrape de posts van een LinkedIn-account", sheetUrl: null, apiMode: "all-posts", requiresUrl: true, info: "Vul de URL in van een LinkedIn-account (bedrijfspagina of persoonlijk profiel) en analyseer wie er op de posts van dat account reageert. Iedereen die interacteert wordt als profiel verzameld en automatisch gekwalificeerd." },
  { id: "SpecificPosts", storageId: "specific_posts_v2", label: "Coming from other profiles", description: "Posts van andere profielen analyseren", sheetUrl: "https://docs.google.com/spreadsheets/d/1VUHdVrfQbsL8nYMoD1nhAq1ayFFpy77W3Eu7je1CdAc", apiMode: "specific-posts", info: "Analyseert alleen de specifieke posts van andere profielen die je hebt toegevoegd aan de gekoppelde Google Sheet. Open de sheet via het icoon rechts om posts toe te voegen voordat je start." },
  { id: "Campaigns", storageId: "campaigns", label: "Campaigns", description: "Campaign leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1UJvwFAZQJ6q_VRp3_MjphJ3bbdAp-JNhe1I08iKlxxU", apiMode: "campaigns", info: "Verwerkt de leads uit je actieve LinkedIn-campagnes. De campagnedata komt uit de gekoppelde Google Sheet (open via het icoon rechts)." },
  { id: "CommentPosts", storageId: "comment_posts", label: "Comment Posts", description: "Comment engagement", sheetUrl: "https://docs.google.com/spreadsheets/d/1y4gPlMXPCSn54FyRc3vpMSDfI-L46LqlHaxmOZacJZo", apiMode: "comment-posts", info: "Focust op profielen die een comment hebben geplaatst op je posts — vaak de warmste interacties. De betrokken posts beheer je in de gekoppelde Google Sheet (open via het icoon rechts)." },
];

const ACCOUNT_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/(company|in)\/[^/?#]+/i;

const getCurrentDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getStorageKey = (storageId) => `limiter_${storageId}_${getCurrentDate()}`;
const getUsageCount = (storageId) => parseInt(localStorage.getItem(getStorageKey(storageId)) || "0", 10);
const incrementUsage = (storageId) => {
  localStorage.setItem(getStorageKey(storageId), String(getUsageCount(storageId) + 1));
};

const cleanupOldDays = () => {
  const currentDate = getCurrentDate();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('limiter_') && !key.includes(currentDate)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
};

export default function Home() {
  const navigate = useNavigate();
  const { workflowRunning, activeWorkflowName, startWorkflow, endWorkflow } = useWorkflow();
  const [isLoading, setIsLoading] = useState(null);
  const [error, setError] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);
  const [usageCounts, setUsageCounts] = useState({});
  const [accountUrl, setAccountUrl] = useState("");

  useEffect(() => {
    cleanupOldDays();
    const counts = {};
    WORKFLOW_MODES.forEach(mode => {
      counts[mode.storageId] = getUsageCount(mode.storageId);
    });
    setUsageCounts(counts);
  }, []);

  const triggerWorkflow = async (mode) => {
    const workflowMode = WORKFLOW_MODES.find(m => m.id === mode);
    const currentUsage = getUsageCount(workflowMode.storageId);

    if (currentUsage >= DAILY_LIMIT) {
      setError(`Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}).`);
      return;
    }

    setIsLoading(mode);
    setError(null);
    setWarningMessage(null);

    if (currentUsage === DAILY_LIMIT - 2) {
      setWarningMessage(`Nog 1 run over vandaag voor ${workflowMode.label}`);
    } else if (currentUsage === DAILY_LIMIT - 1) {
      setWarningMessage(`Laatste run vandaag voor ${workflowMode.label}`);
    }

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: workflowMode.apiMode,
          ...(workflowMode.requiresUrl ? { accountUrl: accountUrl.trim() } : {}),
        }),
      });

      if (response.status === 409) {
        setError(`Er draait al een run voor ${workflowMode.label}.`);
        return;
      }
      if (response.status === 429) {
        setError(`Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}).`);
        return;
      }
      if (!response.ok) throw new Error("Workflow kon niet worden gestart");

      const data = await response.json();
      if (!data.runId) throw new Error("Geen run ID ontvangen van server");
      startWorkflow(workflowMode.label, data.runId);

      incrementUsage(workflowMode.storageId);
      setUsageCounts(prev => ({
        ...prev,
        [workflowMode.storageId]: currentUsage + 1
      }));

      navigate(createPageUrl("WorkflowActivated"));
    } catch {
      endWorkflow("");
      setError("Er ging iets mis. Controleer de verbinding.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">
            Lead Qualifier
          </h1>
          <p className="text-muted-foreground text-[14px] mt-1 italic">
            From connection to qualified lead
          </p>
          <p className="text-muted-foreground text-[13px] mt-2">
            Selecteer een workflow om te starten
          </p>

          <MoreInfo label="Hoe werkt LeadFlow?">
            <p>
              LeadFlow is een geautomatiseerd lead-kwalificatiesysteem voor B2B
              sales. Het verzamelt LinkedIn-profielen, laat AI elk profiel
              scoren op functietitel, branche, bedrijfsgrootte en geografie, en
              sorteert ze automatisch als <strong>GO</strong>,{" "}
              <strong>MAYBE</strong> of <strong>NO-GO</strong>. Gekwalificeerde
              leads gaan door naar HubSpot voor opvolging.
            </p>

            <p className="mt-3 font-semibold text-foreground">De volledige flow</p>
            <ol className="mt-1 list-decimal pl-4 space-y-1">
              <li>Profielen worden verzameld via posts, campagnes of comments.</li>
              <li>Een geautomatiseerde workflow kwalificeert elk profiel met AI.</li>
              <li>Alle contacten worden met hun score opgeslagen in HubSpot.</li>
              <li>In LeadFlow beheer je workflows, bekijk je data en beoordeel je Maybe-leads.</li>
              <li>Gekwalificeerde leads worden benaderd met gepersonaliseerde berichten.</li>
            </ol>

            <p className="mt-3 font-semibold text-foreground">Daglimiet</p>
            <p className="mt-1">
              Elke workflow kan maximaal {DAILY_LIMIT} keer per dag worden
              gestart. De voortgangsbalk onder elke knop toont hoeveel runs je
              nog over hebt; het limiet reset automatisch om middernacht.
            </p>

            <p className="mt-3 font-semibold text-foreground">AutoResearch</p>
            <p className="mt-1">
              Achter de schermen draait een optimalisatieloop die de
              kwalificatieprompt continu verbetert: classificeren met de huidige
              prompt, F1-score meten tegen ground truth (HubSpot-deals + jouw
              Maybe-beoordelingen), fouten analyseren, prompt bijstellen en
              alleen behouden wat de score verbetert. Jouw Maybe-oordelen vloeien
              terug als ground truth en maken het model scherper.
            </p>
          </MoreInfo>
        </motion.div>

        {/* Warning */}
        {warningMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 px-4 py-3 bg-amber-50/80 border border-amber-200/60 rounded-2xl"
          >
            <p className="text-amber-700 text-[13px] font-medium">{warningMessage}</p>
          </motion.div>
        )}

        {/* Workflow cards */}
        <div className="space-y-3">
          {WORKFLOW_MODES.map((mode, index) => {
            const usage = usageCounts[mode.storageId] || 0;
            const isLimitReached = usage >= DAILY_LIMIT;
            const isDisabled = isLoading !== null || isLimitReached || workflowRunning;
            const progress = (usage / DAILY_LIMIT) * 100;
            const urlValid = !mode.requiresUrl || ACCOUNT_URL_RE.test(accountUrl.trim());

            return (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex gap-2.5">
                  {/* Main workflow card */}
                  {mode.requiresUrl ? (
                    <div className={`flex-1 glass-card rounded-2xl p-4 text-left transition-all duration-300 ${isDisabled ? "opacity-50" : ""}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-[15px] font-semibold text-foreground">{mode.label}</h3>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{mode.description}</p>
                        </div>
                        <button
                          onClick={() => triggerWorkflow(mode.id)}
                          disabled={isDisabled || !urlValid}
                          aria-label={`Start ${mode.label}`}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                            isLimitReached ? "bg-muted" : isDisabled || !urlValid ? "bg-foreground/[0.06] cursor-not-allowed" : "group/start bg-foreground/[0.06] hover:bg-accent hover:accent-glow cursor-pointer"
                          }`}
                        >
                          {isLimitReached ? <Lock className="w-4 h-4 text-muted-foreground" />
                            : isLoading === mode.id ? <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                            : <Zap className={`w-4 h-4 transition-colors duration-300 ${isDisabled || !urlValid ? "text-muted-foreground" : "text-foreground/60 group-hover/start:text-white"}`} />}
                        </button>
                      </div>
                      <input
                        type="url"
                        value={accountUrl}
                        onChange={(e) => setAccountUrl(e.target.value)}
                        disabled={isDisabled}
                        placeholder="Vul URL in van het account dat je wil scrapen"
                        className="w-full mb-3 px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                      />
                      {/* Progress bar */}
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${
                              isLimitReached ? 'bg-destructive/60' : 'bg-accent'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ delay: index * 0.08 + 0.3, duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                          {usage}/{DAILY_LIMIT}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => triggerWorkflow(mode.id)}
                      disabled={isDisabled}
                      className={`flex-1 glass-card rounded-2xl p-4 text-left transition-all duration-300 group ${
                        isDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-[15px] font-semibold text-foreground">{mode.label}</h3>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{mode.description}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                          isLimitReached
                            ? 'bg-muted'
                            : 'bg-foreground/[0.06] group-hover:bg-accent group-hover:accent-glow'
                        }`}>
                          {isLimitReached ? (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          ) : isLoading === mode.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                          ) : (
                            <Zap className={`w-4 h-4 transition-colors duration-300 ${
                              isDisabled ? 'text-muted-foreground' : 'text-foreground/60 group-hover:text-white'
                            }`} />
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${
                              isLimitReached ? 'bg-destructive/60' : 'bg-accent'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ delay: index * 0.08 + 0.3, duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                          {usage}/{DAILY_LIMIT}
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Sheet link */}
                  {mode.sheetUrl && (
                    <a
                      href={mode.sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-14 glass-card rounded-2xl flex items-center justify-center transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group/link"
                    >
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover/link:text-accent transition-colors" />
                    </a>
                  )}
                </div>
                {mode.info && <MoreInfo>{mode.info}</MoreInfo>}
              </motion.div>
            );
          })}
        </div>

        {/* Leadfinder card */}
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Open Leadfinder"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: WORKFLOW_MODES.length * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="group mt-3 glass-card rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          onClick={() => navigate(createPageUrl("Leadfinder"))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(createPageUrl("Leadfinder"));
            }
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 ring-1 ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
              <Radar
                className="h-5 w-5 text-emerald-700 transition-colors duration-300 group-hover:text-white"
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-foreground">Leadfinder</h3>
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  KB-discovery
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                KB-gestuurde lead-discovery via LinkedIn. Triage candidates en qualify ze direct naar je Sheet.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </div>
        </motion.div>
        <MoreInfo label="Meer over Leadfinder">
          KB-gestuurde lead-discovery: op basis van je kennisbank stelt Claude een
          playbook op, zoekt het passende LinkedIn-profielen en scoort die direct.
          In de triage-weergave beoordeel je de gevonden kandidaten één voor één en
          kwalificeer je ze rechtstreeks naar je Google Sheet.
        </MoreInfo>

        {/* Lookalike search card */}
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Open Lookalike search"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (WORKFLOW_MODES.length + 1) * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="group mt-3 glass-card rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          onClick={() => navigate(createPageUrl("LookalikeSearch"))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(createPageUrl("LookalikeSearch"));
            }
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 ring-1 ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
              <Sparkles
                className="h-5 w-5 text-emerald-700 transition-colors duration-300 group-hover:text-white"
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-foreground">Lookalike search</h3>
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Anchor-driven
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Plak 1+ LinkedIn-URLs als ICP-anker. Wij distilleren het archetype en zoeken soortgelijke profielen.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </div>
        </motion.div>
        <MoreInfo label="Meer over Lookalike search">
          Plak één of meer LinkedIn-profiel-URL&apos;s als ICP-anker. Wij
          distilleren daaruit het archetype (functie, branche, schaal, regio) en
          zoeken soortgelijke profielen. De resultaten worden gescoord en kun je
          exporteren naar een Google Sheet.
        </MoreInfo>

        {/* Active workflow banner */}
        {workflowRunning && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 glass-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-accent animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-foreground">{activeWorkflowName} is actief</p>
                <p className="text-[11px] text-muted-foreground">Wacht tot deze klaar is</p>
              </div>
              <button
                onClick={() => endWorkflow("")}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Reset
              </button>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 px-4 py-3 bg-destructive/8 border border-destructive/15 rounded-2xl"
          >
            <p className="text-destructive text-[13px] font-medium">{error}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
