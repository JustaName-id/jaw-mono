import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * shadcn/ui Skeleton. `motion-reduce:animate-none` is our one addition so
 * every loading placeholder respects prefers-reduced-motion for free.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
