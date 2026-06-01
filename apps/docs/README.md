# @jaw-mono/docs

Documentation site for JAW.id, built with [Vocs](https://vocs.dev) **v2** (Waku/RSC + Vite).

## Commands

```bash
# Build the static site (+ generate the custom llms.txt scheme)
bunx nx build docs

# Preview the built static site locally  (use this for local preview — see note below)
bunx nx serve docs        # runs `vocs preview`

# Live-reload dev server  (currently broken upstream — see Known Issues)
bunx nx dev docs          # runs `vocs dev`
```

## Project layout (Vocs v2)

- Pages live in `docs/pages` (configured via `srcDir: 'docs'` in `vocs.config.ts`;
  Vocs v2's default is `src/pages`).
- Static/public assets (logo, favicon) live in `public/` at the app root
  (`apps/docs/public`). Vocs v2 resolves the public dir as `<rootDir>/public`
  (rootDir = cwd); note this is **not** under `srcDir`. In Vocs v1 these were in
  `docs/public`.
- Build output goes to `docs/dist` (`outDir`). With `renderStrategy: 'full-static'`,
  the **served static site is emitted into `docs/dist/public`** — this is the web root.
- `scripts/generate-llms.ts` runs after `vocs build` and writes the custom
  domain-split llms scheme (`llms.txt` routing index + `llms-<domain>.txt`) into the
  web root (`docs/dist/public`), overwriting Vocs's native `llms.txt`/`llms-full.txt`.

## Deployment

The deploy platform's **publish/output directory must point at `apps/docs/docs/dist/public`**
(the `full-static` web root). In Vocs v1 it was `apps/docs/docs/dist`; v2 nests the
static site one level deeper under `public/`. Update the hosting config accordingly.

## Known Issues

### `vocs dev` fails with a `react-server` condition error

Running `vocs dev` currently fails with:

```
Internal server error: The "react" package in this environment is not configured
correctly. The "react-server" condition must be enabled in any environment that runs
React Server Components.
```

This is an **upstream bug** in the Vocs v2 / Waku RSC dev server, not specific to this
repo. It reproduces in a clean, vanilla `npm create vocs` (`vocs@2.0.10`,
`waku@1.0.0-beta.1`) project, and is invariant across package manager (nx / node /
bunx), Vite patch (`8.0.15`/`8.0.16`), Node version (`22.11`/`22.21`), and React
version (`19.0.1`/`19.2.6`). The dev server externalizes `react-server-dom-webpack`
and `require()`s it via Node without the `react-server` export condition applied.

**Workaround:** use `bunx nx serve docs` (`vocs preview`) to preview the built static
site locally. The production build (`bunx nx build docs`) is unaffected and works
correctly. Revisit `vocs dev` when the upstream RSC dev path stabilizes.
