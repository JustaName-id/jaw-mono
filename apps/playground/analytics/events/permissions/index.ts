import { PERMISSIONS_GRANTED, PermissionsGrantedPayload } from './permissions-granted';
import { PERMISSIONS_REVOKED, PermissionsRevokedPayload } from './permissions-revoked';

export const PERMISSIONS_EVENTS = {
  PERMISSIONS_GRANTED,
  PERMISSIONS_REVOKED,
} as const;

export interface PermissionsEventPayload {
  [PERMISSIONS_GRANTED]: PermissionsGrantedPayload;
  [PERMISSIONS_REVOKED]: PermissionsRevokedPayload;
}
