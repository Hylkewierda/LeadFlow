# AutoResearch: Lead Qualification Prompt Optimizer

Je bent een autonomous research agent die de lead qualification prompt van Actuals.io optimaliseert. Je doel: maximaliseer de F1-score door de prompt iteratief te verbeteren.

## Workflow per iteratie

### Stap 1: Export leads
```bash
cd autoresearch && python evaluate.py export
```
Dit maakt `results/leads_to_classify.json` met alle 182 leads.

### Stap 2: Classificeer alle leads
Lees `qualify_prompt.md` (de system prompt) en `results/leads_to_classify.json` (de leads). Classificeer elke lead volgens de prompt en schrijf de resultaten naar `results/classifications.json`:

```json
[
  {"id": 0, "isQualifiedLead": true, "leadScore": 82},
  {"id": 1, "isQualifiedLead": false, "leadScore": 35},
  ...
]
```

Voor elke lead: gebruik het profiel als input, pas de scoring logica uit qualify_prompt.md toe, en bepaal isQualifiedLead + leadScore.

### Stap 3: Bereken metrics
```bash
cd autoresearch && python evaluate.py metrics
```
Dit vergelijkt je classificaties met de ground truth en geeft F1, precision, recall.

### Stap 4: Analyseer en verbeter
- Bekijk de false positives en false negatives
- Wijzig `autoresearch/qualify_prompt.md` met 1-2 gerichte aanpassingen
- Ga terug naar stap 2

### Stap 5: Vergelijk
Als F1 verbetert: behoud de wijziging. Zo niet: revert qualify_prompt.md en probeer iets anders.

## Wat je mag wijzigen
ALLEEN `autoresearch/qualify_prompt.md`. Niets anders.

## Wat je kunt aanpassen in de prompt
1. **Scoring gewichten** — industry, company size, transaction volume, geography, job title, pain points
2. **Drempelwaarden** — GO >75%, MAYBE 50-75%, NO-GO <50%
3. **ICP criteria** — industries, bedrijfsgroottes, regio's, functies
4. **Pijnpunten** — welke meer/minder gewicht krijgen
5. **Scoring logica** — hoe dimensies worden gescoord
6. **Taalgebruik** — hoe streng/soepel de agent oordeelt

## Regels
- **Kleine wijzigingen**: 1-2 aanpassingen per iteratie
- Focus op de dimensie met de meeste fouten
- False positives hoog → verscherp criteria / verhoog drempels
- False negatives hoog → versoepel criteria / verlaag drempels
- JSON output structuur (isQualifiedLead, reason, leadScore, etc.) mag NIET veranderen
- Prompt blijft in het Nederlands
- Prompt verwijst altijd naar Actuals.io
- Houd de prompt beknopt

## Logging
Log elk resultaat naar `autoresearch/results/experiment_log.csv`:
`timestamp,iteration,f1,precision,recall,accuracy,tp,fp,tn,fn,change_summary,kept`

## Stop criteria
- 10 iteraties gedaan, OF
- F1 > 0.90 bereikt
