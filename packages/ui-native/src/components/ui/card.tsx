import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface CardProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

const Card = React.forwardRef<View, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn(
          'bg-card rounded-xl border border-border p-5 gap-5',
          className
        )}
        {...props}
      >
        {children}
      </View>
    );
  }
);

Card.displayName = 'Card';

const CardHeader = React.forwardRef<View, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn('flex-col gap-1', className)}
        {...props}
      >
        {children}
      </View>
    );
  }
);

CardHeader.displayName = 'CardHeader';

export interface CardTitleProps extends TextProps {
  className?: string;
  children?: React.ReactNode;
}

const CardTitle = React.forwardRef<Text, CardTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn('text-lg font-semibold text-foreground', className)}
        {...props}
      >
        {children}
      </Text>
    );
  }
);

CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<Text, CardTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn('text-sm text-muted-foreground', className)}
        {...props}
      >
        {children}
      </Text>
    );
  }
);

CardDescription.displayName = 'CardDescription';

const CardAction = React.forwardRef<View, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn('self-end', className)}
        {...props}
      >
        {children}
      </View>
    );
  }
);

CardAction.displayName = 'CardAction';

const CardContent = React.forwardRef<View, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View ref={ref} className={cn('', className)} {...props}>
        {children}
      </View>
    );
  }
);

CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<View, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn('flex-row items-center', className)}
        {...props}
      >
        {children}
      </View>
    );
  }
);

CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
