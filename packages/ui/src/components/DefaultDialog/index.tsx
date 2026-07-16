import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';
import { FC, ReactNode, useContext } from 'react';

import { DialogAnchorContext } from '../../lib/utils';

export interface DefaultDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  header?: ReactNode;
  innerStyle?: React.CSSProperties;
  trigger?: ReactNode;
  fullScreen?: boolean;
  contentStyle?: React.CSSProperties;
}

export const DefaultDialog: FC<DefaultDialogProps> = ({
  onOpenChange,
  trigger,
  open,
  children,
  header,
  fullScreen,
  innerStyle = {},
  contentStyle = {},
}) => {
  // In the embedded drawer presentation ('top-sheet') the dialog must render
  // as a full-width, content-sized top sheet. The per-dialog contentStyle
  // sizing (fixed desktop widths, mobile 100% height) is inline style, so it
  // would beat DialogContent's sheet classes — override it here, after the
  // spread, keeping the decision in one place instead of in every dialog.
  const topSheet = useContext(DialogAnchorContext) === 'top-sheet' && !fullScreen;
  return (
    <Dialog modal={true} open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent
        fullScreen={fullScreen}
        onInteractOutside={(e) => {
          // Only stop propagation for click/pointer events, NOT wheel events
          // This allows scrolling to work inside the dialog
          if (e.type !== 'wheel') {
            e.stopPropagation();
          }
        }}
        aria-describedby={undefined}
        showCloseButton={false}
        style={{
          padding: 0,
          transition: 'all 0.4 ease-in-out',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: fullScreen ? '0' : undefined,
          boxSizing: 'content-box',
          ...contentStyle,
          ...(topSheet
            ? {
                width: '100%',
                minWidth: 0,
                maxWidth: 'none',
                height: 'auto',
                minHeight: 0,
                maxHeight: '85vh',
                borderRadius: undefined,
              }
            : {}),
        }}
      >
        <DialogTitle style={{ display: 'none' }}></DialogTitle>

        <div
          onWheel={(e) => e.nativeEvent.stopPropagation()}
          className={`flex p-2.5 ${fullScreen ? 'rounded-none' : 'rounded-3xl'} box-border flex-1 flex-col gap-5 overflow-auto md:max-h-[calc(100%-45px)]`}
          style={{
            ...innerStyle,
          }}
        >
          {header && <div className="flex flex-row justify-between">{header}</div>}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
