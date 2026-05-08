import { defineManifest } from '@crxjs/vite-plugin';

const PROD_KEYS_HOST = 'https://keys.jaw.id/*';
const PROD_API_HOST = 'https://api.justaname.id/*';
const DEV_KEYS_HOST = 'http://localhost:3001/*';

export default defineManifest(({ mode }) => {
  const isDev = mode === 'development';
  const keysMatches = isDev ? [PROD_KEYS_HOST, DEV_KEYS_HOST] : [PROD_KEYS_HOST];
  return {
    manifest_version: 3,
    name: isDev ? 'JAW (dev)' : 'JAW',
    description: 'Smart account wallet powered by passkeys. Announces JAW to any dApp via EIP-6963.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    icons: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'JAW',
      default_icon: {
        16: 'public/icons/icon-16.png',
        32: 'public/icons/icon-32.png',
        48: 'public/icons/icon-48.png',
      },
    },
    background: {
      service_worker: 'src/background/background.ts',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*'],
        exclude_matches: keysMatches,
        js: ['src/content/content.ts'],
        run_at: 'document_start',
        all_frames: false,
        world: 'ISOLATED',
      },
      {
        matches: keysMatches,
        js: ['src/keys-bridge/keys-bridge-isolated.ts'],
        run_at: 'document_start',
        all_frames: false,
        world: 'ISOLATED',
      },
    ],
    web_accessible_resources: [
      // Inpage bundle is loaded into each dApp's MAIN world as a `<script>` tag
      // injected by the content script. WAR exemption from page CSP requires
      // the resource to be listed here.
      {
        resources: ['assets/inpage.js'],
        matches: ['<all_urls>'],
      },
      // keys-bridge-main is injected into keys.jaw.id's MAIN world by the
      // ISOLATED-world keys-bridge-isolated content script. We ship it as a
      // WAR (rather than a MAIN-world content_script) because crxjs generates
      // a chrome.runtime-using loader stub that breaks in MAIN world.
      {
        resources: ['assets/keys-bridge-main.js'],
        matches: keysMatches,
      },
    ],
    permissions: ['storage', 'offscreen', 'alarms'],
    host_permissions: keysMatches.concat([PROD_API_HOST]),
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
});
