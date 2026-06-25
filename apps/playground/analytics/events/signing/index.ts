import { MESSAGE_SIGNED, MessageSignedPayload } from './message-signed';
import { TYPED_DATA_SIGNED, TypedDataSignedPayload } from './typed-data-signed';

export const SIGNING_EVENTS = {
  MESSAGE_SIGNED,
  TYPED_DATA_SIGNED,
} as const;

export interface SigningEventPayload {
  [MESSAGE_SIGNED]: MessageSignedPayload;
  [TYPED_DATA_SIGNED]: TypedDataSignedPayload;
}
