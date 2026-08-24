import type { FeatureContext } from '../types';

/** A feature CTA was tapped and the real keys.jaw.id dialog is opening. */
export const DEMO_ACTION_STARTED = 'DEMO_ACTION_STARTED';
/** The wallet request settled — the tour advances to the next feature. */
export const DEMO_ACTION_COMPLETED = 'DEMO_ACTION_COMPLETED';
/** EIP-1193 4001: the visitor dismissed the dialog. A normal path, not an error. */
export const DEMO_ACTION_REJECTED = 'DEMO_ACTION_REJECTED';
/** Anything else: unfunded account, dead RPC, paymaster rejection… */
export const DEMO_ACTION_FAILED = 'DEMO_ACTION_FAILED';

export type DemoActionPayload = FeatureContext;

export interface DemoActionFailedPayload extends FeatureContext {
  /** EIP-1193 / JSON-RPC error code when the provider supplied one. */
  code?: number;
  message: string;
}
