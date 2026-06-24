import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// CRM data layer. Components NEVER touch Supabase directly (design §7 step 3) —
// every read and write goes through the workspace-scoped server routes
// (api/crm-contacts.js, api/crm-companies.js) using the service-role key there.

const WORKSPACE = "actuals";

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function sendJSON(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

function contactsUrl(filters = {}) {
  const p = new URLSearchParams({ workspace: WORKSPACE });
  if (filters.stage) p.set("stage", Array.isArray(filters.stage) ? filters.stage.join(",") : filters.stage);
  if (filters.owner) p.set("owner", filters.owner);
  if (filters.company_id) p.set("company_id", filters.company_id);
  if (filters.q) p.set("q", filters.q);
  return `/api/crm-contacts?${p.toString()}`;
}

// ---- Queries ----

export function useCrmContacts(filters = {}) {
  return useQuery({
    queryKey: ["crm-contacts", filters],
    queryFn: () => getJSON(contactsUrl(filters)),
    select: (d) => d.contacts ?? [],
  });
}

export function useCrmContact(id) {
  return useQuery({
    queryKey: ["crm-contact", id],
    queryFn: () => getJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${id}`),
    enabled: !!id,
  });
}

export function useCrmCompanies() {
  return useQuery({
    queryKey: ["crm-companies"],
    queryFn: () => getJSON(`/api/crm-companies?workspace=${WORKSPACE}`),
    select: (d) => d.companies ?? [],
  });
}

export function useCrmCompany(id) {
  return useQuery({
    queryKey: ["crm-company", id],
    queryFn: () => getJSON(`/api/crm-companies?workspace=${WORKSPACE}&id=${id}`),
    enabled: !!id,
  });
}

export function useCrmAnalytics() {
  return useQuery({
    queryKey: ["crm-analytics"],
    queryFn: () => getJSON(`/api/crm-analytics?workspace=${WORKSPACE}`),
  });
}

// ---- Mutations ----

// Invalidate everything the CRM surfaces touch after a write.
function invalidateCrm(qc) {
  qc.invalidateQueries({ queryKey: ["crm-contacts"] });
  qc.invalidateQueries({ queryKey: ["crm-contact"] });
  qc.invalidateQueries({ queryKey: ["crm-companies"] });
  qc.invalidateQueries({ queryKey: ["crm-company"] });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}`, "POST", body),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    // { id, stage, disqualify_reason?, note?, author? }
    mutationFn: ({ id, ...body }) =>
      sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${id}&action=stage`, "PATCH", body),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useClaimContact() {
  const qc = useQueryClient();
  return useMutation({
    // { id, owner } — owner null/empty unclaims.
    mutationFn: ({ id, owner }) =>
      sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${id}&action=claim`, "PATCH", { owner }),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    // { id, body, kind?, author? }
    mutationFn: ({ id, ...body }) =>
      sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${id}&action=note`, "POST", body),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useGenerateOutreach() {
  return useMutation({
    mutationFn: ({ contactId }) =>
      sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${contactId}&action=outreach`, "POST"),
  });
}

export function useScheduleFollowup() {
  const qc = useQueryClient();
  return useMutation({
    // { id, next_action_at } — next_action_at is a YYYY-MM-DD string or null.
    mutationFn: ({ id, next_action_at }) =>
      sendJSON(`/api/crm-contacts?workspace=${WORKSPACE}&id=${id}&action=schedule`, "PATCH", { next_action_at }),
    onSuccess: () => invalidateCrm(qc),
  });
}
