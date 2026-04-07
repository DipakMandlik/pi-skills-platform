#!/usr/bin/env python3
"""
Audit Log Validator
Cross-references test actions against audit log entries

Usage:
    python docs/tester/validate_audit_logs.py --base-url http://localhost:8000
"""

import requests
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
RESULTS_DIR = "results"

REQUIRED_LOG_FIELDS = {
    "id": "UUID",
    "request_id": "UUID",
    "user_id": "UUID",
    "action": "String",
    "outcome": "String",
    "timestamp": "ISO datetime",
}

OPTIONAL_EXPECTED = ["skill_id", "model_id", "tokens_used", "latency_ms", "ip_address"]
KNOWN_ACTIONS = [
    "EXEC_SUCCESS", "EXEC_FAILED", "DENIED_AUTH", "DENIED_ROLE", "DENIED_SKILL",
    "DENIED_MODEL", "DENIED_MODEL_UNKNOWN", "RATE_LIMITED", "PROMPT_POLICY_VIOLATION",
    "LOGIN_SUCCESS", "LOGIN_FAILED", "SKILL_ASSIGNED", "SKILL_REVOKED",
    "MODEL_GRANTED", "MODEL_REVOKED"
]

findings = []

def log_finding(level, category, message, evidence=""):
    findings.append({"level": level, "category": category, "message": message, "evidence": evidence})
    icon = {"OK": "✅", "WARN": "⚠️", "FAIL": "❌"}.get(level, "ℹ️")
    print(f"  {icon} [{category}] {message}")

def req(method, path, token=None, **kwargs):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        resp = requests.request(method, f"{BASE_URL}{path}", headers=headers, timeout=15, **kwargs)
        return {"status": resp.status_code, "data": resp.json() if resp.headers.get("content-type","").startswith("application/json") else {}}
    except:
        return {"status": 0, "data": {}}

def get_admin_token():
    r = req("POST", "/auth/login", json={"email": "admin@platform.local", "password": "admin123"})
    if r["status"] != 200:
        print("❌ Cannot get admin token")
        sys.exit(1)
    return r["data"]["access_token"]

def validate_log_entry(entry, context):
    problems = []
    for field, description in REQUIRED_LOG_FIELDS.items():
        if field not in entry or entry[field] is None:
            problems.append(f"Missing required field '{field}'")
    if entry.get("action") and entry["action"] not in KNOWN_ACTIONS:
        problems.append(f"Unknown action '{entry['action']}'")
    if entry.get("outcome") and entry["outcome"] not in ("SUCCESS", "DENIED", "ERROR"):
        problems.append(f"Invalid outcome '{entry['outcome']}'")
    if entry.get("action") == "EXEC_SUCCESS":
        if not entry.get("tokens_used"): problems.append("EXEC_SUCCESS missing tokens_used")
    return problems

def validate_all_logs(admin_token, since=None):
    print("\n📊 Fetching audit logs from /monitoring...\n")
    params = {"page_size": 1000}
    if since: params["from"] = since
    
    r = req("GET", "/monitoring", token=admin_token, params=params)
    if r["status"] != 200:
        log_finding("FAIL", "Fetch", f"/monitoring returned {r['status']}")
        return []
    
    data = r["data"]
    logs = data.get("logs", [])
    print(f"  Found {len(logs)} log entries\n")
    
    if not logs:
        log_finding("WARN", "Coverage", "No log entries found")
        return []

    for i, entry in enumerate(logs):
        problems = validate_log_entry(entry, f"entry #{i}")
        for p in problems:
            log_finding("FAIL", "Fields", f"Entry {entry.get('id','#'+str(i))}: {p}")

    actions_found = set(e.get("action") for e in logs if e.get("action"))
    denial_actions = {a for a in actions_found if "DENIED" in a}
    success_actions = {a for a in actions_found if a == "EXEC_SUCCESS"}
    
    log_finding("OK" if success_actions else "WARN", "Coverage", f"Success actions: {success_actions or 'NONE'}")
    log_finding("OK" if denial_actions else "WARN", "Coverage", f"Denial actions: {denial_actions or 'NONE'}")

    print("\n🔍 Immutability check (requires DB access)...\n")
    log_finding("WARN", "Immutability", "Manual check required for UPDATE/DELETE on audit_log")

    return logs

def generate_report(logs):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    ok_count = sum(1 for f in findings if f["level"] == "OK")
    warn_count = sum(1 for f in findings if f["level"] == "WARN")
    fail_count = sum(1 for f in findings if f["level"] == "FAIL")

    with open(f"{RESULTS_DIR}/audit_log_report.md", "w") as f:
        f.write(f"# Audit Log Validation Report\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Entries Analyzed:** {len(logs)}\n\n")
        f.write(f"| Level | Count |\n|-------|-------|\n")
        f.write(f"| ✅ OK | {ok_count} |\n| ⚠️ Warning | {warn_count} |\n| ❌ Fail | {fail_count} |\n\n")
        for finding in findings:
            icon = {"OK": "✅", "WARN": "⚠️", "FAIL": "❌"}[finding["level"]]
            f.write(f"**{icon} [{finding['category']}]** {finding['message']}\n\n")

    return fail_count == 0

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    
    global BASE_URL
    BASE_URL = args.base_url

    print("\n📋 Audit Log Validation")
    print(f"   Target: {BASE_URL}")

    admin_token = get_admin_token()
    logs = validate_all_logs(admin_token)
    success = generate_report(logs or [])
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()