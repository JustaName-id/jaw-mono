import type { MessageID, RPCRequestMessage, RPCResponseMessage } from '@jaw.id/core';

/**
 * What a handshake resolves to. `cold-start` and `connect` leave a flow owning
 * the screen; every other route has answered or given up and must let the flow
 * lock go.
 */
export type HandshakeRoute = 'invalid' | 'connect-first' | 'cold-start' | 'connect' | 'unsupported';

export function routeHandshake(input: { hasHandshake: boolean; method?: string; hasSession: boolean }): HandshakeRoute {
  if (!input.hasHandshake) return 'invalid';
  if (input.method === 'handshake') return input.hasSession ? 'cold-start' : 'connect-first';
  if (input.method === 'eth_requestAccounts' || input.method === 'wallet_connect') return 'connect';
  return 'unsupported';
}

export function routeOwnsScreen(route: HandshakeRoute): boolean {
  return route === 'cold-start' || route === 'connect';
}

/**
 * A handshake failure, unencrypted — there is no shared secret with this peer
 * yet. The SDK throws on `content.failure` before it reads `sender`.
 */
export function buildHandshakeFailure(request: RPCRequestMessage, code: number, message: string): RPCResponseMessage {
  return {
    requestId: request.id,
    id: crypto.randomUUID() as MessageID,
    sender: '',
    correlationId: request.correlationId,
    content: { failure: { code, message } },
    timestamp: new Date(),
  };
}
