import { Separator } from '../ui/separator';

export const OrSeparator = () => {
  return (
    <div className="flex max-w-full flex-row items-center gap-2">
      <Separator className="w-full shrink" />
      <span className="bg-background text-muted-foreground text-sm">Or</span>
      <Separator className="w-full shrink" />
    </div>
  );
};
