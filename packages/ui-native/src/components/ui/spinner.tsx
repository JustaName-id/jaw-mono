import React from 'react';
import { ActivityIndicator, ActivityIndicatorProps, View } from 'react-native';
import { cn } from '../../lib/utils';

export interface SpinnerProps extends ActivityIndicatorProps {
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({
  className,
  size = 'small',
  color = '#18181B',
  ...props
}) => {
  return (
    <View className={cn('items-center justify-center', className)}>
      <ActivityIndicator size={size} color={color} {...props} />
    </View>
  );
};

Spinner.displayName = 'Spinner';

export { Spinner };
