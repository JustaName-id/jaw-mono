// Base UI Components
export * from './components/ui';

// Domain Modal Components
export { DefaultModal } from './components/DefaultModal';
export { ConnectModal } from './components/ConnectModal';
export { OnboardingModal } from './components/OnboardingModal';
export { SignatureModal, SiweModal, Eip712Modal } from './components/SignatureModal';
export { TransactionModal } from './components/TransactionModal';
export { PermissionModal } from './components/PermissionModal';

// Utilities
export * from './utils';
export * from './lib/utils';

// Hooks
export * from './hooks';

// Icons
export * from './icons';

// Passkey Adapters
export * from './passkey';

// React Native UI Handler (App-Specific Mode)
export * from './react-native';

// Cross-Platform Mode (WebView-based)
export * from './cross-platform';
export { JAWNativeProvider, useJAWNative, type JAWNativeConfig, type JAWNativeContextType, type JAWNativeProviderProps } from './JAWNativeProvider';

// Base UI Types
export type { ButtonProps } from './components/ui/button';
export type { CardProps, CardTitleProps } from './components/ui/card';
export type { InputProps } from './components/ui/input';
export type { LabelProps } from './components/ui/label';
export type { ModalProps, ModalContentProps, ModalHeaderProps, ModalFooterProps } from './components/ui/modal';
export type { SpinnerProps } from './components/ui/spinner';
export type { CheckboxProps } from './components/ui/checkbox';
export type { AvatarProps, AvatarImageProps, AvatarFallbackProps } from './components/ui/avatar';
export type { ScrollAreaProps, ScrollBarProps } from './components/ui/scroll-area';
export type { AccordionProps, AccordionItemProps, AccordionTriggerProps, AccordionContentProps } from './components/ui/accordion';
export type { SelectProps, SelectOption } from './components/ui/select';
export type { SeparatorProps } from './components/ui/separator';

// Domain Modal Types
export type { DefaultModalProps } from './components/DefaultModal';
export type { ConnectModalProps } from './components/ConnectModal';
export type { OnboardingModalProps, LocalStorageAccount } from './components/OnboardingModal';
export type { SignatureModalProps, SiweModalProps, Eip712ModalProps } from './components/SignatureModal';
export type { TransactionModalProps, TransactionData } from './components/TransactionModal';
export type { PermissionModalProps, SpendPermission, CallPermission } from './components/PermissionModal/types';
