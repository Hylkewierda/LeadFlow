# AutoResearch Loop - LeadFlow

> **Let op (8 sept 2026):** dit document beschrijft de werking van de loop, maar de
> concrete cijfers (dimensies, gewichten, drempels) zijn verouderd. De actuele prompt
> staat in `qualify_prompt.md` (5 dimensies, drempels GO ≥ 65 / MAYBE 40–64) en de
> meetgeschiedenis in `results/experiment_log.csv`. Vertrouw op die twee, niet op de
> getallen hieronder.

## Wat is het?

Een geautomatiseerde optimalisatieloop die de **lead-kwalificatieprompt** (`qualify_prompt.md`) iteratief verbetert door te meten hoe goed de prompt leads classificeert ten opzichte van bekende uitkomsten (ground truth).

## Doel

De F1-score maximaliseren voor het automatisch kwalificeren van B2B sales leads voor Actuals.io. F1 is de balans tussen precision (hoeveel van de "gekwalificeerde" leads daadwerkelijk goed zijn) en recall (hoeveel echte goede leads we vinden).

---

## Hoe werkt de loop?

```
┌─────────────────────────────────────────────────────┐
│                  AUTORESEARCH LOOP                   │
│                                                     │
│  1. EXPORT ─────────────────────────────────────┐   │
│     python evaluate.py export                    │   │
│     Haalt ground truth op uit:                   │   │
│     - HubSpot deals (closedwon/closedlost)       │   │
│     - Human verdicts (Google Sheet)              │   │
│     Output: leads_to_classify.json (182 leads)   │   │
│                                                  ▼   │
│  2. CLASSIFICEER ────────────────────────────────┐   │
│     Claude leest qualify_prompt.md               │   │
│     + leads_to_classify.json                     │   │
│     Classificeert elke lead → score + GO/NO-GO   │   │
│     Output: classifications.json                 │   │
│                                                  ▼   │
│  3. MEET ────────────────────────────────────────┐   │
│     python evaluate.py metrics                   │   │
│     Vergelijkt classificaties vs ground truth    │   │
│     Output: F1, precision, recall, accuracy      │   │
│     + top 10 fouten (false positives/negatives)  │   │
│                                                  ▼   │
│  4. ANALYSEER & VERBETER ────────────────────────┐   │
│     Bekijk de fouten                             │   │
│     Pas qualify_prompt.md aan (1-2 wijzigingen)  │   │
│     Ga terug naar stap 2                         │   │
│                                                  ▼   │
│  5. EVALUEER ────────────────────────────────────┐   │
│     F1 verbeterd? → Houd de wijziging            │   │
│     F1 verslechterd? → Revert, probeer iets      │   │
│                        anders                    │   │
│                                                     │
│  STOP als: 10 iteraties bereikt OF F1 > 0.90        │
└─────────────────────────────────────────────────────┘
```

---

## Bestanden & hun rol

| Bestand | Rol |
|---------|-----|
| `program.md` | Instructies voor de loop (het "recept" dat Claude volgt) |
| `qualify_prompt.md` | **De prompt die geoptimaliseerd wordt** - bevat scoring rubric |
| `evaluate.py` | Python script voor export en metrics berekening |
| `hubspot_client.py` | Haalt contacten en deals op uit HubSpot API |
| `config.py` | Laadt environment variables |
| `.env` | API keys (HubSpot, Groq) en configuratie |
| `results/leads_to_classify.json` | Dataset van 182 leads met profieldata |
| `results/ground_truth_cache.json` | Gecachte labels (deal gewonnen/verloren + human verdicts) |
| `results/classifications.json` | LLM-classificaties per lead |
| `results/experiment_log.csv` | Logboek van alle iteraties met metrics |
| `results/maybe_verdicts.json` | Handmatige beoordelingen uit Google Sheet |

---

## De kwalificatieprompt (qualify_prompt.md)

De prompt scoort leads op vier dimensies:

| Dimensie | Gewicht | Wat wordt beoordeeld |
|----------|---------|---------------------|
| **Functietitel** | 40% | Controller (90), CFO (80), Finance roles (40-78), Non-finance (10) |
| **Branche-fit** | 25% | E-commerce, SaaS, FinTech etc. (80) vs onbekend (45) |
| **Bedrijf & schaal** | 20% | Bekend & passend bij ICP (70), onbekend (50), geen bedrijf (40) |
| **Geografie** | 15% | DACH/NL (80), Nordics/UK/US (65), overig (40) |

**Drempelwaarden:**
- Score >= 50 → **GO** (gekwalificeerd)
- Score 35-49 → **MAYBE** (handmatige review nodig)
- Score < 35 → **NO-GO**

---

## Ground truth: waar komen de labels vandaan?

**Bron 1: HubSpot deals (~122 leads)**
- Alle deals met status "closedwon" of "closedlost"
- Won = gekwalificeerd, Lost = niet gekwalificeerd

**Bron 2: Human verdicts (~60 leads)**
- Handmatige beoordeling via Google Sheet (Maybe Leads pagina)
- YES/NO kolom door team ingevuld
- Bij overlap wint het menselijke oordeel

**Totaal: 182 leads met bekende uitkomst**

---

## Huidige status

| Iteratie | F1 | Precision | Recall | Status |
|----------|-----|-----------|--------|--------|
| 0 (baseline) | 0.065 | 0.667 | 0.034 | baseline |
| 1 | 0.088 | 0.333 | 0.051 | improved |
| 2 | 0.492 | 0.356 | 0.797 | improved |
| 3 | 0.495 | 0.540 | 0.458 | rejected |
| 4 | 0.605 | 0.476 | 0.831 | **kept** |

**Huidige best: F1 = 0.605** (iteratie 4)
- Sterke recall (83% van goede leads gevonden)
- Matige precision (47.6% van positieve classificaties klopt)
- Grootste verbeterpunt: te veel false positives (54 stuks)

---

## Integratie met LeadFlow frontend

```
LinkedIn profielen → n8n workflows → HubSpot
                                        ↕
                              Autoresearch loop
                              (optimaliseert prompt)
                                        ↕
                              qualify_prompt.md
                                        ↓
                              Productie-classificatie
                                        ↓
                              React frontend (LeadFlow)
                              ├── Maybe Leads pagina
                              └── Client Database
```

- **MaybeLeads.jsx**: toont leads met score 35-49 voor handmatige review
- **Google Sheet**: team vult YES/NO verdicts in, die terugvloeien naar ground truth
- **reasoning_data.csv**: bevat gedetailleerde classificatie-uitleg per lead

---

## Zelf draaien

```bash
# 1. Zorg dat .env is ingevuld (HUBSPOT_API_KEY, GROQ_API_KEY)
cd autoresearch

# 2. Exporteer verse ground truth + leads
python evaluate.py export

# 3. Start de /autoresearch skill in Claude Code
#    Claude classificeert alle leads met qualify_prompt.md

# 4. Meet de resultaten
python evaluate.py metrics

# 5. Claude analyseert fouten, past prompt aan, herhaalt
```
