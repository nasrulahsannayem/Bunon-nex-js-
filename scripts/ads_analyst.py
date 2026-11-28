#!/usr/bin/env python3
"""BUNON Meta Ads analyst — canonical action dedup and funnel metrics.

Read-only: fetches insights via Meta Graph API (or local JSON cache) and
computes funnel metrics without any write operations.

Usage:
    python3 ads_analyst.py --input cache.json --output /tmp/analysis.json
    python3 ads_analyst.py --account-id act_... --since 2026-09-27 --until 2026-11-27
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

# Canonical action aliases — never sum them; use canonical aggregate first,
# fall back to first present alias (per meta-ads:funnel-analyzer skill).
ALIASES = {
    "purchase": ("purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase",
                 "onsite_web_purchase", "onsite_web_app_purchase", "web_in_store_purchase"),
    "initiate_checkout": ("initiate_checkout", "omni_initiated_checkout",
                          "offsite_conversion.fb_pixel_initiate_checkout",
                          "onsite_web_initiate_checkout", "onsite_web_app_initiate_checkout"),
    "add_to_cart": ("add_to_cart", "omni_add_to_cart",
                    "offsite_conversion.fb_pixel_add_to_cart",
                    "onsite_web_add_to_cart", "onsite_web_app_add_to_cart"),
    "view_content": ("view_content", "omni_view_content",
                     "offsite_conversion.fb_pixel_view_content",
                     "onsite_web_view_content", "onsite_web_app_view_content"),
    "landing_page_view": ("landing_page_view", "omni_landing_page_view"),
    "link_click": ("link_click",),
    "msg_connect": ("onsite_conversion.total_messaging_connection",),
    "msg_start": ("onsite_conversion.messaging_conversation_started_7d",),
}


def get_canonical_action(actions, action_name):
    """Return value for canonical action name using alias priority order.

    Never sums aliases: canonical aggregate takes precedence; otherwise
    the first present alias in the declared order wins.
    """
    if not actions or action_name not in ALIASES:
        return 0.0
    by_type = {}
    for item in actions:
        action_type = item.get("action_type")
        if action_type in ALIASES[action_name] and action_type not in by_type:
            by_type[action_type] = float(item.get("value", 0))
    for alias in ALIASES[action_name]:
        if alias in by_type:
            return by_type[alias]
    return 0.0


def calculate_roas(purchase_value, spend):
    """ROAS = purchase value / spend; 0 when spend is 0."""
    if not spend:
        return 0.0
    return purchase_value / spend


def calculate_cpa(spend, purchases):
    """CPA = spend / purchases; 0 when purchases is 0."""
    if not purchases:
        return 0.0
    return spend / purchases


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def compute_metrics(row):
    """Compute the full funnel metric set from one Meta insights row."""
    spend = _as_float(row.get("spend"))
    impressions = int(_as_float(row.get("impressions")))
    clicks = int(_as_float(row.get("clicks")))
    reach = int(_as_float(row.get("reach")))
    actions = row.get("actions") or []
    action_values = row.get("action_values") or []

    pur = get_canonical_action(actions, "purchase")
    purchase_value = get_canonical_action(action_values, "purchase")

    return {
        "spend": spend,
        "impressions": impressions,
        "clicks": clicks,
        "ctr": (clicks / impressions * 100) if impressions else 0.0,
        "cpc": (spend / clicks) if clicks else 0.0,
        "cpm": (spend / impressions * 1000) if impressions else 0.0,
        "reach": reach,
        "frequency": (impressions / reach) if reach else 0.0,
        "lpv": get_canonical_action(actions, "landing_page_view"),
        "vc": get_canonical_action(actions, "view_content"),
        "atc": get_canonical_action(actions, "add_to_cart"),
        "ic": get_canonical_action(actions, "initiate_checkout"),
        "pur": pur,
        "purchase_value": purchase_value,
        "roas": calculate_roas(purchase_value, spend),
        "cpa": calculate_cpa(spend, pur),
        "msg_start": get_canonical_action(actions, "msg_start"),
        "msg_connect": get_canonical_action(actions, "msg_connect"),
    }


def analyze_rows(rows):
    """Analyze a list of insights rows, returning account totals and per-row metrics."""
    per_row = []
    for row in rows:
        entry = {"name": row.get("campaign_name") or row.get("adset_name")
                 or row.get("ad_name") or row.get("account_name") or "unknown"}
        entry.update(compute_metrics(row))
        per_row.append(entry)

    totals = {key: 0.0 for key in ("spend", "impressions", "clicks", "reach", "lpv",
                                   "vc", "atc", "ic", "pur", "purchase_value",
                                   "msg_start", "msg_connect")}
    for entry in per_row:
        for key in totals:
            totals[key] += entry[key]
    totals["roas"] = calculate_roas(totals["purchase_value"], totals["spend"])
    totals["cpa"] = calculate_cpa(totals["spend"], totals["pur"])
    totals["ctr"] = (totals["clicks"] / totals["impressions"] * 100) if totals["impressions"] else 0.0
    totals["cpc"] = (totals["spend"] / totals["clicks"]) if totals["clicks"] else 0.0
    totals["cpm"] = (totals["spend"] / totals["impressions"] * 1000) if totals["impressions"] else 0.0

    return {"account": totals, "campaigns": per_row}


def load_token():
    """Load Meta token from env file without ever printing it."""
    env_path = "/root/.config/meta-ads/env"
    values = {}
    with open(env_path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                values[key] = value
    return values


def fetch_insights(account_id, since, until, level="campaign"):
    """Fetch insights from Graph API (read-only). Raises on API errors."""
    env = load_token()
    token = env.get("META_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("META_ACCESS_TOKEN not found in env file")
    params = {
        "fields": "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"
                  "impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values",
        "level": level,
        "time_range": json.dumps({"since": since, "until": until}),
        "limit": 500,
        "access_token": token,
    }
    url = f"https://graph.facebook.com/v24.0/{account_id}/insights?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(f"Meta API error: {payload['error'].get('message')}")
    return payload.get("data", [])


def main(argv=None):
    parser = argparse.ArgumentParser(description="BUNON Meta Ads funnel analysis (read-only)")
    parser.add_argument("--input", help="Path to cached Meta insights JSON file")
    parser.add_argument("--output", help="Path to write analysis JSON")
    parser.add_argument("--account-id", default="act_9062712053815635")
    parser.add_argument("--since", default="2026-09-27")
    parser.add_argument("--until", default="2026-11-27")
    parser.add_argument("--level", default="campaign")
    args = parser.parse_args(argv)

    if args.input:
        with open(args.input, encoding="utf-8") as handle:
            payload = json.load(handle)
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    else:
        rows = fetch_insights(args.account_id, args.since, args.until, args.level)

    result = analyze_rows(rows)
    output = json.dumps(result, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(output + "\n")
        print(f"Analysis written to {args.output}")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())