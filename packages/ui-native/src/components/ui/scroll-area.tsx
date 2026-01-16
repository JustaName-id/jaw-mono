import React from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface ScrollAreaProps extends ScrollViewProps {
  className?: string;
  children?: React.ReactNode;
}

const ScrollArea = React.forwardRef<ScrollView, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <ScrollView
        ref={ref}
        className={cn('flex-1', className)}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';

export interface ScrollBarProps {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

// Note: React Native ScrollView handles scrollbars automatically
// This component is a placeholder for API compatibility
const ScrollBar: React.FC<ScrollBarProps> = () => {
  return null; // React Native handles scrollbars internally
};

ScrollBar.displayName = 'ScrollBar';

export { ScrollArea, ScrollBar };
