'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn, DialogAnchorContext, DialogScrimContext, PortalContainerContext } from '../../lib/utils';

function Dialog({ open, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const prevOpenRef = React.useRef(open);

  // Cleanup pointer-events when dialog closes: wait out the close animation
  // (200ms duration-200) plus buffer. The timer is cancelled if the dialog
  // reopens or unmounts first — the unmount effect below takes over then.
  React.useEffect(() => {
    const closing = prevOpenRef.current === true && open === false;
    prevOpenRef.current = open;
    if (!closing) return;

    const cleanup = setTimeout(() => {
      document.body.style.removeProperty('pointer-events');
    }, 250);
    return () => clearTimeout(cleanup);
  }, [open]);

  // Cleanup on unmount. Synchronous, not a timer: the node is gone instantly so
  // there is no animation to wait for, and a timer here would outlive the
  // component with no way to cancel it (it also covers a close immediately
  // followed by an unmount, which cancels the close-path timer above).
  React.useEffect(() => {
    return () => {
      document.body.style.removeProperty('pointer-events');
    };
  }, []);

  return <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ container: containerProp, ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const contextContainer = React.useContext(PortalContainerContext);
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      container={containerProp ?? contextContainer ?? undefined}
      {...props}
    />
  );
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, onClick, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-scrim/50 fixed inset-0 z-[100]',
        className
      )}
      onClick={(e) => {
        // Stop propagation to prevent interference with dialogs underneath
        e.stopPropagation();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean;
  fullScreen?: boolean;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  fullScreen = false,
  ...props
}: DialogContentProps) {
  const anchor = React.useContext(DialogAnchorContext);
  const scrim = React.useContext(DialogScrimContext);
  return (
    <DialogPortal data-slot="dialog-portal">
      {/* The embedded (iframe) shell opts out of the scrim to match its own
          transparent backdrop — the host dApp shows through around the card.
          It is keyed on its own context rather than on the anchor: the
          app-specific handler uses the same bottom-sheet anchor but renders
          straight onto the dApp, where an undimmed backdrop would leave the
          sheet floating over live content. The overlay still captures outside
          clicks either way. */}
      <DialogOverlay className={scrim ? undefined : 'bg-transparent'} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background fixed left-[50%] top-[50%] z-[100] grid max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border p-6 shadow-lg sm:max-w-lg',
          // max-h also caps dialogs styled `height: 100%` (max-height beats
          // height), so an anchored dialog can't run past the viewport.
          // No enter/exit animation for the floating anchor: the embedded card
          // it aligns with appears via a plain visibility flip, so the dialog
          // must snap in the same way.
          anchor === 'top' && !fullScreen && 'top-6 max-h-[85vh] translate-y-0',
          // Full-width sheet pinned to the bottom edge, height sized to content —
          // mirrors the EmbeddedShell drawer card (inset-x-0 bottom-0
          // rounded-t-2xl). Unlike 'top', this one animates: Radix mounts the
          // dialog while the iframe is already revealed, so the slide is
          // actually visible (the shell card's own reveal slide is driven by
          // DialogVisibility). Reduced motion snaps instead.
          anchor === 'bottom-sheet' &&
            !fullScreen &&
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom bottom-0 left-0 top-auto max-h-[85vh] max-w-none translate-x-0 translate-y-0 rounded-none rounded-t-2xl border-x-0 border-b-0 data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none sm:max-w-none',
          (anchor === 'center' || fullScreen) &&
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200',
          fullScreen ? 'h-[100vh] min-h-[100vh] w-[100vw] min-w-[100vw] translate-x-0 translate-y-0' : '',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
