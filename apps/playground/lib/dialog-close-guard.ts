/**
 * Decide whether a host (playground) Radix dialog should swallow a close
 * request because an SDK dialog is currently shown on top of it.
 *
 * Two SDK presentations must be detected:
 *
 * 1. AppSpecific mode renders the SDK UI as a Radix dialog whose overlay is
 *    `[data-slot="dialog-overlay"]` at `z-index: 100` (see packages/ui). The
 *    host's own overlay sits at z-index 50, so anything above 50 is the SDK.
 *
 * 2. Iframe transport (CrossPlatform) renders the SDK UI as a NATIVE top-layer
 *    `<dialog data-jaw>` (see packages/core IframeTransport). It has neither a
 *    `data-slot` nor a z-index — it relies on `showModal()`'s top layer.
 *    Revealing it moves focus into the cross-origin keys iframe, which Radix
 *    reads as an interaction outside the host layer and tries to close it.
 *    While that native dialog is open, the host close must be swallowed.
 */
export function isSdkDialogOpen(doc: Document = document): boolean {
  const overlays = doc.querySelectorAll('[data-slot="dialog-overlay"]');
  const hasHigherZIndexDialog = Array.from(overlays).some((overlay) => {
    const zIndex = overlay.ownerDocument.defaultView?.getComputedStyle(overlay).zIndex;
    return !!zIndex && parseInt(zIndex) > 50;
  });

  const hasNativeJawDialogOpen = !!doc.querySelector('dialog[data-jaw][open]');

  return hasHigherZIndexDialog || hasNativeJawDialogOpen;
}
