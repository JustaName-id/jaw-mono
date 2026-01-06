import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { cn } from '../../lib/utils';
import { ChevronDownIcon, CheckIcon } from '../../icons';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  className,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        className={cn(
          'flex-row items-center justify-between h-10 px-3 rounded-md border border-input bg-background',
          disabled && 'opacity-50',
          className
        )}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        <Text
          className={cn(
            'text-sm',
            selectedOption ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <ChevronDownIcon width={16} height={16} stroke="#71717A" />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setIsOpen(false)}
        >
          <SafeAreaView className="bg-background rounded-t-xl">
            <View className="p-4 border-b border-border">
              <Text className="text-lg font-semibold text-foreground text-center">
                {placeholder}
              </Text>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <Pressable
                  className="flex-row items-center justify-between px-4 py-3 border-b border-border"
                  onPress={() => handleSelect(item.value)}
                >
                  <Text
                    className={cn(
                      'text-base',
                      item.value === value
                        ? 'text-primary font-medium'
                        : 'text-foreground'
                    )}
                  >
                    {item.label}
                  </Text>
                  {item.value === value && (
                    <CheckIcon width={20} height={20} stroke="#18181B" />
                  )}
                </Pressable>
              )}
            />
            <Pressable
              className="p-4 items-center"
              onPress={() => setIsOpen(false)}
            >
              <Text className="text-base text-primary font-medium">Cancel</Text>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
};

Select.displayName = 'Select';

export { Select };
