/**
 * Real-browser E2E for the embedded iframe transport. Covers what jsdom/unit
 * tests cannot: real CSS compositing, the browser's iframe color-scheme canvas
 * behavior, and the per-engine security gates. Runs on chromium/firefox/webkit
 * (webkit ≈ Safari) via JAW_E2E_BROWSER. No API key needed.
 *
 * Modes (errors/guards are the priority — they catch the dangerous regressions):
 *
 *   default                  Chromium: assert the see-through prewarmed iframe
 *                            (color-scheme:normal, embedded, theme sync,
 *                            transparent, reveal-gating). Firefox/WebKit (no
 *                            IntersectionObserver v2): assert the clickjacking
 *                            guard does NOT embed an untrusted host.
 *
 *   JAW_E2E_KEYS_DOWN=1      ERROR: block the keys origin; assert the transport
 *                            degrades gracefully — no broken frame is ever shown
 *                            (reveal gating) and the dApp does not hang.
 *
 *   JAW_E2E_TRUSTED=1        Trusted host (keys started with
 *                            JAW_TRUSTED_HOSTS=localhost): assert the see-through
 *                            iframe core renders on EVERY engine.
 *
 * Prerequisites (this script does NOT start them):
 *   keys app   on $JAW_E2E_KEYS_URL        (default http://localhost:3001)
 *   playground on $JAW_E2E_PLAYGROUND_URL   (default http://localhost:3002),
 *     started with NEXT_PUBLIC_KEYS_URL pointing at the keys app.
 *
 * Run:  node e2e/iframe-transport.e2e.mjs
 * Exit: 0 on pass, 1 on failure / unmet prerequisites.
 */
import { chromium, firefox, webkit } from 'playwright';

const KEYS_URL = process.env.JAW_E2E_KEYS_URL ?? 'http://localhost:3001';
const PLAYGROUND_URL = process.env.JAW_E2E_PLAYGROUND_URL ?? 'http://localhost:3002';

// Engine selection (CI matrixes over these; webkit ≈ Safari, firefox = Firefox).
const ENGINES = { chromium, firefox, webkit };
const ENGINE = process.env.JAW_E2E_BROWSER ?? 'chromium';
const browserType = ENGINES[ENGINE];
if (!browserType) {
  console.error(`Unknown JAW_E2E_BROWSER "${ENGINE}" — use one of: ${Object.keys(ENGINES).join(', ')}`);
  process.exit(1);
}

// Trusted-host fixture: when the keys app is started with JAW_TRUSTED_HOSTS=localhost,
// the see-through iframe is allowed on EVERY engine (not just Chromium). Set
// JAW_E2E_TRUSTED=1 to assert that path. See e2e/README.md.
const TRUSTED = process.env.JAW_E2E_TRUSTED === '1';

// Error fixture: JAW_E2E_KEYS_DOWN=1 makes the harness block every request to
// the keys origin (simulating an unreachable/broken keys app) and asserts the
// transport degrades gracefully — no broken embedded frame is ever shown, and
// the dApp does not hang.
const KEYS_DOWN = process.env.JAW_E2E_KEYS_DOWN === '1';

if (KEYS_DOWN && TRUSTED) {
  console.error('JAW_E2E_KEYS_DOWN and JAW_E2E_TRUSTED are mutually exclusive — set only one.');
  process.exit(1);
}

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

/**
 * Core see-through assertions for a mounted embedded iframe — the transport-level
 * guarantees that hold on every engine: the iframe is mounted, points at keys,
 * keeps `color-scheme: normal` (no opaque canvas), and runs in embedded mode.
 * Returns the inspected keys-frame state for callers that want to add stable,
 * theme-dependent checks. (The theme/transparency details are asserted only in
 * the stable prewarm path — in the connect-driven path the dApp's per-engine
 * theme resolution and frame-render timing make them flaky, not the transport.)
 */
async function assertSeeThroughCore(page) {
  await page.waitForSelector('dialog[data-jaw] iframe', { state: 'attached', timeout: 15000 });
  const keysHost = new URL(KEYS_URL).host;
  const srcOk = await page
    .$eval('dialog[data-jaw] iframe', (el, host) => el.src.includes(host), keysHost)
    .catch(() => false);
  check('embedded iframe points at the keys app', srcOk, srcOk ? '' : 'missing NEXT_PUBLIC_KEYS_URL?');

  // Regression: the iframe element must keep color-scheme:normal, otherwise the
  // browser paints an opaque canvas (white) that hides the host dApp.
  const colorScheme = await page
    .$eval('dialog[data-jaw] iframe', (el) => getComputedStyle(el).colorScheme)
    .catch(() => '(unreadable)');
  check('iframe canvas is see-through (color-scheme:normal)', colorScheme === 'normal', `color-scheme=${colorScheme}`);

  // Wait for the handshake to flag embedded mode on the keys document.
  let keys = null;
  for (let i = 0; i < 12 && (!keys || keys.err); i++) {
    await page.waitForTimeout(700);
    keys = await inspectKeysFrame(page);
  }
  check('keys iframe present', !!keys && !keys.err, keys?.err ?? '');
  check('iframe runs in embedded mode (jaw-embedded)', keys?.embedded === true, `htmlClass="${keys?.htmlClass}"`);
  return keys;
}

/**
 * Open the playground's connect modal and execute it — mounts the keys iframe.
 * Stops BEFORE the passkey ceremony (which only fires on user action inside the
 * keys dialog), so it works on every engine without a virtual authenticator.
 */
async function driveConnect(page) {
  await page.getByRole('button', { name: 'Connect', exact: true }).click({ timeout: 8000 });
  await page.getByRole('button', { name: 'Execute' }).click({ timeout: 8000 });
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

  const mode = KEYS_DOWN ? 'keys-down (error)' : TRUSTED ? 'trusted host' : 'default';
  console.log(`\n▶ engine: ${ENGINE} · mode: ${mode}`);
  const browser = await browserType.launch();
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

  // The clickjacking guard only lets an UNTRUSTED host embed the iframe
  // when the browser can verify visibility via IntersectionObserver v2 — which
  // is Chromium-only. On Firefox/WebKit an untrusted host falls back to the
  // popup and does NOT prewarm-mount the iframe.
  const expectsIframe = ENGINE === 'chromium';

  try {
    if (KEYS_DOWN) {
      // ─── ERROR PATH: keys app unreachable ───────────────────────────────
      // Block every request to the keys origin, then load the dApp. The SDK
      // must degrade gracefully: it may mount the iframe element, but the
      // handshake never completes, so the frame is NEVER revealed to the user
      // (reveal gating), and the dApp keeps working.
      const keysHost = new URL(KEYS_URL).host;
      await ctx.route('**/*', (route) => {
        const host = (() => {
          try {
            return new URL(route.request().url()).host;
          } catch {
            return '';
          }
        })();
        return host === keysHost ? route.abort() : route.continue();
      });

      await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000); // let the handshake fail / time out

      const visibility = await page
        .$eval('dialog[data-jaw] iframe', (el) => getComputedStyle(el).visibility)
        .catch(() => null); // null = no iframe mounted at all
      check(
        'keys unreachable: no broken embedded frame is ever shown (reveal gating)',
        visibility === null || visibility === 'hidden',
        `iframe visibility=${visibility}`
      );

      const dappAlive = await page
        .getByRole('button', { name: 'Connect', exact: true })
        .isVisible()
        .catch(() => false);
      check('keys unreachable: the dApp stays responsive (no hang)', dappAlive);
    } else if (TRUSTED) {
      // ─── SUCCESS PATH: trusted host, see-through on EVERY engine ─────────
      // Needs the keys app started with JAW_TRUSTED_HOSTS=localhost. On non-IOv2
      // engines prewarm races ahead of the trusted-hosts refresh, so a connect
      // mounts the iframe (the refresh has populated the registry by then).
      await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000); // let /api/trusted-hosts refresh populate
      await driveConnect(page);
      await assertSeeThroughCore(page);
    } else if (expectsIframe) {
      // ─── SUCCESS PATH: Chromium, iframe prewarms on load ────────────────
      await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'networkidle' });
      const keys = await assertSeeThroughCore(page);
      // Stable prewarm path: also assert theme sync + document transparency.
      if (keys && !keys.err) {
        check('theme sync follows the dApp light mode (no .dark)', keys.hasDark === false, `htmlClass="${keys.htmlClass}"`);
        check('embedded document body is transparent', keys.bodyBg === 'rgba(0, 0, 0, 0)', `bodyBg=${keys.bodyBg}`);
      }

      // Reveal gating: even with the handshake done, the prewarmed iframe stays
      // hidden until an actual request — the user never sees it unprompted.
      const visibility = await page
        .$eval('dialog[data-jaw] iframe', (el) => getComputedStyle(el).visibility)
        .catch(() => '(unreadable)');
      check('prewarmed iframe stays hidden until a request (reveal gating)', visibility === 'hidden', `visibility=${visibility}`);
    } else {
      // ─── GUARD PATH: untrusted host on a non-IOv2 engine ────────────────
      await page.goto(`${PLAYGROUND_URL}/wagmi`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(5000); // give prewarm a chance to (not) mount
      const iframeMounted = (await page.$('dialog[data-jaw] iframe')) !== null;
      check(
        'untrusted host on a non-IOv2 engine does NOT embed (popup fallback)',
        iframeMounted === false,
        iframeMounted ? 'iframe was embedded without a visibility guarantee' : ''
      );
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[${ENGINE}] ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
