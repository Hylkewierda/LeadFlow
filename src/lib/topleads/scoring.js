// The ONLY place the combined weight lives. Computed at read time so it can be
// tuned without re-running pipelines. Both inputs are 0–100.
export const W_ICP = 0.6;
export const W_ENG = 0.4;

export function combinedScore(lead) {
  const icp = Number(lead.icp_score) || 0;
  const eng = Number(lead.engagement_score) || 0;
  return W_ICP * icp + W_ENG * eng;
}

export function rankTopLeads(leads, limit = 10) {
  return [...leads].sort((a, b) => combinedScore(b) - combinedScore(a)).slice(0, limit);
}
