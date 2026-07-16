import { useContext } from 'react';

import { DialogAnchorContext } from '../lib/utils';
import { useIsMobile } from './useIsMobile';

/**
 * Whether a dialog should adopt its mobile full-screen sizing. True only in
 * popup/standalone contexts (anchor 'center'): the embedded presentations size
 * dialogs to match the host card instead — 'top-sheet' (drawer) overrides
 * sizing in DefaultDialog, and 'top' (floating card) keeps the dialog's
 * desktop card width. The gate matters because the embedded drawer breakpoint
 * (460px) is narrower than useIsMobile's (768px): without it, embedded
 * floating viewports in the 460–767px band would go full-screen while anchored
 * at a top offset, spanning the full width and overflowing the viewport.
 */
export function useDialogMobileFullScreen() {
  const isMobile = useIsMobile();
  const anchor = useContext(DialogAnchorContext);
  return isMobile && anchor === 'center';
}
