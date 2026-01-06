import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { cn } from '../../lib/utils';
import { ChevronDownIcon } from '../../icons';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface AccordionProps {
  type?: 'single' | 'multiple';
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  defaultValue?: string | string[];
  collapsible?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface AccordionContextType {
  type: 'single' | 'multiple';
  value: string[];
  toggleItem: (itemValue: string) => void;
}

const AccordionContext = React.createContext<AccordionContextType | null>(null);

const Accordion: React.FC<AccordionProps> = ({
  type = 'single',
  value,
  onValueChange,
  defaultValue,
  collapsible = true,
  className,
  children,
}) => {
  const [internalValue, setInternalValue] = useState<string[]>(() => {
    if (value !== undefined) {
      return Array.isArray(value) ? value : [value];
    }
    if (defaultValue !== undefined) {
      return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
    }
    return [];
  });

  const currentValue = value !== undefined
    ? (Array.isArray(value) ? value : [value])
    : internalValue;

  const toggleItem = useCallback((itemValue: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    let newValue: string[];

    if (type === 'single') {
      if (currentValue.includes(itemValue) && collapsible) {
        newValue = [];
      } else {
        newValue = [itemValue];
      }
    } else {
      if (currentValue.includes(itemValue)) {
        newValue = currentValue.filter(v => v !== itemValue);
      } else {
        newValue = [...currentValue, itemValue];
      }
    }

    if (value === undefined) {
      setInternalValue(newValue);
    }

    onValueChange?.(type === 'single' ? (newValue[0] || '') : newValue);
  }, [type, currentValue, collapsible, value, onValueChange]);

  return (
    <AccordionContext.Provider value={{ type, value: currentValue, toggleItem }}>
      <View className={cn('w-full', className)}>
        {children}
      </View>
    </AccordionContext.Provider>
  );
};

export interface AccordionItemProps {
  value: string;
  className?: string;
  children?: React.ReactNode;
}

interface AccordionItemContextType {
  value: string;
  isOpen: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextType | null>(null);

const AccordionItem: React.FC<AccordionItemProps> = ({
  value,
  className,
  children,
}) => {
  const accordionContext = React.useContext(AccordionContext);
  if (!accordionContext) {
    throw new Error('AccordionItem must be used within an Accordion');
  }

  const isOpen = accordionContext.value.includes(value);

  return (
    <AccordionItemContext.Provider value={{ value, isOpen }}>
      <View className={cn('border-b border-border', className)}>
        {children}
      </View>
    </AccordionItemContext.Provider>
  );
};

export interface AccordionTriggerProps {
  className?: string;
  children?: React.ReactNode;
}

const AccordionTrigger: React.FC<AccordionTriggerProps> = ({
  className,
  children,
}) => {
  const accordionContext = React.useContext(AccordionContext);
  const itemContext = React.useContext(AccordionItemContext);

  if (!accordionContext || !itemContext) {
    throw new Error('AccordionTrigger must be used within an AccordionItem');
  }

  const { toggleItem } = accordionContext;
  const { value, isOpen } = itemContext;

  return (
    <Pressable
      className={cn(
        'flex-row items-center justify-between py-4',
        className
      )}
      onPress={() => toggleItem(value)}
    >
      {typeof children === 'string' ? (
        <Text className="text-sm font-medium text-foreground flex-1">{children}</Text>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      <View
        style={{
          transform: [{ rotate: isOpen ? '180deg' : '0deg' }],
        }}
      >
        <ChevronDownIcon width={16} height={16} />
      </View>
    </Pressable>
  );
};

export interface AccordionContentProps {
  className?: string;
  children?: React.ReactNode;
}

const AccordionContent: React.FC<AccordionContentProps> = ({
  className,
  children,
}) => {
  const itemContext = React.useContext(AccordionItemContext);

  if (!itemContext) {
    throw new Error('AccordionContent must be used within an AccordionItem');
  }

  const { isOpen } = itemContext;

  if (!isOpen) {
    return null;
  }

  return (
    <View className={cn('pb-4', className)}>
      {children}
    </View>
  );
};

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
};
