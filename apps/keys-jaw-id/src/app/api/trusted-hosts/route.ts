/**
 * Operator-managed list of embedder hostnames allowed to render the keys
 * iframe on browsers that cannot verify occlusion (no IntersectionObserver v2,
 * e.g. Firefox). The SDK's TransportRouter fetches this once at init and merges
 * it into its compiled-in baseline; an unreachable or empty endpoint simply
 * leaves untrusted embedders routed to the popup (fail-closed).
 *
 * The list is sourced from the `JAW_TRUSTED_HOSTS` env var (comma-separated
 * hostnames) so a partner can be vetted by changing config — no SDK publish or
 * keys redeploy of code required.
 */
export const dynamic = 'force-dynamic';

function readTrustedHosts(): string[] {
  return (process.env.JAW_TRUSTED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

export async function GET() {
  return Response.json(
    { hosts: readTrustedHosts() },
    {
      headers: {
        // Public, non-sensitive allow-list — readable cross-origin by any dApp
        // SDK. Fetched with `credentials: 'omit'`, so a wildcard is safe.
        'Access-Control-Allow-Origin': '*',
        // Edge/CDN may cache; clients refetch at most hourly.
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}
