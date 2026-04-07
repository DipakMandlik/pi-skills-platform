#!/usr/bin/env python3
"""
Security Attack Testing Suite
Tests all attack vectors from attack-vectors.md playbook

Usage:
    python docs/tester/security_attacks.py --base-url http://localhost:8000
"""

import requests
import json
import os
import sys
import base64
import hmac
import hashlib

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
RESULTS_DIR = "results"
tokens = {"admin": None, "user": None, "viewer": None}

attack_results = []

def req(method, url, data=None, headers={}):
    try:
        config = {"method": method, "url": url, "headers": headers, "timeout": 15}
        if data: config["data"] = data
        r = requests.request(**config)
        return {"status": r.status_code, "data": r.json(), "text": json.dumps(r.json())}
    except:
        return {"status": 0, "data": {}, "text": ""}

def auth_header(role):
    return {"Authorization": f"Bearer {tokens[role]}"} if tokens[role] else {}

def record_attack(vector, description, attempted, blocked, severity):
    result = "BLOCKED" if blocked else "SUCCESS"
    attack_results.append({"vector": vector, "description": description, "attempted": attempted, "result": result, "severity": severity})
    icon = "✅" if blocked else "❌"
    print(f"  {icon} [{vector}] {description}: {result}")

async def setup_tokens():
    print("\n🔑 Setting up tokens...\n")
    for role, email, pw in [("admin","admin@platform.local","admin123"), ("user","user@platform.local","user123"), ("viewer","viewer@platform.local","viewer123")]:
        r = req("POST", f"{BASE_URL}/auth/login", {"email": email, "password": pw})
        if r["status"] == 200 and r["data"].get("access_token"):
            tokens[role] = r["data"]["access_token"]

def jwt_attacks():
    print("\n🔒 JWT & Authentication Attacks\n")
    
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "attacker", "role": "admin", "exp": 9999999999, "iat": 1700000000}).encode()).decode().rstrip("=")
    r = req("GET", f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {header}.{payload}."})
    record_attack("SEC-001", "JWT alg:none", True, r["status"] == 401, "CRITICAL")

    wsh = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    wsp = base64.urlsafe_b64encode(json.dumps({"sub": "user_1", "role": "admin", "exp": 9999999999}).encode()).decode().rstrip("=")
    fake_sig = base64.urlsafe_b64encode(hmac.new(b"wrong_secret", f"{wsh}.{wsp}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    r = req("GET", f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {wsh}.{wsp}.{fake_sig}"})
    record_attack("SEC-004", "JWT wrong secret", True, r["status"] == 401, "CRITICAL")

    for t in ["", "null", "a.b.c.d.e"]:
        r = req("GET", f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {t}"})
        record_attack(f"SEC-MALF-{t[:3]}", f"Malformed token {t}", True, r["status"] == 401, "HIGH")

def rbac_bypass():
    print("\n🔐 RBAC Bypass Attacks\n")
    
    r = req("POST", f"{BASE_URL}/skills/assign", {"role": "admin", "user_id": "anything", "skill_id": "anything"}, auth_header("user"))
    record_attack("RBAC-007", "Role in body", True, r["status"] == 403, "CRITICAL")

    r = req("GET", f"{BASE_URL}/users", headers={**auth_header("user"), "X-Role": "admin"})
    record_attack("RBAC-008", "Role in header", True, r["status"] == 403, "CRITICAL")

    r = req("POST", f"{BASE_URL}/skills/assign", {"user_id": "x", "skill_id": "y"})
    record_attack("RBAC-010", "No token", True, r["status"] == 401, "CRITICAL")

    r = req("POST", f"{BASE_URL}/execute", {"skill_id": "skill_summarizer", "model_id": "claude-3-haiku-20240307", "prompt": "Hello"}, auth_header("viewer"))
    record_attack("RBAC-012", "Viewer execution", True, r["status"] == 403, "CRITICAL")

def model_bypass():
    print("\n🤖 Model Governance Bypass\n")
    
    r = req("POST", f"{BASE_URL}/execute", {"skill_id": "skill_summarizer", "model_id": "gpt-4o", "prompt": "test"}, auth_header("user"))
    record_attack("MOD-013", "Unpermitted model", True, r["status"] == 403, "CRITICAL")

    r = req("POST", f"{BASE_URL}/execute", {"skill_id": "skill_summarizer", "model_id": None, "prompt": "test"}, auth_header("user"))
    record_attack("MOD-015", "Null model_id", True, r["status"] != 500, "HIGH")

    r = req("POST", f"{BASE_URL}/execute", {"skill_id": "skill_summarizer", "model_id": "../../etc/passwd", "prompt": "test"}, auth_header("user"))
    record_attack("MOD-017", "Path traversal", True, r["status"] == 400, "HIGH")

def injection_attacks():
    print("\n💉 Injection Attacks\n")
    
    r = req("POST", f"{BASE_URL}/auth/login", {"email": "' OR '1'='1", "password": "x"})
    record_attack("SQL-011", "SQL injection", True, r["status"] != 500, "CRITICAL")

    r = req("POST", f"{BASE_URL}/execute", {"model_id": "1; DROP TABLE --", "prompt": "y"}, auth_header("user"))
    record_attack("SQL-012", "SQL in model_id", True, r["status"] != 500, "CRITICAL")

def info_leakage():
    print("\n🔍 Information Leakage\n")
    
    LEAK = ["Traceback", "at line", "/home/", "/app/", "SELECT ", "FROM ", "asyncpg"]
    r = req("POST", f"{BASE_URL}/auth/login", {"email": "' OR 1=1 --", "password": "x"})
    leaked = [p for p in LEAK if p.lower() in r["text"].lower()]
    record_attack("LEAK-016", "Stack trace leak", True, len(leaked) == 0, "MEDIUM")

def generate_report():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    blocked = sum(1 for a in attack_results if a["result"] == "BLOCKED")
    total = len(attack_results)
    
    print(f"\n{'='*60}")
    print(f"  SECURITY RESULTS: {blocked}/{total} blocked")
    print(f"{'='*60}")

    with open(f"{RESULTS_DIR}/security_test_results.json", "w") as f:
        json.dump(attack_results, f, indent=2)

    date = datetime.now().strftime('%Y-%m-%d %H:%M')
    md = f"# Security Testing Report\n**Date:** {date}\n**Methodology:** Attack-first\n\n"
    md += "| Attack | Description | Result | Severity |\n|--------|-------------|--------|----------|\n"
    for a in attack_results:
        icon = "✅" if a["result"] == "BLOCKED" else "❌"
        md += f"| {a['vector']} | {a['description']} | {icon} {a['result']} | {a['severity']} |\n"
    
    vuln = len([a for a in attack_results if a["result"] != "BLOCKED"])
    md += f"\n**Overall:** {'STRONG' if vuln == 0 else 'NEEDS WORK'} ({vuln} vulnerabilities)\n"
    
    with open(f"{RESULTS_DIR}/security_testing_report.md", "w") as f:
        f.write(md)
    print(f"📄 Reports saved to {RESULTS_DIR}/")

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    
    global BASE_URL
    BASE_URL = args.base_url

    print(f"\n🛡️  Security Attack Suite")
    print(f"   Target: {BASE_URL}")

    r = req("GET", f"{BASE_URL}/health")
    if r["status"] != 200:
        print(f"❌ Server not running: {BASE_URL}")
        sys.exit(1)
    print("✅ Server running\n")

    setup_tokens()
    jwt_attacks()
    rbac_bypass()
    model_bypass()
    injection_attacks()
    info_leakage()
    generate_report()

if __name__ == "__main__":
    main()