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

/**
 * Response from subname text record capability.
 * Contains the issued subname and any text records that were set.
 */
export type SubnameTextRecordCapabilityResponse = {
    /** The issued subname (e.g., "user.yourapp.eth") */
    subname: string;
    /** The text records that were set on the subname */
    textRecords?: Array<{ key: string; value: string }>;
};

/**
 * Capabilities that can be requested during wallet_connect.
 * These are processed during the connection flow.
 */
export type WalletConnectCapabilities = {
    /** Sign-In with Ethereum capability for authentication */
    signInWithEthereum?: SignInWithEthereumCapabilityRequest;
    /** Subname text records capability for ENS subname issuance */
    subnameTextRecords?: SubnameTextRecordCapabilityRequest;
};

export type WalletConnectRequest = {
    method: 'wallet_connect';
    params: [
        {
            // Optional capabilities to request (e.g. Sign In With Ethereum, subname text records).
            capabilities?: WalletConnectCapabilities;
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
            subnameTextRecords?: SubnameTextRecordCapabilityResponse | SerializedEthereumRpcError;
        };
    }[];
};
