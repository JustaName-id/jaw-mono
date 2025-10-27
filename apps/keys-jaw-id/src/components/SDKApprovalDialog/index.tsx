'use client'

import { DefaultDialog } from '@jaw/ui';
import { SDKRequestUI, SDKRequestType } from '@/lib/sdk-types';
import { Button } from '@jaw/ui';
import { useState } from 'react';

interface SDKApprovalDialogProps {
  request: SDKRequestUI;
  walletAddress?: string;
}

export function SDKApprovalDialog({ request, walletAddress }: SDKApprovalDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      // Call the appropriate approval handler based on request type
      switch (request.type) {
        case SDKRequestType.CONNECT: {
          // Return wallet address
          request.onApprove([walletAddress || '0x0000000000000000000000000000000000000000']);
          break;
        }
        case SDKRequestType.SIGN_MESSAGE: {
          // TODO: Actually sign the message
          const message = request.request.content.handshake.params[0] as string;
          const mockSignature = `0x${'0'.repeat(130)}`; // Mock signature
          request.onApprove(mockSignature);
          break;
        }
        case SDKRequestType.SEND_TRANSACTION: {
          // TODO: Actually send the transaction
          const mockTxHash = `0x${'0'.repeat(64)}`; // Mock tx hash
          request.onApprove({ sendCallsId: mockTxHash });
          break;
        }
        case SDKRequestType.GET_SUB_ACCOUNTS: {
          // Return sub accounts
          request.onApprove([]);
          break;
        }
        case SDKRequestType.IMPORT_SUB_ACCOUNT: {
          // Confirm import
          request.onApprove({ success: true });
          break;
        }
        default:
          request.onReject('Unsupported request type');
      }
    } catch (error) {
      request.onReject(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleReject = () => {
    request.onReject('User rejected the request');
  };

  const renderContent = () => {
    const { type, metadata, request: rpcRequest } = request;

    switch (type) {
      case SDKRequestType.CONNECT:
        return (
          <div className="space-y-4">
            <div className="text-center">
              {metadata?.appLogoUrl && (
                <img
                  src={metadata.appLogoUrl}
                  alt={metadata.appName}
                  className="w-16 h-16 mx-auto mb-4 rounded-full"
                />
              )}
              <h2 className="text-2xl font-bold mb-2">Connect Request</h2>
              <p className="text-gray-600">
                <strong>{metadata?.appName || 'Unknown App'}</strong> wants to connect to your wallet
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">This app will be able to:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                <li>View your wallet address</li>
                <li>Request transaction approval</li>
                <li>Request message signatures</li>
              </ul>
            </div>

            {walletAddress && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Your Address:</strong>
                  <br />
                  <code className="text-xs bg-white px-2 py-1 rounded mt-1 inline-block">
                    {walletAddress}
                  </code>
                </p>
              </div>
            )}
          </div>
        );

      case SDKRequestType.SIGN_MESSAGE: {
        const message = rpcRequest.content.handshake.params[0] as string;
        return (
          <div className="space-y-4">
            <div className="text-center">
              {metadata?.appLogoUrl && (
                <img
                  src={metadata.appLogoUrl}
                  alt={metadata.appName}
                  className="w-16 h-16 mx-auto mb-4 rounded-full"
                />
              )}
              <h2 className="text-2xl font-bold mb-2">Sign Message</h2>
              <p className="text-gray-600">
                <strong>{metadata?.appName || 'Unknown App'}</strong> wants you to sign a message
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
              <h3 className="font-semibold mb-2">Message:</h3>
              <pre className="text-sm whitespace-pre-wrap break-words">{message}</pre>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Only sign messages from apps you trust
              </p>
            </div>
          </div>
        );
      }

      case SDKRequestType.SEND_TRANSACTION: {
        const txParams = rpcRequest.content.handshake.params[0] as any;
        return (
          <div className="space-y-4">
            <div className="text-center">
              {metadata?.appLogoUrl && (
                <img
                  src={metadata.appLogoUrl}
                  alt={metadata.appName}
                  className="w-16 h-16 mx-auto mb-4 rounded-full"
                />
              )}
              <h2 className="text-2xl font-bold mb-2">Send Transaction</h2>
              <p className="text-gray-600">
                <strong>{metadata?.appName || 'Unknown App'}</strong> wants to send a transaction
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div>
                <p className="text-sm font-semibold">From:</p>
                <code className="text-xs bg-white px-2 py-1 rounded">{txParams.from}</code>
              </div>
              {txParams.calls?.map((call: any, idx: number) => (
                <div key={idx} className="border-t pt-2">
                  <p className="text-sm font-semibold">Call {idx + 1}:</p>
                  <p className="text-xs">To: <code className="bg-white px-1 py-0.5 rounded">{call.to}</code></p>
                  {call.value && (
                    <p className="text-xs">Value: <code className="bg-white px-1 py-0.5 rounded">{call.value}</code></p>
                  )}
                  {call.data && (
                    <p className="text-xs">Data: <code className="bg-white px-1 py-0.5 rounded">{call.data.substring(0, 20)}...</code></p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Review transaction details carefully before approving
              </p>
            </div>
          </div>
        );
      }

      default:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">SDK Request</h2>
            <p className="text-gray-600">Method: {rpcRequest.content.handshake.method}</p>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-x-auto">
              {JSON.stringify(rpcRequest.content.handshake.params, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <DefaultDialog
      open={true}
      onOpenChange={() => {}}
      header={
        <div className="px-4 py-2">
          <p className="text-xs text-gray-500">SDK Request</p>
        </div>
      }
    >
      <div className="p-6 space-y-6">
        {renderContent()}

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isProcessing}
            className="flex-1"
          >
            Reject
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Processing...' : 'Approve'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  );
}
