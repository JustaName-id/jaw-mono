/**
 * Minimal real-browser E2E for the embedded iframe transport.
 *
 * Covers what jsdom/unit tests cannot: real CSS compositing and the browser's
 * iframe color-scheme behavior. It asserts the deterministic, load-time state
 * (the prewarmed iframe) and deliberately does NOT drive the passkey/connect
 * flow — that keeps it stable and means no API key is needed, only the two dev
 * servers.
 *
 * Asserts:
 *   1. the embedded iframe is the default transport (mounted + pointed at keys)
 *   2. the iframe runs in embedded mode (jaw-embedded)
 *   3. theme sync: the dialog follows the dApp's light mode, not the OS
 *   4. the embedded document is transparent (html/body)
 *   5. regression: the iframe ELEMENT keeps color-scheme:normal so the browser
 *      does not paint an opaque canvas that hides the host dApp (see-through)
 *
 * Prerequisites (this script does NOT start them):
 *   keys app   on $JAW_E2E_KEYS_URL        (default http://localhost:3001)
 *   playground on $JAW_E2E_PLAYGROUND_URL   (default http://localhost:3002),
 *     started with NEXT_PUBLIC_KEYS_URL pointing at the keys app.
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
    return r.ok || r.status === 404; // server is up
  } catch {
    return false;
  }
}

/** Read theme/transparency state from inside the keys iframe document. */
async function inspectKeysFrame(page) {
  for (const f of page.frames()) {
    if (f.url().includes(new URL(KEYS_URL).host)) {
      return f
        .evaluate(() => ({
          htmlClass: document.documentElement.className,
          hasDark: !!document.querySelector('.dark'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          embedded: document.documentElement.classList.contains('jaw-embedded'),
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
        `  NEXT_PUBLIC_KEYS_URL=${KEYS_URL} bunx nx dev @jaw-mono/playground --port=3002\n`
    );
    process.exit(1);
  }

  const browser = await chromium.launch();
  // OS dark, dApp forced light — theme sync must follow the dApp, not the OS.
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light');
    } catch {
      /* ignore */
    }
  });

  try {
    await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'networkidle' });

    // The iframe transport is the default and prewarms on load — no user action.
    await page.waitForSelector('dialog[data-jaw] iframe', { state: 'attached', timeout: 15000 });
    const keysHost = new URL(KEYS_URL).host;
    const srcOk = await page
      .$eval('dialog[data-jaw] iframe', (el, host) => el.src.includes(host), keysHost)
      .catch(() => false);
    check('embedded iframe is the default transport', srcOk, srcOk ? '' : 'missing NEXT_PUBLIC_KEYS_URL?');

    // Regression: the iframe element must keep color-scheme:normal, otherwise the
    // browser paints an opaque canvas (white) that hides the host dApp.
    const colorScheme = await page
      .$eval('dialog[data-jaw] iframe', (el) => getComputedStyle(el).colorScheme)
      .catch(() => '(unreadable)');
    check('iframe canvas is see-through (color-scheme:normal)', colorScheme === 'normal', `color-scheme=${colorScheme}`);

    // Wait for the prewarm handshake to deliver + apply the dApp theme.
    let keys = null;
    for (let i = 0; i < 12 && (!keys || keys.err); i++) {
      await page.waitForTimeout(700);
      keys = await inspectKeysFrame(page);
    }
    check('keys iframe present', !!keys && !keys.err, keys?.err ?? '');
    if (keys && !keys.err) {
      check('iframe runs in embedded mode (jaw-embedded)', keys.embedded === true, `htmlClass="${keys.htmlClass}"`);
      check('theme sync follows the dApp light mode (no .dark)', keys.hasDark === false, `htmlClass="${keys.htmlClass}"`);
      check('embedded document body is transparent', keys.bodyBg === 'rgba(0, 0, 0, 0)', `bodyBg=${keys.bodyBg}`);
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
