import type { SdkType } from '../types';

export const CHAIN_SWITCHED = 'CHAIN_SWITCHED';

export interface ChainSwitchedPayload {
  sdk: SdkType;
  from?: number;
  to: number;
}
