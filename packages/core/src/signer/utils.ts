import {SignerType} from "../messages/index.js";
import {AppMetadata, ProviderEventCallback} from "../provider/index.js";
import {Communicator} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {JAWSigner} from "./JAWSigner.js";
import {AppSpecificSigner} from "./AppSpecificSigner.js";
import {createLocalStorage} from "../storage-manager/utils.js";
import {Address, Client, Hex, isAddress, pad} from "viem";
import {getCode, readContract} from "viem/actions";
import {abi} from "../account/index.js";

const SIGNER_TYPE_KEY = 'SignerType';
const storage = createLocalStorage('JAWSDK', 'SignerConfig');

export type FindOwnerIndexParams = {
    /**
     * The address of the account to get the owner index for
     */
    address: Address;
    /**
     * The client to use to get the code and read the contract
     */
    client: Client;
    /**
     * The public key of the owner
     */
    publicKey: Hex;
};

export function loadSignerType(): SignerType | null {
    return storage.getItem<SignerType>(SIGNER_TYPE_KEY);
}

export function storeSignerType(signerType: SignerType): void {
    storage.setItem(SIGNER_TYPE_KEY, signerType);
}

/**
 * Create a signer instance based on the signer type
 * @param params - Signer creation parameters
 * @returns A signer instance (AppSpecificSigner or JAWSigner)
 */
export function createSigner(params: {
    signerType: SignerType;
    metadata: AppMetadata;
    communicator?: Communicator | null;
    callback: ProviderEventCallback;
}): Signer {
    const { signerType, metadata, communicator, callback } = params;

    switch (signerType) {
        case 'appSpecific':
            // App-specific mode: embedded UI via EventBus (no popup)
            return new AppSpecificSigner({
                metadata,
                callback,
            });

        case 'crossPlatform':
            // Smart Contract Wallet: popup-based authentication
            if (!communicator) {
                throw new Error('Communicator is required for popup mode (crossPlatform)');
            }
            return new JAWSigner({
                metadata,
                callback,
                communicator,
            });
    }
}

export async function findOwnerIndex({
                                         address,
                                         client,
                                         publicKey,
                                     }: FindOwnerIndexParams): Promise<number> {
    const code = await getCode(client, {
        address,
    });

    // If no code deployed, return 0
    if (!code) {
        return 0;
    }

    try {
        const ownerCount = await readContract(client, {
            address,
            abi,
            functionName: 'ownerCount',
        });

        // Iterate from lowest index up and return early when found
        for (let i = 0; i < Number(ownerCount); i++) {
            const owner = await readContract(client, {
                address,
                abi,
                functionName: 'ownerAtIndex',
                args: [BigInt(i)],
            });

            const formatted = formatPublicKey(publicKey);
            if (owner.toLowerCase() === formatted.toLowerCase()) {
                return i;
            }
        }
    } catch (error) {
        // If reading contract fails, return 0
        console.warn('Failed to read owner information:', error);
        return 0;
    }

    // Owner not found, return 0
    return 0;
}

/**
 * Formats 20 byte addresses to 32 byte public keys. Contract uses 32 byte keys for owners.
 * @param publicKey - The public key to format
 * @returns The formatted public key
 */
export function formatPublicKey(publicKey: Hex): Hex {
    if (isAddress(publicKey)) {
        return pad(publicKey);
    }
    return publicKey;
}