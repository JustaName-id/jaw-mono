'use client';

import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { type ParameterDefinition } from '../lib/rpc-methods';

interface ParameterFieldProps {
  param: ParameterDefinition;
  value: string;
  onChange: (value: string) => void;
  context?: { address?: string; chainId?: string };
}

export function ParameterField({ param, value, onChange, context }: ParameterFieldProps) {
  // Auto-fill from context if specified
  const displayValue = value || (param.autoFill === 'address' ? context?.address : param.autoFill === 'chainId' ? context?.chainId : '') || '';

  if (param.type === 'toggle') {
    const isOn = (value !== undefined ? value : param.defaultValue) === 'true';
    return (
      <div className="flex items-center justify-between py-1">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium leading-none">{param.label}</Label>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => onChange(isOn ? 'false' : 'true')}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            isOn ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              isOn ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  }

  if (param.type === 'select' && param.options) {
    return (
      <div className="space-y-2">
        <Label htmlFor={param.name}>
          {param.label}
          {param.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Select value={displayValue || param.defaultValue} onValueChange={onChange}>
          <SelectTrigger id={param.name}>
            <SelectValue placeholder={`Select ${param.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {param.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {param.description && (
          <p className="text-xs text-muted-foreground">{param.description}</p>
        )}
      </div>
    );
  }

  if (param.type === 'json') {
    const jsonValue = value !== undefined ? displayValue : (param.defaultValue || '');
    return (
      <div className="space-y-2">
        <Label htmlFor={param.name}>
          {param.label}
          {param.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <textarea
          id={param.name}
          value={jsonValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.description}
          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
        />
        {param.description && (
          <p className="text-xs text-muted-foreground">{param.description}</p>
        )}
      </div>
    );
  }

  // Only use defaultValue if value has never been set (undefined)
  // This allows empty strings to be entered for testing
  const inputValue = value !== undefined ? displayValue : (param.defaultValue || '');

  return (
    <div className="space-y-2">
      <Label htmlFor={param.name}>
        {param.label}
        {param.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={param.name}
        type={param.type === 'number' ? 'text' : 'text'}
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          param.type === 'address'
            ? '0x...'
            : param.type === 'hex'
            ? '0x...'
            : param.description
        }
        className={param.type === 'address' || param.type === 'hex' ? 'font-mono' : ''}
      />
      {param.description && (
        <p className="text-xs text-muted-foreground">{param.description}</p>
      )}
    </div>
  );
}
