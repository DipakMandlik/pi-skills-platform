import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const FRONTEND = 'http://127.0.0.1:3000';
const MCP_BASE = process.env.VITE_MCP_BASE_URL || 'http://127.0.0.1:5000';

const account = process.env.SNOWFLAKE_ACCOUNT;
const username = process.env.SNOWFLAKE_USER;
const password = process.env.SNOWFLAKE_PASSWORD;
const role = (process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN').toUpperCase();

const outDir = 'results/ui-probe';

async function main() {
  const res = await fetch(`${MCP_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, username, password, role }),
  });
  const auth = await res.json();
  if (!auth?.token) throw new Error('No token');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ auth, account, username, role }) => {
    localStorage.setItem('auth_token', auth.token);
    localStorage.setItem('refresh_token', auth.refreshToken);
    localStorage.setItem('sf_account', account);
    localStorage.setItem('sf_username', username);
    localStorage.setItem('sf_role', role);
  }, { auth, account, username, role });

  const routes = ['/dashboard', '/workspace', '/skills', '/models', '/monitoring', '/governance'];
  for (const route of routes) {
    await page.goto(`${FRONTEND}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const title = await page.title();
    const text = await page.locator('body').innerText();
    const trimmed = text.replace(/\s+/g, ' ').slice(0, 400);
    await page.screenshot({ path: `${outDir}/${route.replace('/','') || 'root'}.png`, fullPage: true });
    console.log(`ROUTE ${route}`);
    console.log(`URL ${page.url()}`);
    console.log(`TITLE ${title}`);
    console.log(`TEXT ${trimmed}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
