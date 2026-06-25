/**
 * Post-build PostHog injection for the static Vocs docs site.
 *
 * Vocs 2.x exposes no `head`/script config option, so (per the official Vocs
 * recommendation) we inject the PostHog snippet into the generated static HTML
 * after `vocs build`. Gated on env so local/CI builds emit nothing unless the
 * deploy environment opts in.
 *
 *
 * Env (read from process.env; on Vercel these are build-time env vars):
 *   VITE_ANALYTICS_ENABLED  "true" to inject (anything else = no-op)
 *   VITE_POSTHOG_KEY        PostHog project API key (required when enabled)
 *   VITE_POSTHOG_HOST       reverse-proxy path, defaults to "/analytics"
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_APP_ROOT = join(__dirname, '..');

// Marker so re-running the post-build chain never double-injects.
const MARKER = '<!-- posthog-analytics -->';

const analyticsEnabled = process.env.VITE_ANALYTICS_ENABLED === 'true';
const posthogKey = process.env.VITE_POSTHOG_KEY;
const posthogHost = process.env.VITE_POSTHOG_HOST || '/analytics';
const environment = process.env.NODE_ENV || 'production';

// Same served-root resolution as generate-llms.ts: Vocs full-static serves from
// `<outDir>/public` locally, while the Vercel adapter ships `.vercel/output/static`.
// We probe both the script-relative location and process.cwd() so paths resolve
// regardless of the project's Root Directory setting in CI.
function findDistDirs(): string[] {
  const candidates = [
    join(DOCS_APP_ROOT, '.vercel/output/static'),
    join(process.cwd(), '.vercel/output/static'),
    join(DOCS_APP_ROOT, 'docs/dist/public'),
    join(DOCS_APP_ROOT, 'docs/dist'),
  ];
  const existing = [...new Set(candidates)].filter((c) => existsSync(c));
  // Drop any dir that is an ancestor of another (e.g. `docs/dist` when
  // `docs/dist/public` exists) so we don't re-scan the same served files or
  // touch non-served intermediate HTML.
  return existing.filter((c) => !existing.some((other) => other !== c && other.startsWith(c + sep)));
}

function findHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findHtmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

// Official PostHog loader snippet + init. `api_host` points at the first-party
// `/analytics` reverse proxy (see vercel.json) so ad-blockers don't drop events;
// `ui_host` keeps toolbar/replay links resolving to the real dashboard.
// `capture_pageview: 'history_change'` tracks SPA route changes in the static site.
function buildSnippet(): string {
  const loader = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`;
  const init = `posthog.init(${JSON.stringify(posthogKey)}, {api_host:${JSON.stringify(
    posthogHost
  )},ui_host:'https://eu.posthog.com',capture_pageview:'history_change',capture_pageleave:true,person_profiles:'identified_only',loaded:function(p){p.register({app:'docs',environment:${JSON.stringify(
    environment
  )}});}});`;
  return `${MARKER}<script>${loader}${init}</script>`;
}

function main() {
  if (!analyticsEnabled) {
    console.log('[inject-analytics] VITE_ANALYTICS_ENABLED is not "true" — skipping.');
    return;
  }
  if (!posthogKey) {
    throw new Error('[inject-analytics] VITE_ANALYTICS_ENABLED is "true" but VITE_POSTHOG_KEY is missing.');
  }

  const dirs = findDistDirs();
  if (dirs.length === 0) {
    throw new Error('[inject-analytics] No dist directory found. Run `vocs build` first.');
  }

  const snippet = buildSnippet();
  let injected = 0;
  let skipped = 0;

  for (const dir of dirs) {
    for (const file of findHtmlFiles(dir)) {
      const html = readFileSync(file, 'utf-8');
      if (html.includes(MARKER)) {
        skipped++;
        continue;
      }
      if (!html.includes('</head>')) continue;
      writeFileSync(file, html.replace('</head>', `${snippet}</head>`), 'utf-8');
      injected++;
    }
  }

  console.log(
    `[inject-analytics] PostHog injected into ${injected} page(s)` +
      (skipped ? `, ${skipped} already had it` : '') +
      ` across: ${dirs.join(', ')}`
  );
}

main();
