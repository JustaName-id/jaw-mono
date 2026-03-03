import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';
import { FC, ReactNode } from 'react';

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
        }}
      >
        <DialogTitle style={{ display: 'none' }}></DialogTitle>

        <div onWheel={(e) => e.nativeEvent.stopPropagation()} className={`flex p-2.5 ${fullScreen ? 'rounded-none' : 'rounded-3xl'} gap-5 flex-col md:max-h-[calc(100%-45px)] flex-1 box-border overflow-auto`}
          style={{
            ...innerStyle,
          }}
        >
          {header && (
            <div className="flex flex-row justify-between">
              {header}
            </div>
          )}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
