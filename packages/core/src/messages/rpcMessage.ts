import { RequestArguments } from '../provider/interface.js';
import { SerializedEthereumRpcError } from '../errors/utils.js';
import { Message, MessageID } from './message.js';
import { Chain } from '../store/types.js';

interface RPCMessage extends Message {
    id: MessageID;
    correlationId: string | undefined;
    sender: string; // hex encoded public key of the sender
    content: unknown;
    timestamp: Date;
}

export type EncryptedData = {
    iv: Uint8Array;
    cipherText: ArrayBuffer;
};

export interface RPCRequestMessage extends RPCMessage {
    content:
        | {
        handshake: RequestArguments;
        chains?: { [key: number]: Chain };
    }
        | {
        encrypted: EncryptedData;
    };
}

export interface RPCResponseMessage extends RPCMessage {
    requestId: MessageID;
    content:
        | {
        encrypted: EncryptedData;
    }
        | {
        failure: SerializedEthereumRpcError;
    };
}

export type RPCRequest = {
    action: RequestArguments; // JSON-RPC call
    chainId: number;
};

export type RPCResponseNativeCurrency = {
    name?: string;
    symbol?: string;
    decimal?: number;
};

export type RPCResponse = {
    result:
        | {
        value: unknown; // JSON-RPC result
    }
        | {
        error: SerializedEthereumRpcError;
    };
    data?: {
        chains?: { [key: number]: Chain };
        capabilities?: Record<`0x${string}`, Record<string, unknown>>;
    };
};

