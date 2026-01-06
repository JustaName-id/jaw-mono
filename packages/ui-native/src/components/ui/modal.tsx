import React from 'react';
import {
  Modal as RNModal,
  ModalProps as RNModalProps,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { cn } from '../../lib/utils';
import { CloseIcon } from '../../icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ModalProps extends RNModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeOnBackdropPress?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  open,
  onOpenChange,
  children,
  className,
  showCloseButton = true,
  closeOnBackdropPress = true,
  ...props
}) => {
  const handleClose = () => {
    onOpenChange?.(false);
  };

  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      {...props}
    >
      <Pressable
        className="flex-1 bg-black/50 justify-center items-center"
        onPress={closeOnBackdropPress ? handleClose : undefined}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="w-full items-center justify-center px-4"
        >
          <Pressable
            className={cn(
              'bg-background rounded-xl w-full max-w-md',
              className
            )}
            onPress={(e) => e.stopPropagation()}
          >
            {showCloseButton && (
              <Pressable
                className="absolute right-3 top-3 z-10 p-1"
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <CloseIcon width={20} height={20} />
              </Pressable>
            )}
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </RNModal>
  );
};

export interface ModalContentProps {
  children?: React.ReactNode;
  className?: string;
  scrollable?: boolean;
}

const ModalContent: React.FC<ModalContentProps> = ({
  children,
  className,
  scrollable = false,
}) => {
  if (scrollable) {
    return (
      <ScrollView
        className={cn('p-5', className)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}
      >
        {children}
      </ScrollView>
    );
  }

  return <View className={cn('p-5', className)}>{children}</View>;
};

export interface ModalHeaderProps {
  children?: React.ReactNode;
  className?: string;
}

const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className }) => {
  return (
    <View className={cn('px-5 pt-5 pb-2', className)}>
      {children}
    </View>
  );
};

export interface ModalFooterProps {
  children?: React.ReactNode;
  className?: string;
}

const ModalFooter: React.FC<ModalFooterProps> = ({ children, className }) => {
  return (
    <View className={cn('px-5 pb-5 pt-2 flex-row gap-3', className)}>
      {children}
    </View>
  );
};

export interface ModalTitleProps {
  children?: React.ReactNode;
  className?: string;
}

const ModalTitle: React.FC<ModalTitleProps> = ({ children, className }) => {
  return (
    <View className={cn('', className)}>
      {typeof children === 'string' ? (
        <View className="text-lg font-semibold text-foreground">
          {children}
        </View>
      ) : (
        children
      )}
    </View>
  );
};

export interface ModalDescriptionProps {
  children?: React.ReactNode;
  className?: string;
}

const ModalDescription: React.FC<ModalDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <View className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </View>
  );
};

export {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
};
