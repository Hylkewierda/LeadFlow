"""Evaluation pipeline: computes metrics from Claude Code's classification results.

Ground truth comes from two sources:
1. HubSpot deal outcomes (closedwon/closedlost)
2. Human verdicts from the Maybe Leads Google Sheet (YES/NO in humanVerdict column)
"""

import csv
import io
import json
import os
import sys
import urllib.request
from hubspot_client import get_contacts_with_deals

PROMPT_PATH = os.path.join(os.path.dirname(__file__), "qualify_prompt.md")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "results", "ground_truth_cache.json")
LEADS_PATH = os.path.join(os.path.dirname(__file__), "results", "leads_to_classify.json")
CLASSIFICATIONS_PATH = os.path.join(os.path.dirname(__file__), "results", "classifications.json")
MAYBE_VERDICTS_PATH = os.path.join(os.path.dirname(__file__), "results", "maybe_verdicts.json")


def _norm_url(u):
    """Normalize a LinkedIn profile URL for cross-source dedup (trailing slash + case)."""
    return (u or "").strip().rstrip("/").lower()


def load_prompt() -> str:
    with open(PROMPT_PATH, "r") as f:
        return f.read()


def fetch_maybe_verdicts_from_supabase() -> list[dict]:
    """Read human GO/NO-GO verdicts from the qualifier_exemplars table.

    Returns a list of {profileUrl, expected_qualified} dicts. Fail-soft: returns
    [] if env or the request is unavailable, so the loop still runs on HubSpot
    ground truth alone.
    """
    base = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        print("  [autoresearch] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping qualifier_exemplars fetch")
        return []
    url = (
        f"{base}/rest/v1/qualifier_exemplars"
        "?select=linkedin_url,verdict"
    )
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  [autoresearch] Supabase verdict fetch failed: {exc}")
        return []
    out = []
    for r in rows:
        if not r.get("linkedin_url"):
            continue
        out.append({
            "profileUrl": r["linkedin_url"],
            "expected_qualified": r.get("verdict") == "GO",
            "source": "qualifier_exemplars",
        })
    return out


def fetch_maybe_verdicts() -> list[dict]:
    """Fetch human verdicts from qualifier_exemplars (Supabase).

    Falls back to [] if env vars are unset or the request fails, so the loop
    still runs on HubSpot ground truth alone. Writes results to
    results/maybe_verdicts.json.
    """
    verdicts = fetch_maybe_verdicts_from_supabase()

    os.makedirs(os.path.dirname(MAYBE_VERDICTS_PATH), exist_ok=True)
    with open(MAYBE_VERDICTS_PATH, "w") as f:
        json.dump(verdicts, f, indent=2)

    print(f"  Fetched {len(verdicts)} human verdicts from qualifier_exemplars")
    return verdicts


def build_ground_truth(force_refresh=False) -> list[dict]:
    """Fetch contacts from HubSpot and build labeled dataset.

    Uses a local JSON cache to avoid repeated HubSpot API calls.
    Merges in human verdicts from Supabase (qualifier_exemplars).
    Pass force_refresh=True to re-fetch from HubSpot.
    """
    if not force_refresh and os.path.exists(CACHE_PATH):
        print("Loading ground truth from cache...")
        with open(CACHE_PATH, "r") as f:
            hubspot_labeled = json.load(f)
    else:
        print("Fetching ground truth from HubSpot (this may take a minute)...")
        contacts = get_contacts_with_deals()
        hubspot_labeled = []
        for c in contacts:
            if c["outcome"] == "deal_open":
                continue
            hubspot_labeled.append({
                **c,
                "expected_qualified": c["outcome"] == "deal_won",
                "source": "hubspot",
            })

        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        with open(CACHE_PATH, "w") as f:
            json.dump(hubspot_labeled, f, indent=2)
        print(f"  Cached {len(hubspot_labeled)} HubSpot labeled leads")

    # Merge in human verdicts from Supabase
    print("Fetching human verdicts from Supabase...")
    maybe_verdicts = fetch_maybe_verdicts()

    # Deduplicate: if a profileUrl exists in both, human verdict wins
    hubspot_urls = {_norm_url(l.get("profileUrl")) for l in hubspot_labeled if l.get("profileUrl")}
    new_verdicts = [v for v in maybe_verdicts if _norm_url(v["profileUrl"]) not in hubspot_urls]

    labeled = hubspot_labeled + new_verdicts
    print(f"  Total ground truth: {len(labeled)} ({len(hubspot_labeled)} HubSpot + {len(new_verdicts)} new from sheet)")

    return labeled


def export_leads():
    """Export leads to a JSON file for Claude Code to classify."""
    dataset = build_ground_truth()

    leads_for_classification = []
    for i, lead in enumerate(dataset):
        leads_for_classification.append({
            "id": i,
            "profile": {
                "profileUrl": lead.get("profileUrl", ""),
                "name": lead.get("name", ""),
                "headline": lead.get("headline", ""),
                "about": lead.get("about", ""),
                "followers": lead.get("follower_count", ""),
                "connections": lead.get("connection_count", ""),
                "companyName": lead.get("company", ""),
                "companyUrl": lead.get("companyUrl", ""),
            },
        })

    os.makedirs(os.path.dirname(LEADS_PATH), exist_ok=True)
    with open(LEADS_PATH, "w") as f:
        json.dump(leads_for_classification, f, indent=2)

    print(f"Exported {len(leads_for_classification)} leads to {LEADS_PATH}")
    print(f"Current prompt: {PROMPT_PATH}")
    print(f"\nClassify each lead using the prompt and write results to {CLASSIFICATIONS_PATH}")
    print(f"Expected format: [{{'id': 0, 'isQualifiedLead': true, 'leadScore': 75}}, ...]")


def compute_metrics() -> dict:
    """Compute metrics from classifications vs ground truth."""
    dataset = build_ground_truth()

    if not os.path.exists(CLASSIFICATIONS_PATH):
        print(f"ERROR: No classifications found at {CLASSIFICATIONS_PATH}")
        print("Run export_leads first, classify them, then run compute_metrics.")
        sys.exit(1)

    with open(CLASSIFICATIONS_PATH, "r") as f:
        classifications = json.load(f)

    # Index classifications by id
    classified = {c["id"]: c for c in classifications}

    tp = fp = tn = fn = 0
    errors = []

    for i, lead in enumerate(dataset):
        if i not in classified:
            print(f"  WARNING: Lead {i} ({lead.get('name', '?')}) not classified, counting as not qualified")
            c = {"isQualifiedLead": False, "leadScore": 0}
        else:
            c = classified[i]

        predicted_qualified = c.get("isQualifiedLead", False)
        expected = lead["expected_qualified"]

        if predicted_qualified and expected:
            tp += 1
        elif predicted_qualified and not expected:
            fp += 1
            errors.append({
                "type": "false_positive",
                "id": i,
                "name": lead["name"],
                "company": lead["company"],
                "score": c.get("leadScore", 0),
            })
        elif not predicted_qualified and expected:
            fn += 1
            errors.append({
                "type": "false_negative",
                "id": i,
                "name": lead["name"],
                "company": lead["company"],
                "score": c.get("leadScore", 0),
            })
        else:
            tn += 1

    total = tp + fp + tn + fn
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / total if total > 0 else 0

    metrics = {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": accuracy,
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "total": total,
        "errors": errors,
    }

    print(f"\nResults ({total} leads):")
    print(f"  F1:        {f1:.3f}")
    print(f"  Precision: {precision:.3f}")
    print(f"  Recall:    {recall:.3f}")
    print(f"  Accuracy:  {accuracy:.3f}")
    print(f"  TP={tp} FP={fp} TN={tn} FN={fn}")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors[:10]:
            print(f"  [{e['type']}] {e['name']} @ {e['company']} (score: {e['score']})")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")

    return metrics


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "export":
        export_leads()
    elif len(sys.argv) > 1 and sys.argv[1] == "metrics":
        compute_metrics()
    else:
        print("Usage:")
        print("  python evaluate.py export   - Export leads for classification")
        print("  python evaluate.py metrics  - Compute metrics from classifications")
