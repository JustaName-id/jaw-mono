import { Separator } from "../ui/separator";

export const OrSeparator = () => {
    return (
        <div className="flex flex-row gap-2 items-center max-w-full">
            <Separator className='w-full shrink' />
            <span className="bg-background text-sm text-muted-foreground">
                Or
            </span>
            <Separator className='w-full shrink' />
        </div>
    )
}