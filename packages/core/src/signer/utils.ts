import {ConfigMessage, MessageID, SignerType} from "../messages/index.js";
import {AppMetadata, JawProviderPreference, ProviderEventCallback, RequestArguments} from "../provider/index.js";
import {Communicator} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {JAWSigner} from "./JAWSigner.js";
import {createLocalStorage} from "../storage-manager/utils.js";
import {Client, Hex, isAddress, pad} from "viem";
import {getCode, readContract} from "viem/actions";
import {abi} from "../account/index.js";

const SIGNER_TYPE_KEY = 'SignerType';
const storage = createLocalStorage('JAWSDK', 'SignerConfig');

export type FindOwnerIndexParams = {
    /**
     * The address of the account to get the owner index for
     */
    address: `0x${string}`;
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

export function createSigner(params: {
    signerType: SignerType;
    metadata: AppMetadata;
    communicator: Communicator;
    callback: ProviderEventCallback;
}): Signer {
    const { signerType, metadata, communicator, callback } = params;
    switch (signerType) {
        case 'scw': {
            return new JAWSigner({
                metadata,
                callback,
                communicator,
            });
        }
    }
}

export async function fetchSignerType(params: {
    communicator: Communicator;
    preference: JawProviderPreference;
    handshakeRequest: RequestArguments;
}): Promise<SignerType> {
    const { communicator, handshakeRequest } = params;

    const request: ConfigMessage & { id: MessageID } = {
        id: crypto.randomUUID(),
        event: 'selectSignerType',
        data: {
            ...params.preference,
            handshakeRequest,
        },
    };
    const { data } = await communicator.postRequestAndWaitForResponse(request);
    return data as SignerType;
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