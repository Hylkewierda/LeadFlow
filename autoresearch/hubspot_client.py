"""HubSpot client for fetching contacts with deal outcomes as ground truth.

Strategy: Fetch deals via list API, get associated contacts, then batch-read contact details.
"""

import time
import requests
from config import HUBSPOT_API_KEY

BASE_URL = "https://api.hubapi.com"
HEADERS = {
    "Authorization": f"Bearer {HUBSPOT_API_KEY}",
    "Content-Type": "application/json",
}


def _api_get(url, params=None, retries=3):
    for attempt in range(retries):
        resp = requests.get(url, headers=HEADERS, params=params)
        if resp.status_code in (429, 502, 503):
            wait = 2 ** (attempt + 1)
            print(f"  API {resp.status_code}, retrying in {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()


def get_contacts_with_deals():
    """Fetch contacts linked to closedwon/closedlost deals."""
    # Step 1: Fetch all deals with associations to contacts in one go
    print("Fetching deals with contact associations...")
    deals = _fetch_all_deals_with_contacts()
    print(f"  Found {len(deals)} total deals")

    # Step 2: Map contact_id -> outcome
    contact_outcomes = {}
    contact_deal_names = {}

    for deal in deals:
        stage = deal["properties"].get("dealstage", "")
        if stage not in ("closedwon", "closedlost"):
            continue

        deal_name = deal["properties"].get("dealname", "")
        contact_ids = []
        assocs = deal.get("associations", {}).get("contacts", {}).get("results", [])
        for a in assocs:
            cid = str(a.get("id", ""))
            if cid:
                contact_ids.append(cid)

        outcome = "deal_won" if stage == "closedwon" else "deal_lost"
        for cid in contact_ids:
            if outcome == "deal_won" or cid not in contact_outcomes:
                contact_outcomes[cid] = outcome
                contact_deal_names[cid] = deal_name

    print(f"  {sum(1 for v in contact_outcomes.values() if v == 'deal_won')} won, "
          f"{sum(1 for v in contact_outcomes.values() if v == 'deal_lost')} lost contacts")

    # Step 3: Batch-fetch contact details
    print("Fetching contact details...")
    results = []
    contact_ids = list(contact_outcomes.keys())

    for i in range(0, len(contact_ids), 100):
        batch = contact_ids[i:i+100]
        body = {
            "inputs": [{"id": cid} for cid in batch],
            "properties": [
                "firstname", "lastname", "jobtitle", "company", "website",
                "hs_linkedinid", "linkedin_url", "description",
            ],
        }
        resp = requests.post(
            f"{BASE_URL}/crm/v3/objects/contacts/batch/read",
            headers=HEADERS,
            json=body,
        )
        if resp.status_code in (429, 502, 503):
            time.sleep(3)
            resp = requests.post(f"{BASE_URL}/crm/v3/objects/contacts/batch/read", headers=HEADERS, json=body)
        resp.raise_for_status()

        for contact in resp.json().get("results", []):
            cid = contact["id"]
            props = contact.get("properties", {})
            results.append({
                "contact_id": cid,
                "name": f"{props.get('firstname', '') or ''} {props.get('lastname', '') or ''}".strip(),
                "headline": props.get("jobtitle", "") or "",
                "company": props.get("company", "") or "",
                "profileUrl": props.get("hs_linkedinid", "") or props.get("linkedin_url", "") or "",
                "companyUrl": props.get("website", "") or "",
                "about": props.get("description", "") or "",
                "follower_count": "",
                "connection_count": "",
                "outcome": contact_outcomes[cid],
                "deal_name": contact_deal_names.get(cid, ""),
            })

    return results


def _fetch_all_deals_with_contacts():
    """Fetch all deals with their contact associations via list API."""
    deals = []
    after = None

    while True:
        params = {
            "limit": 100,
            "properties": "dealname,dealstage,amount",
            "associations": "contacts",
        }
        if after:
            params["after"] = after

        data = _api_get(f"{BASE_URL}/crm/v3/objects/deals", params=params)
        if not data:
            break

        deals.extend(data.get("results", []))

        paging = data.get("paging", {}).get("next")
        if paging:
            after = paging["after"]
            time.sleep(0.1)  # gentle rate limiting
        else:
            break

    return deals


if __name__ == "__main__":
    contacts = get_contacts_with_deals()
    print(f"\nFetched {len(contacts)} contacts with deal outcomes")
    won = [c for c in contacts if c["outcome"] == "deal_won"]
    lost = [c for c in contacts if c["outcome"] == "deal_lost"]
    print(f"  deal_won: {len(won)}")
    print(f"  deal_lost: {len(lost)}")
    print("\nSamples:")
    for c in contacts[:5]:
        print(f"  {c['name']} @ {c['company']} ({c['headline']}) -> {c['outcome']}")
