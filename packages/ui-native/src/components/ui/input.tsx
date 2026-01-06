import React, { useState } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { cn } from '../../lib/utils';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  className?: string;
  containerClassName?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  isInvalid?: boolean;
}

const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      className,
      containerClassName,
      right,
      left,
      style,
      containerStyle,
      isInvalid,
      editable = true,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const inputStyles = cn(
      'h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground',
      isFocused && 'border-ring',
      isInvalid && 'border-destructive',
      !editable && 'opacity-50',
      left && 'pl-10',
      right && 'pr-10',
      className
    );

    if (!right && !left) {
      return (
        <TextInput
          ref={ref}
          className={inputStyles}
          style={style}
          editable={editable}
          placeholderTextColor="#71717A"
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
      );
    }

    return (
      <View
        className={cn('relative flex-row items-center w-full', containerClassName)}
        style={containerStyle}
      >
        {left && (
          <View className="absolute left-3 z-10 h-full justify-center">
            {left}
          </View>
        )}
        <TextInput
          ref={ref}
          className={inputStyles}
          style={style}
          editable={editable}
          placeholderTextColor="#71717A"
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {right && (
          <View className="absolute right-3 z-10 h-full justify-center">
            {right}
          </View>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';

export { Input };
