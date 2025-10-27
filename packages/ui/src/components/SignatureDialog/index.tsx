'use client'

import { Button } from "../ui/button";
import { DefaultDialog } from "../DefaultDialog";
import { SignatureDialogProps } from "./types";
import { useIsMobile } from "../../hooks";

export const SignatureDialog = ({
  open,
  onOpenChange,
  message,
  origin,
  timestamp,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
  canSign,
}: SignatureDialogProps) => {
  const isMobile = useIsMobile();
  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
            {timestamp.toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })} at {timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}
          </p>
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            Signature request
          </p>
          <p className="text-sm text-muted-foreground leading-[100%]">
            Review request details before you confirm
          </p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      } : {
        width: 'fit-content',
        maxWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-foreground">Request from</p>
            <div className="flex flex-row items-center gap-2 p-3 border border-border rounded-[6px]">
              <div className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></div>
              <p className="text-sm font-normal text-foreground">{origin}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between">
              <p className="text-sm font-bold text-foreground">Message</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-[6px] min-h-[200px] max-h-[400px] overflow-y-auto">
              <p className="text-sm font-normal text-foreground whitespace-pre-wrap break-words">
                {message || 'No message provided'}
              </p>
            </div>
          </div>

          {signatureStatus && (
            <div className={`text-sm p-3 rounded-lg ${signatureStatus.includes('Error') ? 'bg-red-50 text-red-600' :
              signatureStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
                'bg-blue-50 text-blue-600'
              }`}>
              {signatureStatus}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-3.5 max-md:mt-auto">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onSign}
            disabled={!canSign}
            className="flex-1"
          >
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  )
}

export * from './types';
