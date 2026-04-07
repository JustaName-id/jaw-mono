'use client';

import { useState } from 'react';
import { standardErrorCodes } from '@jaw.id/core';

export interface UnsupportedMethodModalProps {
  origin: string;
  method: string;
  appName?: string;
  appLogoUrl?: string;
  onClose: (error: Error, errorCode?: number) => void;
}

export const UnsupportedMethodModal = ({
  origin,
  method,
  appName,
  appLogoUrl,
  onClose,
}: UnsupportedMethodModalProps) => {
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const handleClose = () => {
    if (!isClosing) {
      setIsClosing(true);
      console.log('❌ Unsupported method:', method);
      // Method not found (JSON-RPC code -32601)
      onClose(new Error(`Method not supported: ${method}`), standardErrorCodes.rpc.methodNotFound);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {/* App Info */}
        {(appLogoUrl || appName) && (
          <div className="mb-6 flex items-center gap-3 border-b border-gray-200 pb-6">
            {appLogoUrl && (
              <img src={appLogoUrl} alt={appName || 'App'} className="h-12 w-12 rounded-lg object-cover" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{appName || 'dApp'}</p>
              <p className="text-xs text-gray-500">{origin}</p>
            </div>
          </div>
        )}

        {/* Error Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <svg className="h-8 w-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="mb-8 text-center">
          <h3 className="mb-2 text-xl font-bold text-gray-900">Unsupported Method</h3>
          <p className="mb-4 text-sm text-gray-600">This wallet does not support the following method:</p>
          <div className="rounded-lg bg-gray-100 p-4">
            <code className="break-all font-mono text-sm text-gray-900">{method}</code>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isClosing}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isClosing ? 'Closing...' : 'Close'}
        </button>
      </div>
    </div>
  );
};
