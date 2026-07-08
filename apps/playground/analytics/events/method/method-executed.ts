import type { ModeName, SdkType } from '../types';

export const METHOD_EXECUTED = 'METHOD_EXECUTED';

export interface MethodExecutedPayload {
  sdk: SdkType;
  /** The RPC method name (e.g. `eth_sendTransaction`). */
  method: string;
  /** The wagmi hook backing the call, when on the wagmi surface. */
  hookType?: string;
  /** Method category (e.g. `signing`, `transaction`). */
  category?: string;
  mode: ModeName;
  status: 'success' | 'error';
}
