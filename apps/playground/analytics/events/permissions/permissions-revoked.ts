import type { SdkType } from '../types';

export const PERMISSIONS_REVOKED = 'PERMISSIONS_REVOKED';

export interface PermissionsRevokedPayload {
  sdk: SdkType;
}
