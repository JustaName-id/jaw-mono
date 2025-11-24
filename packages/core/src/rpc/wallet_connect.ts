import { SerializedEthereumRpcError } from '../errors/index.js';
import {Address} from "viem";

export type SignInWithEthereumCapabilityRequest = {
    nonce: string;
    chainId: string; // EIP-155 hex-encoded
    version?: string;
    scheme?: string;
    domain?: string;
    uri?: string;
    statement?: string;
    issuedAt?: string;
    expirationTime?: string;
    notBefore?: string;
    requestId?: string;
    resources?: string[];
};


export type SignInWithEthereumCapabilityResponse = {
    message: string;
    signature: `0x${string}`;
};

export type SubnameTextRecordCapabilityRequest = Array<{ key: string; value: string }>

export type WalletConnectRequest = {
    method: 'wallet_connect';
    params: [
        {
            // Optional capabilities to request (e.g. Sign In With Ethereum, subname text records).
            capabilities?: {
                signInWithEthereum?: SignInWithEthereumCapabilityRequest;
                subnameTextRecords?: SubnameTextRecordCapabilityRequest;
            };
        },
    ];
};

export type WalletConnectResponse = {
    accounts: {
        // Address of the connected account.
        address: Address;
        // Capabilities granted that is associated with this account.
        capabilities?: {
            signInWithEthereum?: SignInWithEthereumCapabilityResponse | SerializedEthereumRpcError;
        };
    }[];
};
