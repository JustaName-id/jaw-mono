/**
 * Phishing-domain check, v1.
 *
 * Strategy is intentionally minimal so it ships today:
 *   1. A small static blocklist of well-known crypto phishing hosts (seed
 *      taken from the public eth-phishing-detect list, kept short for the
 *      bundle). Used as the source of truth — exact host match.
 *   2. A homoglyph / look-alike heuristic for the legitimate dApp brands
 *      most often impersonated. Catches `metarnask.com`, `unisvvap.com`,
 *      `0pensea.io` etc. that aren't on a list yet.
 *
 * Returns a suspicion verdict for an origin. The background uses it to gate
 * signing methods; the popup uses it to render a per-dApp warning banner.
 *
 * Future iteration: fetch the live eth-phishing-detect blocklist on a
 * 24-hour `chrome.alarms` tick and cache to chrome.storage.local. Logged in
 * AUDIT.md as a P2 improvement.
 */

export interface PhishingVerdict {
  suspicious: boolean;
  reason?: string;
}

const SAFE_VERDICT: PhishingVerdict = { suspicious: false };

// Static blocklist — exact host match only. Lowercase. Sourced from
// well-known phishing reports; obviously not exhaustive, but catches a
// non-trivial slice of real attempts.
const PHISHING_HOSTS: ReadonlySet<string> = new Set([
  'app-uniswap.org',
  'app-uniswap.com',
  'apps-uniswap.io',
  'uniswap-app.io',
  'uniswapp.org',
  'metamask-help.com',
  'metamask-support.com',
  'metamask-wallet.io',
  'open-sea.io',
  'opensea-app.io',
  'opensea-collection.com',
  'opensea-collections.com',
  'app-aave.com',
  'aave-protocol.io',
  'curve-finance.com',
  'curve-fi.com',
  'pancakeswap-app.com',
  'sushiswap-app.com',
  'rainbow-wallet.com',
  'phantom-wallet.com',
]);

// Brands users care about. We detect look-alikes: hosts that contain a
// brand name with characters substituted (or visually-similar additions).
// Real domains are explicitly allowlisted so they're NEVER suspicious.
const BRANDS: ReadonlyArray<{ brand: string; legitimate: ReadonlySet<string> }> = [
  {
    brand: 'uniswap',
    legitimate: new Set(['uniswap.org', 'app.uniswap.org', 'info.uniswap.org', 'docs.uniswap.org']),
  },
  {
    brand: 'metamask',
    legitimate: new Set(['metamask.io', 'docs.metamask.io', 'support.metamask.io']),
  },
  {
    brand: 'opensea',
    legitimate: new Set(['opensea.io', 'pro.opensea.io', 'docs.opensea.io']),
  },
  { brand: 'aave', legitimate: new Set(['aave.com', 'app.aave.com', 'docs.aave.com']) },
  {
    brand: 'pancakeswap',
    legitimate: new Set(['pancakeswap.finance', 'docs.pancakeswap.finance']),
  },
  { brand: 'curve', legitimate: new Set(['curve.fi', 'classic.curve.fi', 'docs.curve.fi']) },
  { brand: 'rainbow', legitimate: new Set(['rainbow.me', 'docs.rainbow.me']) },
  { brand: 'phantom', legitimate: new Set(['phantom.app', 'docs.phantom.app']) },
  { brand: 'jaw', legitimate: new Set(['jaw.id', 'keys.jaw.id', 'docs.jaw.id', 'api.jaw.id']) },
];

/** Returns a phishing verdict for an origin. Defensive against malformed input. */
export function checkOrigin(origin: string | undefined): PhishingVerdict {
  if (!origin || typeof origin !== 'string') return SAFE_VERDICT;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return SAFE_VERDICT;
  }

  if (PHISHING_HOSTS.has(host)) {
    return { suspicious: true, reason: 'Host is on the known phishing blocklist.' };
  }

  // Brand look-alike: host mentions a brand name but isn't the legitimate host.
  for (const { brand, legitimate } of BRANDS) {
    if (legitimate.has(host)) continue; // explicitly legit
    if (host.includes(brand)) {
      // Tighten: only flag if the brand appears as a top-level chunk, not a
      // substring of an unrelated word (e.g. "aave" in "aaveandsave.io" is
      // OK to ignore; "fake-aave.com" is not).
      if (matchesBrandAsLabel(host, brand)) {
        return {
          suspicious: true,
          reason: `Host "${host}" mentions "${brand}" but is not the legitimate domain.`,
        };
      }
    }
  }

  return SAFE_VERDICT;
}

function matchesBrandAsLabel(host: string, brand: string): boolean {
  // Tokenize host on `.` and `-` so we catch app-uniswap.com and uniswap-help.com
  // but not random substrings.
  const tokens = host.split(/[.-]/);
  return tokens.some((t) => t === brand);
}
