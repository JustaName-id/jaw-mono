export type RpcEnvelope = {
  kind: 'rpc-request';
  id: string;
  method: string;
  params?: readonly unknown[] | object;
};

export type RpcResponse = {
  kind: 'rpc-response';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type ProviderEventName = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged';

export type ProviderEvent = {
  kind: 'provider-event';
  event: ProviderEventName;
  payload: unknown;
};

export type StatusRequest = { kind: 'status-request'; id: string };
export type StatusResponse = {
  kind: 'status-response';
  id: string;
  connected: boolean;
  accounts: string[];
  chainId: string | null;
};

// Bridge: offscreen → background → keys.jaw.id popup.
// The SDK's Communicator runs in the offscreen DOM but Chrome blocks
// `window.open` there without user gesture, so we proxy through the background.
export type WindowOpen = {
  kind: 'window-open';
  id: string;
  url: string;
  features?: string;
  // RPC id in flight when the SDK called window.open. The background uses it to
  // look up which dApp tab originated the request, so the signing popup can be
  // told the real dApp origin instead of the offscreen document's URL.
  rpcId?: string;
};
export type WindowOpenAck = {
  kind: 'window-open-ack';
  id: string;
  ok: boolean;
  error?: string;
};
export type WindowClosed = { kind: 'window-closed'; id: string };
export type WindowPostMessage = {
  kind: 'window-post-message';
  id: string;
  data: unknown;
  targetOrigin: string;
};
export type WindowIncomingMessage = {
  kind: 'window-incoming-message';
  id: string;
  data: unknown;
  origin: string;
};
export type WindowClose = { kind: 'window-close'; id: string };

export type AnyMessage =
  | RpcEnvelope
  | RpcResponse
  | ProviderEvent
  | StatusRequest
  | StatusResponse
  | WindowOpen
  | WindowOpenAck
  | WindowClosed
  | WindowPostMessage
  | WindowIncomingMessage
  | WindowClose;

export const newId = (): string => crypto.randomUUID();
