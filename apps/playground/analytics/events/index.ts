import { CHAIN_EVENTS, ChainEventPayload } from './chain';
import { CONNECTION_EVENTS, ConnectionEventPayload } from './connection';
import { METHOD_EVENTS, MethodEventPayload } from './method';
import { NAVIGATION_EVENTS, NavigationEventPayload } from './navigation';
import { PERMISSIONS_EVENTS, PermissionsEventPayload } from './permissions';
import { SIGNING_EVENTS, SigningEventPayload } from './signing';
import { TRANSACTION_EVENTS, TransactionEventPayload } from './transaction';

export const EVENTS = {
  ...CHAIN_EVENTS,
  ...CONNECTION_EVENTS,
  ...PERMISSIONS_EVENTS,
  ...METHOD_EVENTS,
  ...NAVIGATION_EVENTS,
  ...SIGNING_EVENTS,
  ...TRANSACTION_EVENTS,
} as const;

export interface EventPayload
  extends ChainEventPayload,
    ConnectionEventPayload,
    MethodEventPayload,
    NavigationEventPayload,
    PermissionsEventPayload,
    SigningEventPayload,
    TransactionEventPayload {}
