"""
AI Governance System - Comprehensive API Test Script
Tests all governance endpoints with detailed validation
"""
import requests
import json
import sys
import time
from typing import Optional
from dataclasses import dataclass

BASE_URL = "http://localhost:8000"

@dataclass
class TestResult:
    name: str
    passed: bool
    status_code: int
    response: dict
    error: Optional[str] = None

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

class GovernanceTester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.admin_token: Optional[str] = None
        self.user_token: Optional[str] = None
        self.results: list[TestResult] = []

    def print_header(self, text: str):
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
        print(f"{Colors.BOLD}{Colors.BLUE}{text.center(60)}{Colors.END}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

    def print_test(self, name: str, passed: bool, status: int, error: str = ""):
        icon = f"{Colors.GREEN}PASS{Colors.END}" if passed else f"{Colors.RED}FAIL{Colors.END}"
        print(f"  [{icon}] {name} (HTTP {status})")
        if error:
            print(f"         {Colors.YELLOW}Error: {error}{Colors.END}")

    def record(self, name: str, passed: bool, status_code: int, response: dict, error: str = None):
        self.results.append(TestResult(name, passed, status_code, response, error))
        self.print_test(name, passed, status_code, error or "")

    def post(self, path: str, data: dict, token: str = None) -> tuple[int, dict]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            res = requests.post(f"{self.base_url}{path}", json=data, headers=headers, timeout=10)
            return res.status_code, res.json() if res.text else {}
        except Exception as e:
            return 0, {"error": str(e)}

    def get(self, path: str, token: str = None) -> tuple[int, dict]:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            res = requests.get(f"{self.base_url}{path}", headers=headers, timeout=10)
            return res.status_code, res.json() if res.text else {}
        except Exception as e:
            return 0, {"error": str(e)}

    def put(self, path: str, data: dict, token: str = None) -> tuple[int, dict]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            res = requests.put(f"{self.base_url}{path}", json=data, headers=headers, timeout=10)
            return res.status_code, res.json() if res.text else {}
        except Exception as e:
            return 0, {"error": str(e)}

    def delete(self, path: str, token: str = None) -> tuple[int, dict]:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            res = requests.delete(f"{self.base_url}{path}", headers=headers, timeout=10)
            return res.status_code, res.json() if res.text else {}
        except Exception as e:
            return 0, {"error": str(e)}

    # ── Auth ────────────────────────────────────────────────────────

    def test_auth(self):
        self.print_header("AUTHENTICATION TESTS")

        # Login as admin
        status, resp = self.post("/auth/login", {
            "email": "admin@platform.local",
            "password": "admin123"
        })
        passed = status == 200 and "access_token" in resp
        self.admin_token = resp.get("access_token") if passed else None
        self.record("Admin Login", passed, status, resp)

        # Login as user
        status, resp = self.post("/auth/login", {
            "email": "user@platform.local",
            "password": "user123"
        })
        passed = status == 200 and "access_token" in resp
        self.user_token = resp.get("access_token") if passed else None
        self.record("User Login", passed, status, resp)

        # Invalid login
        status, resp = self.post("/auth/login", {
            "email": "invalid@test.com",
            "password": "wrong"
        })
        passed = status == 401
        self.record("Invalid Login Rejected", passed, status, resp)

    # ── Health ──────────────────────────────────────────────────────

    def test_health(self):
        self.print_header("HEALTH CHECK")

        status, resp = self.get("/health")
        passed = status == 200 and resp.get("status") in ["ok", "degraded"]
        self.record("Health Endpoint", passed, status, resp)

    # ── Subscription CRUD ───────────────────────────────────────────

    def test_subscriptions(self):
        self.print_header("SUBSCRIPTION MANAGEMENT TESTS")

        # List subscriptions
        status, resp = self.get("/admin/subscriptions", self.admin_token)
        passed = status == 200 and "subscriptions" in resp
        self.record("List Subscriptions", passed, status, resp)

        # Create subscription
        status, resp = self.post("/admin/subscriptions", {
            "plan_name": "test_plan",
            "display_name": "Test Plan",
            "monthly_token_limit": 50000,
            "max_tokens_per_request": 2048,
            "allowed_models": ["claude-3-haiku-20240307"],
            "features": ["test_feature"],
            "priority": "standard",
            "rate_limit_per_minute": 20,
            "cost_budget_monthly": 25.0
        }, self.admin_token)
        passed = status == 200 and resp.get("plan_name") == "test_plan"
        self.record("Create Subscription", passed, status, resp)

        # Get single subscription
        status, resp = self.get("/admin/subscriptions/test_plan", self.admin_token)
        passed = status == 200 and resp.get("plan_name") == "test_plan"
        self.record("Get Subscription", passed, status, resp)

        # Update subscription
        status, resp = self.put("/admin/subscriptions/test_plan", {
            "display_name": "Updated Test Plan",
            "monthly_token_limit": 75000
        }, self.admin_token)
        passed = status == 200 and resp.get("display_name") == "Updated Test Plan"
        self.record("Update Subscription", passed, status, resp)

        # Create duplicate (should fail)
        status, resp = self.post("/admin/subscriptions", {
            "plan_name": "test_plan",
            "display_name": "Duplicate",
            "monthly_token_limit": 1000
        }, self.admin_token)
        passed = status == 409
        self.record("Duplicate Subscription Rejected", passed, status, resp)

        # Delete subscription
        status, resp = self.delete("/admin/subscriptions/test_plan", self.admin_token)
        passed = status == 200 and resp.get("deleted") == True
        self.record("Delete Subscription", passed, status, resp)

    # ── Subscription Assignment ─────────────────────────────────────

    def test_subscription_assignment(self):
        self.print_header("SUBSCRIPTION ASSIGNMENT TESTS")

        # Get user subscription
        status, resp = self.get("/admin/subscriptions/user/test_user_id", self.admin_token)
        self.record("Get User Subscription", status in [200, 404], status, resp)

        # List all user subscriptions
        status, resp = self.get("/admin/user-subscriptions", self.admin_token)
        passed = status == 200 and "user_subscriptions" in resp
        self.record("List User Subscriptions", passed, status, resp)

        # Assign subscription
        status, resp = self.post("/admin/subscriptions/assign", {
            "user_id": "00000000-0000-0000-0000-000000000000",
            "plan_name": "free"
        }, self.admin_token)
        self.record("Assign Subscription", status in [200, 404], status, resp)

        # Bulk assign
        status, resp = self.post("/admin/subscriptions/bulk-assign", {
            "user_ids": ["00000000-0000-0000-0000-000000000000"],
            "plan_name": "free"
        }, self.admin_token)
        self.record("Bulk Assign Subscriptions", status in [200, 404], status, resp)

    # ── Model Access Control ────────────────────────────────────────

    def test_model_access(self):
        self.print_header("MODEL ACCESS CONTROL TESTS")

        # List model access
        status, resp = self.get("/admin/model-access", self.admin_token)
        passed = status == 200 and "configs" in resp
        self.record("List Model Access", passed, status, resp)

        # Get specific model access
        status, resp = self.get("/admin/model-access/claude-3-haiku-20240307", self.admin_token)
        passed = status == 200
        self.record("Get Model Access", passed, status, resp)

        # Update model access
        status, resp = self.post("/admin/model-access", {
            "model_id": "claude-3-haiku-20240307",
            "allowed_roles": ["admin", "user"],
            "max_tokens_per_request": 4096,
            "enabled": True,
            "rate_limit_per_minute": 60
        }, self.admin_token)
        passed = status == 200
        self.record("Set Model Access", passed, status, resp)

        # Delete model access
        status, resp = self.delete("/admin/model-access/gpt-4o", self.admin_token)
        self.record("Delete Model Access", status in [200, 404], status, resp)

    # ── Feature Flags ───────────────────────────────────────────────

    def test_feature_flags(self):
        self.print_header("FEATURE FLAG TESTS")

        # List feature flags
        status, resp = self.get("/admin/feature-flags", self.admin_token)
        passed = status == 200 and "flags" in resp
        self.record("List Feature Flags", passed, status, resp)

        # Set feature flag
        status, resp = self.post("/admin/feature-flags", {
            "feature_name": "code_generation",
            "model_id": "claude-3-5-sonnet-20241022",
            "enabled": True,
            "enabled_for": ["admin", "user"],
            "config": {"temperature": 0.7}
        }, self.admin_token)
        passed = status == 200
        self.record("Set Feature Flag", passed, status, resp)

        # Delete feature flag
        status, resp = self.delete("/admin/feature-flags/code_generation/claude-3-5-sonnet-20241022", self.admin_token)
        self.record("Delete Feature Flag", status in [200, 404], status, resp)

    # ── Governance Policies ─────────────────────────────────────────

    def test_policies(self):
        self.print_header("GOVERNANCE POLICY TESTS")

        # Get policy types
        status, resp = self.get("/admin/policies/types", self.admin_token)
        passed = status == 200 and "types" in resp
        self.record("Get Policy Types", passed, status, resp)

        # List policies
        status, resp = self.get("/admin/policies", self.admin_token)
        passed = status == 200 and "policies" in resp
        self.record("List Policies", passed, status, resp)

        # Create policy
        status, resp = self.post("/admin/policies", {
            "policy_name": "test_token_limit",
            "policy_type": "token_limit",
            "description": "Test token limit policy",
            "conditions": {"max_tokens": 5000},
            "actions": {"deny": True, "notify": True},
            "priority": "high",
            "enabled": True
        }, self.admin_token)
        passed = status == 200
        self.record("Create Policy", passed, status, resp)

        # Get policy
        status, resp = self.get("/admin/policies/test_token_limit", self.admin_token)
        passed = status == 200 and resp.get("policy_name") == "test_token_limit"
        self.record("Get Policy", passed, status, resp)

        # Update policy
        status, resp = self.put("/admin/policies/test_token_limit", {
            "description": "Updated test policy",
            "enabled": False
        }, self.admin_token)
        passed = status == 200
        self.record("Update Policy", passed, status, resp)

        # Evaluate policies
        status, resp = self.post("/admin/policies/evaluate", {
            "user_id": "test_user",
            "user_role": "user",
            "model_id": "claude-3-haiku-20240307",
            "task_type": "general",
            "estimated_tokens": 1000
        }, self.admin_token)
        passed = status == 200 and "allowed" in resp
        self.record("Evaluate Policies", passed, status, resp)

        # Delete policy
        status, resp = self.delete("/admin/policies/test_token_limit", self.admin_token)
        self.record("Delete Policy", status in [200, 404], status, resp)

    # ── Token Management ────────────────────────────────────────────

    def test_token_management(self):
        self.print_header("TOKEN MANAGEMENT TESTS")

        # Get token usage
        status, resp = self.get("/ai/tokens", self.user_token)
        self.record("Get Token Usage", status in [200, 403], status, resp)

        # Get dashboard
        status, resp = self.get("/ai/dashboard", self.user_token)
        self.record("Get User Dashboard", status in [200, 403], status, resp)

        # Get global stats
        status, resp = self.get("/admin/tokens/global-stats", self.admin_token)
        passed = status == 200
        self.record("Get Global Stats", passed, status, resp)

        # Get usage logs
        status, resp = self.get("/admin/tokens/logs?limit=10", self.admin_token)
        passed = status == 200 and "logs" in resp
        self.record("Get Usage Logs", passed, status, resp)

        # Get budget alert
        status, resp = self.get("/admin/tokens/budget-alert/test_user?cost_budget=100", self.admin_token)
        passed = status == 200 and "alert" in resp
        self.record("Get Budget Alert", passed, status, resp)

        # Reset user tokens
        status, resp = self.post("/admin/tokens/reset", {
            "user_id": "00000000-0000-0000-0000-000000000000",
            "new_limit": 100000
        }, self.admin_token)
        self.record("Reset User Tokens", status in [200, 404], status, resp)

    # ── Governance Request Flow ─────────────────────────────────────

    def test_governance_request(self):
        self.print_header("GOVERNANCE REQUEST FLOW TESTS")

        # Validate request
        status, resp = self.post("/ai/validate", {
            "model_id": "claude-3-haiku-20240307",
            "task_type": "general",
            "estimated_tokens": 500
        }, self.user_token)
        self.record("Validate AI Request", status in [200, 403], status, resp)

        # AI request
        status, resp = self.post("/ai/request", {
            "prompt": "Hello, test message",
            "task_type": "general",
            "max_tokens": 100
        }, self.user_token)
        self.record("AI Request", status in [200, 403, 500], status, resp)

        # AI request with specific model
        status, resp = self.post("/ai/request", {
            "prompt": "Hello, test message",
            "model_id": "claude-3-haiku-20240307",
            "task_type": "general",
            "max_tokens": 100
        }, self.user_token)
        self.record("AI Request (Specific Model)", status in [200, 403, 500], status, resp)

    # ── Authorization Tests ─────────────────────────────────────────

    def test_authorization(self):
        self.print_header("AUTHORIZATION TESTS")

        # User trying admin endpoints
        status, resp = self.get("/admin/subscriptions", self.user_token)
        passed = status == 403
        self.record("User Blocked from Admin", passed, status, resp)

        # No token
        status, resp = self.get("/admin/subscriptions")
        passed = status in [401, 403]
        self.record("Unauthenticated Blocked", passed, status, resp)

        # Invalid token
        status, resp = self.get("/admin/subscriptions", "invalid_token")
        passed = status == 401
        self.record("Invalid Token Rejected", passed, status, resp)

    # ── System Overview ─────────────────────────────────────────────

    def test_system_overview(self):
        self.print_header("SYSTEM OVERVIEW TESTS")

        status, resp = self.get("/admin/overview", self.admin_token)
        passed = status == 200 and "subscriptions" in resp and "model_access_configs" in resp
        self.record("System Overview", passed, status, resp)

    # ── Run All ─────────────────────────────────────────────────────

    def run_all(self):
        print(f"\n{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"{Colors.BOLD}  AI GOVERNANCE SYSTEM - COMPREHENSIVE API TESTS  {Colors.END}")
        print(f"{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"\n  Target: {self.base_url}")
        print(f"  Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")

        try:
            self.test_health()
            self.test_auth()
            self.test_authorization()
            self.test_subscriptions()
            self.test_subscription_assignment()
            self.test_model_access()
            self.test_feature_flags()
            self.test_policies()
            self.test_token_management()
            self.test_governance_request()
            self.test_system_overview()
        except requests.exceptions.ConnectionError:
            print(f"\n{Colors.RED}ERROR: Cannot connect to {self.base_url}{Colors.END}")
            print(f"{Colors.YELLOW}Make sure the backend server is running.{Colors.END}")
            sys.exit(1)

        # Summary
        self.print_summary()

    def print_summary(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        print(f"\n{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"{Colors.BOLD}  TEST SUMMARY  {Colors.END}")
        print(f"{Colors.BOLD}{'='*60}{Colors.END}")
        print(f"\n  Total:  {total}")
        print(f"  {Colors.GREEN}Passed: {passed}{Colors.END}")
        print(f"  {Colors.RED}Failed: {failed}{Colors.END}")
        print(f"\n  Success Rate: {(passed/total*100):.1f}%")

        if failed > 0:
            print(f"\n{Colors.YELLOW}  Failed Tests:{Colors.END}")
            for r in self.results:
                if not r.passed:
                    print(f"    - {r.name} (HTTP {r.status_code})")
                    if r.error:
                        print(f"      Error: {r.error}")

        print(f"\n{Colors.BOLD}{'='*60}{Colors.END}\n")

        return failed == 0


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else BASE_URL
    tester = GovernanceTester(url)
    success = tester.run_all()
    sys.exit(0 if success else 1)
