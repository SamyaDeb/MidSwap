/**
 * fund-wallet.ts
 * Uses Playwright to open the Midnight preprod faucet, fill in our wallet address,
 * solve the Cloudflare Turnstile (which auto-solves in a real browser), and submit.
 * Then polls for success.
 *
 * Usage:
 *   WALLET_ADDRESS=<night_address> npx tsx scripts/fund-wallet.ts
 */

import { chromium } from 'playwright';

const WALLET_ADDRESS =
  process.env.WALLET_ADDRESS ||
  'cded1720b57cb367575dfd3c48de314d2db12065805b134f3637df6d0118c0a4';

const FAUCET_URL = 'https://faucet.preprod.midnight.network';
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 300_000; // 5 minutes

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollStatus(requestId: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(`${FAUCET_URL}/api/request-status/${requestId}`);
      const data = (await res.json()) as { status: string };
      console.log(`  [poll] status = ${data.status}`);
      if (data.status === 'success') return true;
      if (data.status === 'failure') return false;
    } catch (e) {
      console.log(`  [poll] error: ${e}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function main() {
  console.log(`Funding wallet: ${WALLET_ADDRESS}`);
  console.log('Launching Chromium (non-headless so Turnstile can auto-solve)…');

  const browser = await chromium.launch({
    headless: false, // Turnstile needs a real render context
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Intercept faucet API responses to capture the request ID
  let requestId: string | null = null;
  page.on('response', async (response) => {
    if (response.url().includes('/api/request-tokens')) {
      try {
        const body = await response.json();
        console.log('Faucet API response:', JSON.stringify(body));
        if (body.requestId) requestId = body.requestId;
        if (body.id) requestId = body.id;
      } catch {}
    }
  });

  console.log(`Navigating to ${FAUCET_URL} …`);
  await page.goto(FAUCET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Find and fill the address input
  console.log('Looking for address input…');
  const addressInput = await page.waitForSelector(
    'input[type="text"], input[placeholder*="dress"], input[name*="address"], input[id*="address"]',
    { timeout: 15_000 }
  );
  await addressInput.fill(WALLET_ADDRESS);
  console.log('Address filled.');

  // Wait for Turnstile to auto-complete (look for checkbox or iframe becoming non-interactive)
  console.log('Waiting for Turnstile to auto-solve (up to 30s)…');
  await sleep(5_000); // give the widget a moment to initialize

  // Try to find and click a verified Turnstile state, or just wait
  try {
    // Turnstile iframe becomes solved when the hidden input gets a token value
    await page.waitForFunction(
      () => {
        const inputs = document.querySelectorAll('input[name="cf-turnstile-response"]');
        for (const inp of inputs) {
          if ((inp as HTMLInputElement).value && (inp as HTMLInputElement).value.length > 10) return true;
        }
        return false;
      },
      { timeout: 30_000 }
    );
    console.log('Turnstile solved!');
  } catch {
    console.log('Turnstile wait timed out — attempting submit anyway…');
  }

  // Find and click the submit button
  console.log('Clicking submit button…');
  const submitBtn = await page.waitForSelector(
    'button[type="submit"], button:has-text("Request"), button:has-text("Get"), button:has-text("Fund"), button:has-text("Send")',
    { timeout: 10_000 }
  );
  await submitBtn.click();
  console.log('Submit clicked.');

  // Wait a moment for network response
  await sleep(5_000);

  if (requestId) {
    console.log(`Got requestId: ${requestId}`);
    console.log('Polling for success…');
    const ok = await pollStatus(requestId);
    if (ok) {
      console.log('SUCCESS: tNight tokens sent to wallet!');
    } else {
      console.log('FAILED: faucet did not send tokens.');
    }
  } else {
    // Try to read success/error message from page
    console.log('No requestId captured. Checking page for messages…');
    await sleep(3_000);
    const bodyText = await page.innerText('body');
    console.log('Page body excerpt:', bodyText.slice(0, 500));
  }

  await browser.close();
}

main().catch((e) => {
  console.error('fund-wallet error:', e);
  process.exit(1);
});
