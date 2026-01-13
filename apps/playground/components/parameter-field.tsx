'use client';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jaw.id/ui';
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
    return (
      <div className="space-y-2">
        <Label htmlFor={param.name}>
          {param.label}
          {param.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <textarea
          id={param.name}
          value={displayValue || param.defaultValue || ''}
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

  return (
    <div className="space-y-2">
      <Label htmlFor={param.name}>
        {param.label}
        {param.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={param.name}
        type={param.type === 'number' ? 'text' : 'text'}
        value={displayValue || param.defaultValue || ''}
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
