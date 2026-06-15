import { ExternalLink, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import MoreInfo from "../components/MoreInfo";

const MAYBE_LEADS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1l3Ceas2AVQV-P3Cy6-j44WW3J84SvnbcVNhnsPgPsKU/edit?gid=0#gid=0";

export default function MaybeLeads() {
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
            Maybe Leads
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Leads die een score tussen 35-49 hebben en handmatig beoordeeld
            moeten worden
          </p>
        </motion.div>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card rounded-2xl p-5 mb-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HelpCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">
                Wat zijn Maybe Leads?
              </h3>
              <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                De AI qualifier geeft elke lead een score en kwalificatie: GO
                (score &ge; 50), MAYBE (35-49) of NO-GO (&lt; 35). Maybe leads
                hebben potentie maar te weinig data om automatisch te
                kwalificeren. Bekijk ze in de sheet en beoordeel handmatig of ze
                alsnog GO of NO-GO zijn.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Sheet link */}
        <motion.a
          href={MAYBE_LEADS_SHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center group-hover:bg-accent group-hover:accent-glow transition-all duration-300">
            <HelpCircle className="w-4.5 h-4.5 text-foreground/60 group-hover:text-white transition-colors" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-foreground">
              Bekijk Maybe Leads
            </h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Filter op kolom &ldquo;qualification&rdquo; = MAYBE
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
        </motion.a>

        <MoreInfo label="Hoe werkt de score & beoordeling?">
          <p className="font-semibold text-foreground">Het scoringsysteem</p>
          <p className="mt-1">
            Elke lead krijgt een gewogen totaalscore over vier dimensies:
          </p>
          <ul className="mt-1 list-disc pl-4 space-y-1">
            <li><strong>Functietitel (40%)</strong> — bv. Controller, CFO, Finance Manager</li>
            <li><strong>Branche-fit (25%)</strong> — bv. E-commerce, SaaS, FinTech</li>
            <li><strong>Bedrijf &amp; schaal (20%)</strong> — bekend bedrijf, past bij ICP</li>
            <li><strong>Geografie (15%)</strong> — bv. DACH, Nederland, Nordics</li>
          </ul>
          <p className="mt-2">
            Drempels: <strong>GO</strong> bij score &ge; 50 (automatisch
            gekwalificeerd), <strong>MAYBE</strong> bij 35–49 (handmatige review),{" "}
            <strong>NO-GO</strong> bij &lt; 35 (niet gekwalificeerd).
          </p>

          <p className="mt-3 font-semibold text-foreground">Een Maybe-lead beoordelen</p>
          <ol className="mt-1 list-decimal pl-4 space-y-1">
            <li>Open de Maybe Leads Google Sheet via de knop hierboven.</li>
            <li>Bekijk de profieldata en de AI-reasoning per lead.</li>
            <li>Vul je oordeel in: YES (alsnog GO) of NO (definitief NO-GO).</li>
            <li>Je beoordeling vloeit terug als ground truth en verbetert het AI-model.</li>
          </ol>
        </MoreInfo>
      </div>
    </div>
  );
}
