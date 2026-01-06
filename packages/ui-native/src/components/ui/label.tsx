import React from 'react';
import { Text, TextProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface LabelProps extends TextProps {
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

const Label = React.forwardRef<Text, LabelProps>(
  ({ className, children, disabled, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn(
          'text-sm font-medium text-foreground',
          disabled && 'opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </Text>
    );
  }
);

Label.displayName = 'Label';

export { Label };
