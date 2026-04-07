import dotenv from 'dotenv';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const FRONTEND = process.env.UI_BASE_URL || 'http://localhost:3000';
const MCP_BASE = process.env.VITE_MCP_BASE_URL || 'http://127.0.0.1:5000';
const RESULTS_DIR = process.env.TEST_RESULTS_DIR || 'results';
const account = process.env.SNOWFLAKE_ACCOUNT;
const username = process.env.SNOWFLAKE_USER;
const password = process.env.SNOWFLAKE_PASSWORD;
const role = (process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN').toUpperCase();

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function persistUiArtifacts(summary) {
  const artifactDir = path.join(RESULTS_DIR, 'ui-e2e');
  fs.mkdirSync(artifactDir, { recursive: true });
  const ts = stamp();
  const jsonPath = path.join(artifactDir, `ui_e2e_summary_${ts}.json`);
  const mdPath = path.join(artifactDir, `ui_e2e_summary_${ts}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const md = [
    '# UI E2E Summary',
    `- Generated: ${new Date().toISOString()}`,
    `- Role: ${summary.role}`,
    `- Checks: ${summary.checks}`,
    `- Failures: ${summary.failures.length}`,
    '',
    '## Failures',
    ...(summary.failures.length ? summary.failures.map((f) => `- ${f}`) : ['- None']),
  ].join('\n');
  fs.writeFileSync(mdPath, md);

  fs.writeFileSync(path.join(artifactDir, 'ui_e2e_summary_latest.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(artifactDir, 'ui_e2e_summary_latest.md'), md);
  return { jsonPath, mdPath };
}

if (!account || !username || !password) {
  console.error('Missing SNOWFLAKE_ACCOUNT / SNOWFLAKE_USER / SNOWFLAKE_PASSWORD in env.');
  process.exit(2);
}

async function loginViaMcp() {
  const res = await fetch(`${MCP_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, username, password, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new Error(`MCP auth failed (${res.status})`);
  }
  return body;
}

async function run() {
  const auth = await loginViaMcp();
  const isAdmin = auth?.user?.role === 'ADMIN';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const badResponses = [];
  const failures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      consoleErrors.push(`${msg.text()} @ ${loc?.url || 'unknown'}`);
    }
  });

  page.on('response', (resp) => {
    const status = resp.status();
    const url = resp.url();
    const isAppEndpoint = url.includes('127.0.0.1') || url.includes('localhost');
    if (status >= 400 && isAppEndpoint && !url.includes('favicon.ico')) {
      badResponses.push({ status, url });
    }
  });

  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const unauthBody = await page.locator('body').innerText();
  const unauthRedirectedToLogin = page.url().includes('/login');
  const unauthLooksLikeLogin = /login|sign in|email|password/i.test(unauthBody);
  if (!unauthRedirectedToLogin && !unauthLooksLikeLogin) {
    failures.push(`Unauthenticated /dashboard should redirect to /login or show login UI (actual: ${page.url()})`);
  }

  await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.evaluate(({ auth, account, username, role }) => {
    localStorage.setItem('auth_token', auth.token);
    localStorage.setItem('refresh_token', auth.refreshToken);
    localStorage.setItem('sf_account', account);
    localStorage.setItem('sf_username', username);
    localStorage.setItem('sf_role', role);
  }, { auth, account, username, role });

  const checks = [
    { path: '/dashboard' },
    { path: '/workspace' },
    { path: '/skills' },
    { path: '/models' },
    { path: '/monitoring' },
    { path: '/governance' },
  ];

  for (const check of checks) {
    await page.goto(`${FRONTEND}${check.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const currentUrl = page.url();
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    const shouldBeProtectedDenied = !isAdmin && ['/skills', '/models', '/governance'].includes(check.path);

    if (shouldBeProtectedDenied) {
      const isUnauthorizedRoute = page.url().includes('/unauthorized');
      const denied = /Access Denied/i.test(bodyText);
      if (!denied || !isUnauthorizedRoute) {
        failures.push(`Expected /unauthorized + Access Denied on ${check.path}, got ${currentUrl}`);
      }
      continue;
    }

    const redirectedToLogin = currentUrl.includes('/login');
    const redirectedToUnauthorized = currentUrl.includes('/unauthorized');
    if (redirectedToLogin || redirectedToUnauthorized) {
      failures.push(`Expected authenticated render on ${check.path}, got ${currentUrl}`);
    }

    const accessDenied = /Access Denied/i.test(bodyText);
    if (accessDenied && check.path !== '/unauthorized') {
      failures.push(`Unexpected access denied on ${check.path}`);
    }

    const errorBanner = /Failed to load|Request failed|Session expired|Unauthorized|Unexpected token/i.test(bodyText);
    if (errorBanner) {
      failures.push(`Error banner visible on ${check.path}`);
    }
  }

  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  if (page.url().includes('/login')) {
    failures.push('Session did not persist after dashboard reload');
  }

  if (badResponses.length > 0) {
    failures.push(`Detected ${badResponses.length} failing API responses`);
  }

  if (consoleErrors.length > 0) {
    failures.push(`Detected ${consoleErrors.length} console errors`);
  }

  const summary = {
    role: auth?.user?.role || 'UNKNOWN',
    checks: checks.length,
    failures,
    badResponses: badResponses.slice(0, 20),
    consoleErrors: consoleErrors.slice(0, 20),
  };

  const artifactPaths = persistUiArtifacts(summary);

  console.log('UI_E2E_SUMMARY');
  console.log(JSON.stringify({
    ...summary,
    artifacts: artifactPaths,
  }, null, 2));

  await browser.close();

  if (failures.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('UI_E2E_FATAL', err.message);
  process.exit(1);
});
