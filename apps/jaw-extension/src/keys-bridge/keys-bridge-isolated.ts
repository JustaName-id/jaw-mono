/**
 * ISOLATED-world content script on the keys.jaw.id signing-popup tab.
 * Bridges between MAIN-world `window.postMessage` (with a private marker)
 * and `chrome.runtime.sendMessage` to the background.
 *
 * Activates ONLY when the URL carries `_jawext=1`.
 */

const ISO_MARKER_OUT = '__jaw_bridge_main_to_iso__';
const ISO_MARKER_IN = '__jaw_bridge_iso_to_main__';

(function main(): void {
  let isBridged = false;
  try {
    isBridged = new URL(window.location.href).searchParams.get('_jawext') === '1';
  } catch {
    return;
  }
  if (!isBridged) return;

  // Inject the MAIN-world bridge as a WAR `<script>` tag.
  try {
    const script = document.createElement('script');
    script.type = 'module';
    script.async = false;
    script.src = chrome.runtime.getURL('assets/keys-bridge-main.js');
    script.onload = () => script.remove();
    const parent = document.head ?? document.documentElement;
    if (parent) parent.insertBefore(script, parent.firstChild);
  } catch (err) {
    console.error('[JAW iso] main injection failed', err);
    return;
  }

  console.log('[JAW iso] keys-bridge-isolated active');

  // MAIN → ISO: receive bridge-tagged messages and forward to background.
  // Uses window.postMessage (structured clone) so Uint8Arrays are preserved.
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const payload = event.data as { __jaw_marker?: string; data?: unknown; origin?: string } | null;
    if (!payload || payload.__jaw_marker !== ISO_MARKER_OUT) return;
    void chrome.runtime
      .sendMessage({
        kind: 'jaw-bridge-from-window',
        data: payload.data,
        origin: payload.origin,
      })
      .catch((err) => console.error('[JAW iso] background unreachable', err));
  });

  // background → ISO → MAIN: receive forwarded messages from the background and
  // re-emit them via window.postMessage with the IN marker. The MAIN bridge
  // re-dispatches as a proper MessageEvent with the synthetic opener as source.
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const msg = message as { kind?: string; data?: unknown } | null;
    if (!msg || msg.kind !== 'jaw-bridge-to-window') return false;
    window.postMessage({ __jaw_marker: ISO_MARKER_IN, data: msg.data }, window.location.origin);
    sendResponse({ ok: true });
    return false;
  });
})();
