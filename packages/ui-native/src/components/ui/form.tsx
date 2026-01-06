import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '../../lib/utils';
import { Label } from './label';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

interface FormItemProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

let formItemIdCounter = 0;

const FormItem: React.FC<FormItemProps> = ({ className, children, ...props }) => {
  const id = React.useMemo(() => `form-item-${++formItemIdCounter}`, []);

  return (
    <FormItemContext.Provider value={{ id }}>
      <View className={cn('gap-2', className)} {...props}>
        {children}
      </View>
    </FormItemContext.Provider>
  );
};

interface FormLabelProps extends TextProps {
  className?: string;
  children?: React.ReactNode;
}

const FormLabel: React.FC<FormLabelProps> = ({ className, children, ...props }) => {
  const { error } = useFormField();

  return (
    <Label
      className={cn(error && 'text-destructive', className)}
      {...props}
    >
      {children}
    </Label>
  );
};

interface FormControlProps {
  children?: React.ReactNode;
}

const FormControl: React.FC<FormControlProps> = ({ children }) => {
  const { error } = useFormField();

  // Clone children and pass error state if needed
  if (React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ isInvalid?: boolean }>, {
      isInvalid: !!error,
    });
  }

  return <>{children}</>;
};

interface FormDescriptionProps extends TextProps {
  className?: string;
  children?: React.ReactNode;
}

const FormDescription: React.FC<FormDescriptionProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <Text className={cn('text-sm text-muted-foreground', className)} {...props}>
      {children}
    </Text>
  );
};

interface FormMessageProps extends TextProps {
  className?: string;
  children?: React.ReactNode;
}

const FormMessage: React.FC<FormMessageProps> = ({
  className,
  children,
  ...props
}) => {
  const { error } = useFormField();
  const body = error ? String(error?.message ?? '') : children;

  if (!body) {
    return null;
  }

  return (
    <Text className={cn('text-sm text-destructive', className)} {...props}>
      {body}
    </Text>
  );
};

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
