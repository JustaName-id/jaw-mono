'use client';

import { Label } from './ui/label';
import { focusRing } from './shell/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { type ParameterDefinition } from '../lib/rpc-methods';

interface ParameterFieldProps {
  param: ParameterDefinition;
  value: string;
  onChange: (value: string) => void;
  context?: { address?: string; chainId?: string };
}

const labelClass = 'text-shell-ink-2 text-[13.5px] font-medium leading-[1.4] tracking-[-0.005em]';
const hintClass = 'text-shell-ink-3 text-[13px] leading-normal';
const fieldClass = `border-shell-line-2 bg-shell-pop text-shell-ink placeholder:text-shell-ink-4 w-full rounded-[10px] border text-[14.5px] outline-none focus-visible:border-shell-ink-4 ${focusRing}`;
const inputClass = `${fieldClass} min-h-[46px] px-[15px] py-[13px] font-mono`;
const textareaClass = `${fieldClass} min-h-[120px] resize-y p-[15px] font-mono leading-[1.65]`;

function RequiredMark({ required }: { required?: boolean }) {
  return required ? <span className="text-shell-warn ml-1">*</span> : null;
}

export function ParameterField({ param, value, onChange, context }: ParameterFieldProps) {
  // Auto-fill from context if specified
  const displayValue =
    value ||
    (param.autoFill === 'address' ? context?.address : param.autoFill === 'chainId' ? context?.chainId : '') ||
    '';

  if (param.type === 'toggle') {
    const isOn = (value !== undefined ? value : param.defaultValue) === 'true';
    return (
      <div className="flex items-center justify-between py-1">
        <div className="space-y-1">
          <Label className={labelClass}>{param.label}</Label>
          {param.description && <p className={hintClass}>{param.description}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => onChange(isOn ? 'false' : 'true')}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${focusRing} ${
            isOn ? 'bg-shell-btn' : 'bg-shell-line-2'
          }`}
        >
          <span
            className={`bg-shell-canvas pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${
              isOn ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  }

  if (param.type === 'select' && param.options) {
    return (
      <div className="space-y-[9px]">
        <Label htmlFor={param.name} className={labelClass}>
          {param.label}
          <RequiredMark required={param.required} />
        </Label>
        <Select value={displayValue || param.defaultValue} onValueChange={onChange}>
          <SelectTrigger
            id={param.name}
            className="border-shell-line-2 bg-shell-pop text-shell-ink min-h-[46px] w-full rounded-[10px] border px-[15px] text-[15px]"
          >
            <SelectValue placeholder={`Select ${param.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent className="border-shell-line-2 bg-shell-pop text-shell-ink">
            {param.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {param.description && <p className={hintClass}>{param.description}</p>}
      </div>
    );
  }

  if (param.type === 'json') {
    const jsonValue = value !== undefined ? displayValue : param.defaultValue || '';
    return (
      <div className="space-y-[9px]">
        <Label htmlFor={param.name} className={labelClass}>
          {param.label}
          <RequiredMark required={param.required} />
        </Label>
        <textarea
          id={param.name}
          value={jsonValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.description}
          className={textareaClass}
        />
        {param.description && <p className={hintClass}>{param.description}</p>}
      </div>
    );
  }

  // Only use defaultValue if value has never been set (undefined)
  // This allows empty strings to be entered for testing
  const inputValue = value !== undefined ? displayValue : param.defaultValue || '';

  // Multi-line string (e.g. a SIWE message that needs real newlines).
  if (param.multiline) {
    return (
      <div className="space-y-[9px]">
        <Label htmlFor={param.name} className={labelClass}>
          {param.label}
          <RequiredMark required={param.required} />
        </Label>
        <textarea
          id={param.name}
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.description}
          className={textareaClass}
        />
        {param.description && <p className={hintClass}>{param.description}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-[9px]">
      <Label htmlFor={param.name} className={labelClass}>
        {param.label}
        <RequiredMark required={param.required} />
      </Label>
      <input
        id={param.name}
        type="text"
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          param.type === 'address' ? '0x... or vitalik.eth' : param.type === 'hex' ? '0x...' : param.description
        }
        className={inputClass}
      />
      {param.description && <p className={hintClass}>{param.description}</p>}
    </div>
  );
}
