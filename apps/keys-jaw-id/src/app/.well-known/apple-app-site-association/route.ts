// Apple App Site Association (AASA) — declares which native apps trust this
// domain for passkeys / universal links. Required for iOS Associated Domains.
//
// Format: <TEAM_ID>.<BUNDLE_ID>
// Team ID: 9234ZPYS2R (JustaName)
//
// Add new RN apps here as they're created.

export const dynamic = 'force-static';

export const GET = () => {
  return Response.json(
    {
      applinks: {
        apps: [],
        details: [],
      },
      webcredentials: {
        apps: [
          '9234ZPYS2R.id.jaw.rntest',
          '9234ZPYS2R.id.jaw.demo.native',
        ],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};
