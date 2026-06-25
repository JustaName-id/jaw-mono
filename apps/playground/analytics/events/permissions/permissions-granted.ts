import type { SdkType } from '../types';

export const PERMISSIONS_GRANTED = 'PERMISSIONS_GRANTED';

export interface PermissionsGrantedPayload {
  sdk: SdkType;
}
