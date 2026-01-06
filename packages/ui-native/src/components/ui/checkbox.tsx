import React from 'react';
import { Pressable, View, PressableProps } from 'react-native';
import { cn } from '../../lib/utils';
import { CheckIcon } from '../../icons';

export interface CheckboxProps extends Omit<PressableProps, 'onPress'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

const Checkbox = React.forwardRef<View, CheckboxProps>(
  ({ checked = false, onCheckedChange, className, disabled, ...props }, ref) => {
    return (
      <Pressable
        ref={ref}
        role="checkbox"
        accessibilityState={{ checked, disabled }}
        className={cn(
          'h-5 w-5 items-center justify-center rounded border-2',
          checked ? 'bg-primary border-primary' : 'bg-background border-input',
          disabled && 'opacity-50',
          className
        )}
        onPress={() => !disabled && onCheckedChange?.(!checked)}
        disabled={disabled}
        {...props}
      >
        {checked && <CheckIcon width={14} height={14} stroke="#FFFFFF" />}
      </Pressable>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
