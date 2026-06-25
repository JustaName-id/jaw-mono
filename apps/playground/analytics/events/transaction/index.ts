import { TRANSACTION_SENT, TransactionSentPayload } from './transaction-sent';
import { CALLS_SENT, CallsSentPayload } from './calls-sent';

export const TRANSACTION_EVENTS = {
  TRANSACTION_SENT,
  CALLS_SENT,
} as const;

export interface TransactionEventPayload {
  [TRANSACTION_SENT]: TransactionSentPayload;
  [CALLS_SENT]: CallsSentPayload;
}
