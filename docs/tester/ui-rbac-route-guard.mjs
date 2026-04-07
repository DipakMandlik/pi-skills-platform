import { chromium } from 'playwright';

const FRONTEND_BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:3000';
const BACKEND_BASE = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000';

const USERS = [
  {
    key: 'admin',
    email: process.env.UI_ADMIN_EMAIL || 'admin@platform.local',
    password: process.env.UI_ADMIN_PASSWORD || 'admin123',
    denyProtected: false,
  },
  {
    key: 'user',
    email: process.env.UI_USER_EMAIL || 'user@platform.local',
    password: process.env.UI_USER_PASSWORD || 'user123',
    denyProtected: true,
  },
];

const ROUTE_CHECKS = [
  { path: '/dashboard', expected: [], protected: false },
  { path: '/workspace', expected: [/Workspace/i], protected: false },
  { path: '/monitoring', expected: [/Monitoring/i, /My Activity/i, /System Monitoring/i], protected: false },
  { path: '/skills', expected: [/Skills/i, /Skill/i], protected: true },
  { path: '/models', expected: [/Models/i, /Available Models/i, /Model Access/i], protected: true },
  { path: '/governance', expected: [/Governance/i, /AI Governance/i], protected: true },
];

async function login(email, password) {
  const response = await fetch(`${BACKEND_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return body.access_token;
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

async function runForUser(browser, userDef) {
  const token = await login(userDef.email, userDef.password);
  const context = await browser.newContext();
  const page = await context.newPage();

  const failures = [];
  const routeResults = [];

  await page.goto(`${FRONTEND_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((authToken) => {
    localStorage.setItem('auth_token', authToken);
    localStorage.removeItem('refresh_token');
  }, token);

  await page.goto(`${FRONTEND_BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);

  for (const check of ROUTE_CHECKS) {
    await page.goto(`${FRONTEND_BASE}${check.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('body').innerText();
    const currentUrl = page.url();
    const deniedView = /Access Denied|Unauthorized/i.test(bodyText) || currentUrl.includes('/unauthorized');

    if (check.protected && userDef.denyProtected) {
      if (!deniedView) {
        failures.push(`${userDef.key}: expected deny on ${check.path}, got ${currentUrl}`);
      }
    } else {
      if (deniedView) {
        failures.push(`${userDef.key}: unexpected deny on ${check.path}`);
      }
      if (check.expected.length > 0 && !hasAnyPattern(bodyText, check.expected)) {
        failures.push(`${userDef.key}: missing expected content on ${check.path}`);
      }
    }

    routeResults.push({
      path: check.path,
      url: currentUrl,
      denied: deniedView,
    });
  }

  await context.close();
  return { user: userDef.key, failures, routes: routeResults };
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const userDef of USERS) {
    results.push(await runForUser(browser, userDef));
  }

  await browser.close();

  const failures = results.flatMap((result) => result.failures);

  console.log('UI_RBAC_SUMMARY');
  console.log(JSON.stringify({
    frontend: FRONTEND_BASE,
    backend: BACKEND_BASE,
    checks: ROUTE_CHECKS.length,
    users: results,
    failures,
  }, null, 2));

  if (failures.length > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('UI_RBAC_FATAL', error.message);
  process.exit(1);
});
