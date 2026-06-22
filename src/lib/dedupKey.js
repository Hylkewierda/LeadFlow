export function normalizeDedupKey(role, company, verdict) {
  const r = (role ?? "").trim().toLowerCase();
  const c = (company ?? "").trim().toLowerCase();
  return `${r}|${c}|${verdict}`;
}
