import { getJSON, sendJSON } from "../api.js";

const WORKSPACE_SLUG = "actuals";

export async function listHomeTopLeads() {
  const { leads } = await getJSON(`/api/workspace?view=top-leads&workspace=${WORKSPACE_SLUG}`);
  return leads ?? [];
}

export async function getLatestAudienceInsight() {
  const { insight } = await getJSON("/api/workspace?view=audience-insight");
  return insight ?? null;
}

export async function getQualifierFeedback() {
  const settings = await getJSON(`/api/workspace?view=settings&workspace=${WORKSPACE_SLUG}`);
  return settings.qualifier_feedback ?? "";
}

export async function saveQualifierFeedback(text) {
  await sendJSON("/api/workspace", "PUT", {
    field: "qualifier_feedback",
    value: text,
    workspaceSlug: WORKSPACE_SLUG,
  });
}
