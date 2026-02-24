/**
 * JAWModalRoot
 *
 * Standalone React component that renders modals for ReactNativeUIHandler.
 * Place it at the root of your app layout as a sibling -- no wrapping needed.
 *
 * @example
 * ```tsx
 * import { ReactNativeUIHandler, JAWModalRoot } from '@jaw/ui-native';
 *
 * const uiHandler = useMemo(() => new ReactNativeUIHandler(), []);
 *
 * return (
 *   <>
 *     <Stack>...</Stack>
 *     <JAWModalRoot />
 *   </>
 * );
 * ```
 */

import React, { useEffect, useState, useCallback } from 'react';
import type {
  UIHandlerConfig,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  SendTransactionUIRequest,
  PermissionUIRequest,
  RevokePermissionUIRequest,
  UIResponse,
} from '@jaw.id/core';

import {
  registerController,
  unregisterController,
  showNextPending,
  type ModalState,
} from './modalBridge';

import {
  OnboardingModalWrapper,
  SignatureModalWrapper,
  SiweModalWrapper,
  Eip712ModalWrapper,
  TransactionModalWrapper,
  PermissionModalWrapper,
  RevokePermissionModalWrapper,
} from './wrappers';

export function JAWModalRoot() {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [config, setConfig] = useState<UIHandlerConfig | null>(null);

  const show = useCallback(
    (state: ModalState, cfg: UIHandlerConfig) => {
      setModalState(state);
      setConfig(cfg);
    },
    []
  );

  const hide = useCallback(() => {
    setModalState(null);
    setConfig(null);
  }, []);

  // Register / unregister the controller with the bridge
  useEffect(() => {
    registerController({ show, hide });
    return () => {
      unregisterController();
    };
  }, [show, hide]);

  // ----- Nothing to render -----
  if (!modalState || !config) {
    return null;
  }

  // ----- Handlers -----
  const handleApprove = (data: unknown) => {
    modalState.resolve({
      id: modalState.request.id,
      approved: true,
      data,
    } as UIResponse<unknown>);
    hide();
    // After dismiss, drain the queue
    showNextPending();
  };

  const handleReject = (error?: Error) => {
    modalState.resolve({
      id: modalState.request.id,
      approved: false,
      error: error || { code: 4001, message: 'User rejected the request' },
    } as UIResponse<unknown>);
    hide();
    showNextPending();
  };

  // ----- Render the correct modal -----
  switch (modalState.type) {
    case 'onboarding':
      return (
        <OnboardingModalWrapper
          request={modalState.request as ConnectUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'signature':
      return (
        <SignatureModalWrapper
          request={modalState.request as SignatureUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'siwe':
      return (
        <SiweModalWrapper
          request={modalState.request as SignatureUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'eip712':
      return (
        <Eip712ModalWrapper
          request={modalState.request as TypedDataUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'transaction':
      return (
        <TransactionModalWrapper
          request={modalState.request as (TransactionUIRequest | SendTransactionUIRequest)}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'permission':
      if (modalState.request.type === 'wallet_revokePermissions') {
        return (
          <RevokePermissionModalWrapper
            request={modalState.request as RevokePermissionUIRequest}
            config={config}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        );
      }
      return (
        <PermissionModalWrapper
          request={modalState.request as PermissionUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    default:
      console.warn(`[JAWModalRoot] Unknown modal type: ${modalState.type}`);
      return null;
  }
}
