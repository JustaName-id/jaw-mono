/**
 * Real-browser E2E for the iframe transport + theme sync.
 *
 * Unlike the jsdom integration test (apps/keys-jaw-id/.../transport-integration.test.ts),
 * this drives a real Chromium with a virtual WebAuthn authenticator, so it
 * exercises the actual passkey-gated connect flow and the real CSS rendering
 * that jsdom cannot. It reuses the `playwright` dependency (no @playwright/test).
 *
 * Prerequisites (this script does NOT start them):
 *   1. keys app on $JAW_E2E_KEYS_URL (default http://localhost:3001)
 *   2. playground on $JAW_E2E_PLAYGROUND_URL (default http://localhost:3002),
 *      started with NEXT_PUBLIC_KEYS_URL pointing at the keys app and
 *      NEXT_PUBLIC_API_KEY set.
 *
 * Run:  node e2e/iframe-transport.e2e.mjs
 * Exit: 0 on pass, 1 on failure / unmet prerequisites.
 */
import { chromium } from 'playwright';

const KEYS_URL = process.env.JAW_E2E_KEYS_URL ?? 'http://localhost:3001';
const PLAYGROUND_URL = process.env.JAW_E2E_PLAYGROUND_URL ?? 'http://localhost:3002';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok || r.status === 404; // 404 root is fine; server is up
  } catch {
    return false;
  }
}

async function inspectKeysFrame(page) {
  for (const f of page.frames()) {
    if (f.url().includes(new URL(KEYS_URL).host)) {
      return f
        .evaluate(() => ({
          htmlClass: document.documentElement.className,
          hasDark: !!document.querySelector('.dark'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
        }))
        .catch((e) => ({ err: e.message }));
    }
  }
  return null;
}

async function run() {
  if (!(await reachable(`${KEYS_URL}/`)) || !(await reachable(`${PLAYGROUND_URL}/wagmi`))) {
    console.error(
      `\nServers not reachable. Start them first:\n` +
        `  bunx nx dev @jaw-mono/keys-jaw-id --port=3001\n` +
        `  NEXT_PUBLIC_API_KEY=<key> NEXT_PUBLIC_KEYS_URL=${KEYS_URL} bunx nx dev @jaw-mono/playground --port=3002\n`
    );
    process.exit(1);
  }

  const browser = await chromium.launch();
  // OS dark, but force the playground itself to light — the scenario that
  // originally rendered the dialog dark. The dialog must follow the dApp.
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light');
    } catch {
      /* ignore */
    }
  });

  const client = await ctx.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  try {
    await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    check('playground renders light', (await page.evaluate(() => document.documentElement.className)) === 'light');

    // The iframe transport is the default and prewarms on load: the SDK mounts
    // the keys iframe and completes the config handshake (which carries the
    // dApp theme) without any user action. Wait for that, then assert the
    // theme was applied — deterministic, no flaky modal driving needed.
    await page.waitForSelector('dialog[data-jaw] iframe', { state: 'attached', timeout: 15000 });
    const keysHost = new URL(KEYS_URL).host;
    const srcOk = await page.$eval('dialog[data-jaw] iframe', (el, host) => el.src.includes(host), keysHost).catch(() => false);
    check('iframe points at the configured keys app', srcOk, srcOk ? '' : 'playground likely missing NEXT_PUBLIC_KEYS_URL');

    // Give the prewarm handshake time to deliver + apply the theme.
    let keys = null;
    for (let i = 0; i < 12 && (!keys || keys.err); i++) {
      await page.waitForTimeout(700);
      keys = await inspectKeysFrame(page);
    }
    check('keys iframe present', !!keys && !keys.err, keys?.err ?? '');
    if (keys && !keys.err) {
      check('iframe follows the dApp light mode (no .dark)', keys.hasDark === false, `htmlClass="${keys.htmlClass}"`);
      check('iframe dialog has a solid light background', keys.bodyBg === 'rgb(255, 255, 255)', `bodyBg=${keys.bodyBg}`);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
