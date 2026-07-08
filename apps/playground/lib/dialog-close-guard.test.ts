import { afterEach, describe, expect, it } from 'vitest';
import { isSdkDialogOpen } from './dialog-close-guard';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

/** Radix-style overlay (AppSpecific SDK UI) at a given z-index. */
function mountRadixOverlay(zIndex: number): HTMLElement {
  const style = document.createElement('style');
  style.textContent = `.ovl { position: fixed; z-index: ${zIndex}; }`;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.setAttribute('data-slot', 'dialog-overlay');
  overlay.className = 'ovl';
  document.body.appendChild(overlay);
  return overlay;
}

/** Native top-layer dialog used by the iframe transport. */
function mountJawDialog({ open }: { open: boolean }): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('data-jaw', '');
  if (open) dialog.setAttribute('open', '');
  document.body.appendChild(dialog);
  return dialog;
}

describe('isSdkDialogOpen', () => {
  it('returns false with nothing on top (host dialog may close)', () => {
    expect(isSdkDialogOpen()).toBe(false);
  });

  it('returns false for the host overlay at z-50 (not an SDK dialog)', () => {
    mountRadixOverlay(50);
    expect(isSdkDialogOpen()).toBe(false);
  });

  it('returns true for the AppSpecific Radix SDK overlay at z-100', () => {
    mountRadixOverlay(100);
    expect(isSdkDialogOpen()).toBe(true);
  });

  // Regression: iframe transport renders a native <dialog data-jaw>, not a
  // Radix overlay. Without detecting it the host modal closed when the keys
  // iframe was revealed (focus left the layer into the cross-origin iframe).
  it('returns true while the native iframe-transport dialog is open', () => {
    mountJawDialog({ open: true });
    expect(isSdkDialogOpen()).toBe(true);
  });

  it('returns false once the native iframe-transport dialog is closed', () => {
    mountJawDialog({ open: false });
    expect(isSdkDialogOpen()).toBe(false);
  });
});
