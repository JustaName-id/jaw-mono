import React from 'react';
import {
  Modal,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { cn } from '../../lib/utils';
import { CloseIcon } from '../../icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface DefaultModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  handleClose?: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  fullScreen?: boolean;
  className?: string;
  contentClassName?: string;
  showCloseButton?: boolean;
}

export const DefaultModal: React.FC<DefaultModalProps> = ({
  open = false,
  onOpenChange,
  handleClose,
  children,
  header,
  fullScreen = false,
  className,
  contentClassName,
  showCloseButton = true,
}) => {
  const handleCloseModal = () => {
    handleClose?.();
    onOpenChange?.(false);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={handleCloseModal}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/50 justify-center items-center">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className={cn(
            'w-full items-center justify-center',
            !fullScreen && 'px-4'
          )}
        >
          <Pressable
            className={cn(
              'bg-background w-full',
              fullScreen ? 'flex-1' : 'max-w-md rounded-3xl',
              className
            )}
            onPress={(e) => e.stopPropagation()}
          >
            <SafeAreaView className={cn('flex-1', fullScreen && 'flex-1')}>
              <View
                className={cn(
                  'p-2.5 gap-5 flex-col',
                  fullScreen ? '' : 'rounded-3xl',
                  contentClassName
                )}
                style={!fullScreen ? { maxHeight: SCREEN_HEIGHT * 0.85 } : undefined}
              >
                {/* Header Row */}
                <View className="flex-row justify-between">
                  {header || <View />}

                  {showCloseButton && (
                    <Pressable
                      className="w-6 items-center justify-center"
                      onPress={handleCloseModal}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <CloseIcon width={24} height={24} />
                    </Pressable>
                  )}
                </View>

                {/* Content */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ flexGrow: 1 }}
                  bounces={false}
                >
                  {children}
                </ScrollView>
              </View>
            </SafeAreaView>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default DefaultModal;
