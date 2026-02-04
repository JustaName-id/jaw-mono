import { CloseIcon } from '../../icons';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';
import { FC, ReactNode } from 'react';

export interface DefaultDialogProps {
  open?: boolean;
  handleClose?: () => void;
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
  handleClose,
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

        <div className={`flex p-2.5 ${fullScreen ? 'rounded-none' : 'rounded-3xl'} gap-5 flex-col md:max-h-[calc(100%-45px)] flex-1 box-border overflow-auto`}
          style={{
            ...innerStyle,
          }}
        >
          <div className="flex flex-row justify-between">
            {header}

            <div
              className="flex flex-col items-center justify-center w-[24px]">
              {handleClose ? (
                <CloseIcon
                  style={{
                    cursor: 'pointer',
                  }}
                  onClick={handleClose}
                  width={24}
                />
              ) : (
                <DialogClose
                  style={{
                    border: '0px',
                    background: 'none',
                    padding: 0,
                    height: '24px',
                    display: 'flex',
                    placeContent: 'center',
                  }}
                >
                  <CloseIcon
                    style={{
                      cursor: 'pointer',
                    }}
                    width={24}
                  />
                </DialogClose>
              )}
            </div>
          </div>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
