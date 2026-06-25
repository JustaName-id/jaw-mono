import type { ModeName, SdkType } from '../types';

export const TYPED_DATA_SIGNED = 'TYPED_DATA_SIGNED';

export interface TypedDataSignedPayload {
  sdk: SdkType;
  mode: ModeName;
}
