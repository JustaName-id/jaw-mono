import { Loader2Icon } from 'lucide-react';

import { cn } from '../../lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div role="status" aria-label="Loading" className={cn('size-4 animate-spin', className)} {...props}>
      <Loader2Icon className="size-full" />
    </div>
  );
}

export { Spinner };
