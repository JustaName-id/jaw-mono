'use client';

import { useState } from 'react';
import {
  filterMethods,
  groupMethods,
  methodNeedsAttention,
  opensDialog,
  splitMethodName,
  NEEDS_DISCONNECTED,
  type PlaygroundMethod,
} from '../../lib/method-ui-meta';
import { InfoPopover } from './primitives';

export interface MethodListProps<M extends PlaygroundMethod> {
  methods: M[];
  selectedId: string | null;
  onSelect: (method: M) => void;
  isConnected: boolean;
  /** How dialog methods surface — for the info popover copy. */
  transport: 'iframe' | 'popup';
}

const DialogIcon = ({ size = 13, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`flex-none ${className}`}
  >
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9h17" />
  </svg>
);

export function MethodList<M extends PlaygroundMethod>({
  methods,
  selectedId,
  onSelect,
  isConnected,
  transport,
}: MethodListProps<M>) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const matches = filterMethods(methods, query, 'all');
  const groups = groupMethods(matches);

  const selected = methods.find((m) => m.id === selectedId);
  const forceOpen = query.trim() !== '';
  const isOpen = (category: string) => {
    if (forceOpen) return true;
    const explicit = collapsed[category];
    if (explicit !== undefined) return !explicit;
    return category === (selected?.category ?? groups[0]?.category);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-1">
        <h2 className="text-shell-ink m-0 flex-none text-[15px] font-semibold tracking-[-0.015em]">Methods</h2>
        <span className="text-shell-ink-3 ml-auto flex-none text-[13px]">
          {matches.length === methods.length ? `${methods.length} total` : `${matches.length} of ${methods.length}`}
        </span>
      </div>

      {/* Search */}
      <div className="px-3.5 pb-3">
        <div className="border-shell-line bg-shell-raise focus-within:border-shell-line-2 flex min-w-0 items-center gap-[7px] rounded-[10px] border px-2.5 py-[7px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            aria-hidden="true"
            className="text-shell-ink-3 flex-none"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter methods"
            aria-label="Filter methods"
            className="text-shell-ink placeholder:text-shell-ink-4 min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setQuery('')}
              className="text-shell-ink-3 hover:text-shell-ink inline-flex h-5 w-5 flex-none cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {groups.map((group) => {
          const open = isOpen(group.category);
          return (
            <div key={group.category} className="border-shell-line mb-1.5 border-t pb-1.5 pt-2.5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => ({ ...c, [group.category]: open }))}
                className="flex min-h-[34px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg border-0 bg-transparent px-2 pb-[7px] pt-1.5 text-left"
              >
                <span className="flex items-baseline gap-[9px]">
                  <span className="text-shell-ink text-[15px] font-medium tracking-[-0.015em]">{group.label}</span>
                  <span className="text-shell-ink-3 text-[13px]">{group.items.length}</span>
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`text-shell-ink-3 flex-none transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              {open && (
                <div className="flex flex-col gap-0.5 pl-[19px]">
                  {group.items.map((method) => {
                    const active = method.id === selectedId;
                    const { prefix, rest } = splitMethodName(method.name);
                    const dialog = opensDialog(method);
                    return (
                      <div key={method.id} className="relative flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSelect(method)}
                          className={`flex w-full cursor-pointer items-center gap-[9px] rounded-lg border-0 px-2.5 py-2 text-left transition-colors ${
                            active
                              ? 'bg-shell-active text-shell-ink'
                              : 'text-shell-ink-2 hover:bg-shell-raise-2 bg-transparent'
                          }`}
                        >
                          <span
                            className={`h-[5px] w-[5px] flex-none rounded-full ${
                              methodNeedsAttention(method, isConnected) ? 'bg-shell-warn' : 'bg-shell-ink-4'
                            }`}
                          />
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] tracking-[-0.01em]">
                            <span className="opacity-50">{prefix}</span>
                            <span className="font-semibold">{rest}</span>
                          </span>
                          {dialog && <DialogIcon size={14} className="text-shell-ink-2 ml-auto" />}
                        </button>
                        <InfoPopover
                          label={`About ${method.name}`}
                          triggerClassName="h-7 w-7 border-0 text-shell-ink-3 hover:text-shell-ink"
                          panelClassName="right-0 w-[290px] z-[70]"
                        >
                          <div className="text-shell-ink break-words font-mono text-[12.5px] font-semibold">
                            {method.name}
                          </div>
                          <p className="text-shell-ink-3 mt-[7px] text-[13px] leading-relaxed">{method.description}</p>
                          <div className="bg-shell-line my-3 h-px" />
                          <div className="text-shell-ink-3 flex flex-col gap-1.5 text-[12.5px]">
                            <span>
                              {dialog
                                ? `Opens the ${transport} dialog. The user approves in JAW.`
                                : 'No dialog. Resolves in the background.'}
                            </span>
                            <span>
                              {NEEDS_DISCONNECTED.has(method.method)
                                ? 'Test it while disconnected, or no dialog appears.'
                                : method.requiresConnection
                                  ? 'Needs a connected session.'
                                  : 'Runs connected or not.'}
                            </span>
                          </div>
                        </InfoPopover>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
