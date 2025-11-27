import { createContext, useContext } from 'react';
import { ProviderInterface } from '@jaw.id/core';

export const JAWContext = createContext<ProviderInterface | null>(null);

export function useJAWProvider(): ProviderInterface {
  const provider = useContext(JAWContext);
  if (!provider) {
    throw new Error('useJAWProvider must be used within JAWProvider');
  }
  return provider;
}
