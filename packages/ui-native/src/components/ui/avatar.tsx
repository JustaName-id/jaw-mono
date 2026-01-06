import React, { useState } from 'react';
import { View, Image, Text, ImageProps, ViewProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface AvatarProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
  size?: number;
}

const Avatar = React.forwardRef<View, AvatarProps>(
  ({ className, children, size = 40, style, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-full bg-muted items-center justify-center',
          className
        )}
        style={[{ width: size, height: size }, style]}
        {...props}
      >
        {children}
      </View>
    );
  }
);

Avatar.displayName = 'Avatar';

export interface AvatarImageProps extends Omit<ImageProps, 'source'> {
  src?: string;
  alt?: string;
  className?: string;
  onLoadingStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
}

const AvatarImage = React.forwardRef<Image, AvatarImageProps>(
  ({ src, alt, className, onLoadingStatusChange, style, ...props }, ref) => {
    const [hasError, setHasError] = useState(false);

    if (!src || hasError) {
      return null;
    }

    return (
      <Image
        ref={ref}
        source={{ uri: src }}
        accessibilityLabel={alt}
        className={cn('absolute w-full h-full', className)}
        style={style}
        onLoadStart={() => onLoadingStatusChange?.('loading')}
        onLoad={() => onLoadingStatusChange?.('loaded')}
        onError={() => {
          setHasError(true);
          onLoadingStatusChange?.('error');
        }}
        {...props}
      />
    );
  }
);

AvatarImage.displayName = 'AvatarImage';

export interface AvatarFallbackProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

const AvatarFallback = React.forwardRef<View, AvatarFallbackProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn(
          'absolute w-full h-full items-center justify-center bg-muted',
          className
        )}
        {...props}
      >
        {typeof children === 'string' ? (
          <Text className="text-sm font-medium text-muted-foreground">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    );
  }
);

AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
