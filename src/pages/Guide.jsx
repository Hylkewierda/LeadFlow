import React, { useState } from "react";
import {
  BookOpen,
  Zap,
  BarChart3,
  HelpCircle,
  MessageSquare,
  Users,
  ChevronDown,
  Workflow,
  Target,
  Brain,
  ArrowRight,
  Sparkles,
  Shield,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

const SECTIONS = [
  {
    id: "overview",
    icon: Sparkles,
    iconBg: "bg-accent/10",
    iconColor: "text-accent",
    title: "Wat is LeadFlow?",
    content: (
      <>
        <p>
          LeadFlow is een geautomatiseerd lead-kwalificatiesysteem voor B2B sales.
          Het analyseert LinkedIn-profielen en kwalificeert ze automatisch als
          potentiële klanten op basis van functietitel, branche, bedrijfsgrootte en
          geografie.
        </p>
        <div className="mt-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3.5">
          <p className="text-[12px] font-semibold text-foreground mb-2">
            Hoe het werkt in het kort:
          </p>
          <div className="space-y-2">
            {[
              "LinkedIn profielen worden verzameld via n8n workflows",
              "AI analyseert elk profiel en geeft een kwalificatiescore",
              "Leads worden automatisch gesorteerd: GO, MAYBE of NO-GO",
              "Gekwalificeerde leads gaan naar HubSpot voor opvolging",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[11px] font-bold text-accent bg-accent/10 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    id: "workflows",
    icon: Zap,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    title: "Workflows starten",
    subtitle: "Home pagina",
    content: (
      <>
        <p>
          Op de Home pagina kun je vier verschillende workflows starten. Elke
          workflow heeft een dagelijks limiet van 5 runs.
        </p>
        <div className="mt-4 space-y-2.5">
          {[
            {
              name: "All Posts",
              desc: "Analyseert alle recente LinkedIn posts en verzamelt profielen van mensen die geïnterageerd hebben.",
            },
            {
              name: "Specific Posts",
              desc: "Analyseer alleen specifieke posts die je hebt toegevoegd aan de bijbehorende Google Sheet.",
            },
            {
              name: "Campaigns",
              desc: "Verwerkt leads uit actieve LinkedIn campagnes.",
            },
            {
              name: "Comment Posts",
              desc: "Focust op profielen die comments hebben geplaatst op je posts.",
            },
          ].map((mode, i) => (
            <div
              key={i}
              className="rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3"
            >
              <p className="text-[13px] font-semibold text-foreground">
                {mode.name}
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                {mode.desc}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-accent/[0.06] border border-accent/[0.12] p-3.5">
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Dagelijks limiet:</span>{" "}
              elke workflow kan maximaal 5 keer per dag worden gestart. De voortgangsbalk
              toont hoeveel runs je nog over hebt. Het limiet reset automatisch om
              middernacht.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "scoring",
    icon: Brain,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Scoringsysteem",
    content: (
      <>
        <p>
          Elke lead wordt beoordeeld op vier dimensies en krijgt een gewogen
          totaalscore:
        </p>
        <div className="mt-4 space-y-2">
          {[
            { dim: "Functietitel", weight: "40%", example: "Controller, CFO, Finance Manager" },
            { dim: "Branche-fit", weight: "25%", example: "E-commerce, SaaS, FinTech" },
            { dim: "Bedrijf & schaal", weight: "20%", example: "Bekend bedrijf, past bij ICP" },
            { dim: "Geografie", weight: "15%", example: "DACH, Nederland, Nordics" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3"
            >
              <div className="text-[13px] font-bold text-accent tabular-nums w-10 text-right flex-shrink-0">
                {item.weight}
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-foreground">
                  {item.dim}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {item.example}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3.5">
          <p className="text-[12px] font-semibold text-foreground mb-2.5">
            Kwalificatie-drempels:
          </p>
          <div className="space-y-2">
            {[
              { label: "GO", range: "Score ≥ 50", color: "bg-emerald-500", desc: "Automatisch gekwalificeerd" },
              { label: "MAYBE", range: "Score 35–49", color: "bg-amber-400", desc: "Handmatige review nodig" },
              { label: "NO-GO", range: "Score < 35", color: "bg-red-400", desc: "Niet gekwalificeerd" },
            ].map((q) => (
              <div key={q.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${q.color} flex-shrink-0`} />
                <span className="text-[12px] font-bold text-foreground w-16">
                  {q.label}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums w-20">
                  {q.range}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {q.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    id: "interactions",
    icon: BarChart3,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "Interactions & Reasoning",
    subtitle: "Interactions pagina",
    content: (
      <>
        <p>
          De Interactions pagina geeft je toegang tot vier Google Sheets met
          gedetailleerde data over de verwerkte leads:
        </p>
        <div className="mt-3 space-y-2">
          {[
            { name: "Post Interactions", desc: "Wie heeft geïnterageerd met je posts (likes, comments, shares)" },
            { name: "Campaign Interactions", desc: "Leaddata uit je LinkedIn campagnes" },
            { name: "Comment Interactions", desc: "Specifieke comment-engagement per post" },
            { name: "AI Reasoning", desc: "Gedetailleerde uitleg van de AI per lead — waarom een bepaalde score is gegeven" },
          ].map((sheet, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[12px] font-semibold text-foreground">{sheet.name}</span>
                <span className="text-[12px] text-muted-foreground"> — {sheet.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "maybe",
    icon: HelpCircle,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    title: "Maybe Leads beoordelen",
    subtitle: "Maybe pagina",
    content: (
      <>
        <p>
          Leads met een score tussen 35 en 49 worden als "Maybe" geclassificeerd.
          Deze leads hebben potentie maar onvoldoende data voor een automatische
          beslissing.
        </p>
        <div className="mt-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3.5">
          <p className="text-[12px] font-semibold text-foreground mb-2">
            Hoe beoordeel je een Maybe Lead?
          </p>
          <div className="space-y-2">
            {[
              "Open de Maybe Leads Google Sheet via de link op de pagina",
              "Bekijk de profieldata en AI reasoning per lead",
              "Vul in de kolom je oordeel in: YES (alsnog GO) of NO (definitief NO-GO)",
              "Je beoordeling wordt gebruikt om het AI-model te verbeteren",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    id: "leads",
    icon: MessageSquare,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    title: "Validated Leads & Berichten",
    subtitle: "Leads pagina",
    content: (
      <>
        <p>
          Op de Leads pagina vind je alle leads die gekwalificeerd zijn (score ≥ 50)
          en klaar zijn voor opvolging.
        </p>
        <div className="mt-3 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-[12px] font-semibold text-foreground">HubSpot Leads</span>
              <span className="text-[12px] text-muted-foreground">
                {" "}— bekijk en beheer gekwalificeerde leads direct in HubSpot
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-[12px] font-semibold text-foreground">Bericht genereren</span>
              <span className="text-[12px] text-muted-foreground">
                {" "}— start een workflow die gepersonaliseerde berichten aanmaakt voor je leads
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-[12px] font-semibold text-foreground">Validated Leads Sheet</span>
              <span className="text-[12px] text-muted-foreground">
                {" "}— overzicht van alle gevalideerde leads met hun scores en data
              </span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "database",
    icon: Users,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    title: "Client Database",
    subtitle: "Database pagina",
    content: (
      <>
        <p>
          De Database pagina linkt direct naar je HubSpot contacten. Hier vind je
          alle contacten die door LeadFlow zijn aangemaakt of bijgewerkt.
        </p>
        <div className="mt-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3.5">
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Alle leads die door het systeem worden verwerkt — ongeacht hun
            kwalificatie — worden als contact opgeslagen in HubSpot. Zo bouw je een
            compleet overzicht op van alle geanalyseerde profielen.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "autoresearch",
    icon: RefreshCw,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    title: "AutoResearch (prompt optimalisatie)",
    content: (
      <>
        <p>
          Achter de schermen draait een optimalisatieloop die de
          lead-kwalificatieprompt continu verbetert.
        </p>
        <div className="mt-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] p-3.5">
          <p className="text-[12px] font-semibold text-foreground mb-2.5">
            De loop in 5 stappen:
          </p>
          <div className="space-y-2">
            {[
              { step: "Export", desc: "Ground truth ophalen uit HubSpot deals en handmatige beoordelingen" },
              { step: "Classificeer", desc: "AI classificeert alle leads met de huidige prompt" },
              { step: "Meet", desc: "F1-score, precision en recall berekenen" },
              { step: "Analyseer", desc: "Fouten identificeren en prompt aanpassen" },
              { step: "Evalueer", desc: "Verbeterd? Behouden. Verslechterd? Revert en opnieuw proberen" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <span className="text-[12px] font-semibold text-foreground">{item.step}</span>
                  <span className="text-[12px] text-muted-foreground"> — {item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-accent/[0.06] border border-accent/[0.12] p-3.5">
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Doel:</span>{" "}
              F1-score maximaliseren — de balans tussen precision (hoeveel
              "gekwalificeerde" leads daadwerkelijk goed zijn) en recall (hoeveel
              echte goede leads we vinden). Je Maybe Lead beoordelingen vloeien
              terug als ground truth en verbeteren het model.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "flow",
    icon: Workflow,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    title: "Volledige flow",
    content: (
      <>
        <p>
          Zo werkt het gehele systeem van begin tot eind:
        </p>
        <div className="mt-4 space-y-0">
          {[
            { label: "LinkedIn", desc: "Profielen worden verzameld via posts, campagnes of comments" },
            { label: "n8n Workflow", desc: "Automatische verwerking en AI-kwalificatie van elk profiel" },
            { label: "HubSpot", desc: "Alle contacten worden opgeslagen met scores en kwalificaties" },
            { label: "LeadFlow App", desc: "Beheer workflows, bekijk data, beoordeel maybe leads" },
            { label: "Opvolging", desc: "Gekwalificeerde leads worden benaderd met gepersonaliseerde berichten" },
          ].map((item, i, arr) => (
            <div key={i} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-bold text-accent">{i + 1}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className="w-px flex-1 bg-accent/20 my-1" />
                )}
              </div>
              <div className={`flex-1 ${i < arr.length - 1 ? "pb-4" : ""}`}>
                <p className="text-[13px] font-semibold text-foreground">
                  {item.label}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
];

function AccordionItem({ section, index, isOpen, onToggle }) {
  const Icon = section.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.5, ease }}
    >
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full p-4 flex items-center gap-3 text-left transition-colors duration-200 hover:bg-black/[0.02]"
        >
          <div
            className={`w-8 h-8 rounded-lg ${section.iconBg} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className={`w-4 h-4 ${section.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground">
              {section.title}
            </h3>
            {section.subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {section.subtitle}
              </p>
            )}
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0 text-[12.5px] text-muted-foreground leading-relaxed">
                {section.content}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function Guide() {
  const [openSections, setOpenSections] = useState(new Set(["overview"]));

  const toggleSection = (id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center">
              <BookOpen className="w-4.5 h-4.5 text-background" strokeWidth={2} />
            </div>
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">
              Gebruiksaanwijzing
            </h1>
          </div>
          <p className="text-muted-foreground text-[13px] mt-2">
            Alles wat je moet weten over LeadFlow — van workflows starten tot
            leads kwalificeren
          </p>
        </motion.div>

        {/* Accordion sections */}
        <div className="space-y-2.5">
          {SECTIONS.map((section, index) => (
            <AccordionItem
              key={section.id}
              section={section}
              index={index}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
