import { CHAIN_SWITCHED, ChainSwitchedPayload } from './chain-switched';

export const CHAIN_EVENTS = {
  CHAIN_SWITCHED,
} as const;

export interface ChainEventPayload {
  [CHAIN_SWITCHED]: ChainSwitchedPayload;
}
