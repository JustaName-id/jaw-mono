import React, { useMemo, useEffect } from 'react';
import { JAW, CreateJAWSDKOptions } from '@jaw.id/core';
import { JAWContext } from './context';

export interface JAWProviderProps extends CreateJAWSDKOptions {
  children: React.ReactNode;
}

export function JAWProvider({ children, ...sdkOptions }: JAWProviderProps) {
  const jaw = useMemo(() => JAW.create(sdkOptions), [sdkOptions.apiKey]);
  const provider = useMemo(() => jaw.provider, [jaw]);

  useEffect(() => {
    return () => {
      jaw.disconnect();
    };
  }, [jaw]);

  return (
    <JAWContext.Provider value={provider}>
      {children}
    </JAWContext.Provider>
  );
}