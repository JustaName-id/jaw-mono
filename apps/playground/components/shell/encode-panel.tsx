'use client';

import { useCallback, useState } from 'react';
import { encodeFunctionData, parseAbiItem } from 'viem';
import type { AbiFunction, AbiParameter } from 'viem';
import { ResponsePanel } from './response-panel';

// Ported verbatim from encode-data-modal.tsx — local viem encoding, no provider.
function parseArgValue(value: string, type: string): unknown {
  const trimmed = value.trim();
  if (type === 'address') return trimmed as `0x${string}`;
  if (type === 'bool') return trimmed === 'true';
  if (type === 'string') return trimmed;
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(trimmed);
  if (type.startsWith('bytes')) return trimmed as `0x${string}`;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function getPlaceholder(type: string): string {
  if (type === 'address') return '0x...';
  if (type === 'bool') return 'true or false';
  if (type.startsWith('uint') || type.startsWith('int')) return '0';
  if (type.startsWith('bytes')) return '0x...';
  if (type === 'string') return 'hello world';
  if (type.endsWith(']') || type.includes('(')) return 'JSON value';
  return type;
}

const labelClass = 'text-shell-ink-2 text-[13.5px] font-medium leading-[1.4] tracking-[-0.005em]';
const inputClass =
  'border-shell-line-2 bg-shell-pop text-shell-ink placeholder:text-shell-ink-4 min-h-[46px] w-full rounded-[10px] border px-[15px] py-[13px] font-mono text-[14.5px] outline-none focus-visible:border-shell-ink-4';

/**
 * Inline encodeFunctionData tool — the EncodeDataModal as a main-pane panel.
 * Parse/encode logic unchanged; runs locally, never touches the provider.
 */
export function EncodePanel({ dispatchNote }: { dispatchNote: string }) {
  const [signature, setSignature] = useState('');
  const [parsedFn, setParsedFn] = useState<AbiFunction | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [encodedData, setEncodedData] = useState<string | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);

  const handleParse = useCallback((sig: string) => {
    setParseError(null);
    setParsedFn(null);
    setParamValues([]);
    setEncodedData(null);
    setEncodeError(null);

    const raw = sig.trim();
    if (!raw) return;

    try {
      const full = raw.startsWith('function ') ? raw : `function ${raw}`;
      const item = parseAbiItem(full);
      if (item.type !== 'function') {
        setParseError('Input must be a function signature');
        return;
      }
      setParsedFn(item as AbiFunction);
      setParamValues(new Array(item.inputs.length).fill(''));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid function signature');
    }
  }, []);

  const handleSignatureChange = (value: string) => {
    setSignature(value);
    // Reset parsed state when signature changes
    if (parsedFn) {
      setParsedFn(null);
      setParamValues([]);
      setEncodedData(null);
      setEncodeError(null);
    }
  };

  const handleParamChange = (index: number, value: string) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setEncodedData(null);
    setEncodeError(null);
  };

  const handleEncode = useCallback(() => {
    if (!parsedFn) return;
    setEncodeError(null);
    setEncodedData(null);

    try {
      const args = parsedFn.inputs.map((input: AbiParameter, i: number) =>
        parseArgValue(paramValues[i] ?? '', input.type)
      );

      const encoded = encodeFunctionData({
        abi: [parsedFn],
        functionName: parsedFn.name,
        args,
      });

      setEncodedData(encoded);
    } catch (err) {
      setEncodeError(err instanceof Error ? err.message : 'Encoding failed');
    }
  }, [parsedFn, paramValues]);

  const response = encodeError
    ? { ok: false, body: encodeError }
    : encodedData
      ? { ok: true, body: encodedData }
      : null;

  return (
    <>
      <div className="border-shell-line bg-shell-raise rounded-2xl border">
        <div className="border-shell-line bg-shell-raise flex flex-wrap items-center justify-between gap-4 rounded-t-2xl border-b px-6 py-4">
          <span className="text-shell-ink-3 text-[13px]">{dispatchNote}</span>
          <button
            type="button"
            onClick={parsedFn ? handleEncode : () => handleParse(signature)}
            disabled={!signature.trim()}
            className="bg-shell-btn text-shell-btn-ink inline-flex min-h-[46px] cursor-pointer items-center gap-[9px] rounded-full border-0 px-5 text-[15px] font-medium tracking-[-0.005em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {parsedFn ? 'Encode' : 'Parse signature'}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-[26px] p-[26px]">
          <div className="space-y-[9px]">
            <label htmlFor="encode-signature" className={labelClass}>
              Function signature<span className="text-shell-warn ml-1">*</span>
            </label>
            <input
              id="encode-signature"
              type="text"
              value={signature}
              onChange={(e) => handleSignatureChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleParse(signature);
              }}
              placeholder="transfer(address to, uint256 amount)"
              className={inputClass}
            />
            <p className="text-shell-ink-3 m-0 text-[13px] leading-normal">
              Solidity signature — parse it to get one field per argument.
            </p>
            {parseError && <p className="text-shell-err m-0 text-[13px]">{parseError}</p>}
          </div>

          {parsedFn &&
            parsedFn.inputs.map((input: AbiParameter, i: number) => (
              <div key={i} className="space-y-[9px]">
                <label htmlFor={`encode-arg-${i}`} className={labelClass}>
                  {input.name || `arg${i}`}
                  <span className="text-shell-ink-4 ml-2 font-mono text-xs">{input.type}</span>
                </label>
                <input
                  id={`encode-arg-${i}`}
                  type="text"
                  value={paramValues[i] ?? ''}
                  onChange={(e) => handleParamChange(i, e.target.value)}
                  placeholder={getPlaceholder(input.type)}
                  className={inputClass}
                />
              </div>
            ))}
        </div>
      </div>

      <ResponsePanel response={response} />
    </>
  );
}
