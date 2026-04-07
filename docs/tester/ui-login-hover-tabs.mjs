import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const FRONTEND = process.env.UI_BASE_URL || 'http://localhost:3000';
const account = process.env.LOGIN_SNOWFLAKE_ACCOUNT || process.env.SNOWFLAKE_ACCOUNT || 'WRBPMWS-WQ81670';
const username = process.env.LOGIN_SNOWFLAKE_USER || process.env.SNOWFLAKE_USER;
const password = process.env.LOGIN_SNOWFLAKE_PASSWORD || process.env.SNOWFLAKE_PASSWORD;
const role = (process.env.LOGIN_SNOWFLAKE_ROLE || process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN').toUpperCase();

if (!username || !password) {
  console.error('Missing SNOWFLAKE_USER / SNOWFLAKE_PASSWORD for UI login test.');
  process.exit(2);
}

const NAV_TABS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Workspace', path: '/workspace' },
  { label: 'Skills', path: '/skills' },
  { label: 'Models', path: '/models' },
  { label: 'Monitoring', path: '/monitoring' },
  { label: 'AI Governance', path: '/governance' },
];

function navCandidates(page, label) {
  return [
    page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
    page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
    page.locator('nav').getByText(new RegExp(`^${label}$`, 'i')),
    page.locator('aside').getByText(new RegExp(`^${label}$`, 'i')),
    page.locator('*').getByText(new RegExp(`^${label}$`, 'i')),
  ];
}

async function findNavTarget(page, label) {
  for (const candidate of navCandidates(page, label)) {
    const count = await candidate.count();
    if (!count) continue;
    for (let i = 0; i < count; i++) {
      const item = candidate.nth(i);
      if (await item.isVisible().catch(() => false)) {
        return item;
      }
    }
  }
  return null;
}

async function loginViaUi(page) {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const accountInput = page.locator('input[placeholder*="WRBPMWS"], input[placeholder*="Account" i]').first();
  if (await accountInput.count()) {
    await accountInput.fill(account);
  }

  const userInput = page.locator('input[placeholder*="PIQLENS" i], input[placeholder*="Username" i], input[autocomplete="username"]').first();
  await userInput.fill(username);

  const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  await passwordInput.fill(password);

  const roleInput = page.locator('input[placeholder*="ACCOUNTADMIN" i], input[placeholder*="Role" i]').first();
  if (await roleInput.count()) {
    await roleInput.fill(role);
  }

  await page.getByRole('button', { name: /Connect to Snowflake/i }).click();

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 90000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const badResponses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      consoleErrors.push(`${msg.text()} @ ${loc?.url || 'unknown'}`);
    }
  });

  page.on('response', async (resp) => {
    const status = resp.status();
    const url = resp.url();
    const isAppEndpoint = url.includes('127.0.0.1') || url.includes('localhost');
    if (status >= 400 && isAppEndpoint && !url.includes('favicon.ico')) {
      let responseBody = '';
      try {
        responseBody = (await resp.text()).slice(0, 500);
      } catch {
        responseBody = '';
      }

      const req = resp.request();
      let requestBody = '';
      try {
        requestBody = (req.postData() || '').slice(0, 500);
      } catch {
        requestBody = '';
      }

      badResponses.push({
        status,
        url,
        method: req.method(),
        requestBody,
        responseBody,
      });
    }
  });

  await loginViaUi(page);

  const results = [];
  const failures = [];

  for (const tab of NAV_TABS) {
    const { label, path } = tab;
    const navItem = await findNavTarget(page, label);
    const hrefItem = page.locator(`a[href='${path}'], a[href$='${path}']`).first();

    if (navItem) {
      await navItem.hover();
      await navItem.click();
      await page.waitForTimeout(1500);
    } else if (await hrefItem.count()) {
      await hrefItem.hover();
      await hrefItem.click();
      await page.waitForTimeout(1500);
    } else {
      // Fallback route-level check if nav control is not discoverable in current layout.
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);
    }

    const url = page.url();
    const bodyText = await page.locator('body').innerText();
    const hasErrorBanner = /Failed to load|Request failed|Session expired|Unauthorized|Unexpected token/i.test(bodyText);

    if (hasErrorBanner) {
      failures.push(`Error banner visible after opening ${label}`);
    }

    const openedExpectedRoute = url.includes(path);
    if (!openedExpectedRoute) {
      failures.push(`Expected route ${path} after opening ${label}, got ${url}`);
    }

    results.push({
      tab: label,
      visible: Boolean(navItem) || Boolean(await hrefItem.count()),
      hovered: Boolean(navItem) || Boolean(await hrefItem.count()),
      opened: openedExpectedRoute,
      url,
    });
  }

  if (badResponses.length > 0) {
    failures.push(`Detected ${badResponses.length} failing API responses`);
  }
  if (consoleErrors.length > 0) {
    failures.push(`Detected ${consoleErrors.length} console errors`);
  }

  console.log('UI_LOGIN_HOVER_SUMMARY');
  console.log(JSON.stringify({
    account,
    role,
    currentUrl: page.url(),
    results,
    failures,
    badResponses: badResponses.slice(0, 20),
    consoleErrors: consoleErrors.slice(0, 20),
  }, null, 2));

  await browser.close();

  if (failures.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('UI_LOGIN_HOVER_FATAL', err.message);
  process.exit(1);
});
