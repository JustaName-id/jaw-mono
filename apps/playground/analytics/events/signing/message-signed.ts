import type { ModeName, SdkType } from '../types';

export const MESSAGE_SIGNED = 'MESSAGE_SIGNED';

export interface MessageSignedPayload {
  sdk: SdkType;
  mode: ModeName;
}
