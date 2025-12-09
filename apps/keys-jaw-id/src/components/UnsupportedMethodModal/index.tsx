'use client'

import { useState } from "react";
import { standardErrorCodes } from "@jaw.id/core";

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
  onClose
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        {/* App Info */}
        {(appLogoUrl || appName) && (
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
            {appLogoUrl && (
              <img
                src={appLogoUrl}
                alt={appName || 'App'}
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{appName || 'dApp'}</p>
              <p className="text-xs text-gray-500">{origin}</p>
            </div>
          </div>
        )}

        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
        <div className="text-center mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Unsupported Method
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            This wallet does not support the following method:
          </p>
          <div className="bg-gray-100 rounded-lg p-4">
            <code className="text-sm font-mono text-gray-900 break-all">
              {method}
            </code>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isClosing}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isClosing ? 'Closing...' : 'Close'}
        </button>
      </div>
    </div>
  );
}
