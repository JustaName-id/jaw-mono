'use client';

import { Card } from './ui/card';
import { type MethodCategory, CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/rpc-methods';

// Generic method interface for both core and wagmi methods
interface MethodCardMethod {
  id: string;
  name: string;
  method: string;
  category: MethodCategory;
  description: string;
  requiresConnection: boolean;
}

interface MethodCardProps {
  method: MethodCardMethod;
  onClick: () => void;
  disabled?: boolean;
}

export function MethodCard({ method, onClick, disabled }: MethodCardProps) {
  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-mono text-sm font-semibold text-foreground break-all">
            {method.name}
          </h3>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
              CATEGORY_COLORS[method.category]
            }`}
          >
            {CATEGORY_LABELS[method.category]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {method.description}
        </p>
        {method.requiresConnection ? (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>Requires connection</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
              />
            </svg>
            <span>Works without connection</span>
          </div>
        )}
      </div>
    </Card>
  );
}
