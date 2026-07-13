import { type FormEvent, type ReactNode } from 'react';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

// Shared bold label/heading style used for every section title and field label.
export const HEADING = 'text-foreground text-xs font-bold leading-[133%]';

/** Bold field label (form controls). */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <Label className={cn(HEADING, className)}>{children}</Label>;
}

/** Bordered card with an optional bold title; the standard section container. */
export function Section({
  title,
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('border-border flex flex-col gap-3 rounded-[6px] border p-3.5', className)}>
      {title && <p className={HEADING}>{title}</p>}
      {children}
    </div>
  );
}

/** Destructive inline banner for flow errors. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  return <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{children}</div>;
}

/**
 * The per-step scaffold: a full-height column with a scrolling body and a
 * pinned footer. Renders as a <form> when onSubmit is given, else a <div>.
 */
export function StepLayout({
  onSubmit,
  footer,
  children,
}: {
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const body = (
    <>
      <div className="flex flex-col gap-3">{children}</div>
      <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">{footer}</div>
    </>
  );
  return onSubmit ? (
    <form className="flex flex-col justify-between gap-6 max-md:h-full" onSubmit={onSubmit}>
      {body}
    </form>
  ) : (
    <div className="flex flex-col justify-between gap-6 max-md:h-full">{body}</div>
  );
}
