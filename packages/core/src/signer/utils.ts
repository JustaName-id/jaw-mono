import {SignerType} from "../messages/index.js";
import {AppMetadata, ProviderEventCallback, PaymasterConfig} from "../provider/index.js";
import {Communicator} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {CrossPlatformSigner} from "./cross-platform/CrossPlatformSigner.js";
import {AppSpecificSigner} from "./app-specific/AppSpecificSigner.js";
import {EIP7702Signer} from "./eip7702/EIP7702Signer.js";
import {UIHandler} from "../ui/interface.js";
import type {LocalAccount} from "viem";

// Re-export storage functions for backward compatibility
export { loadSignerType, storeSignerType, clearSignerType } from "./signerStorage.js";

export type InternalSignerType = SignerType | 'eip7702';

export function createSigner(params: {
    signerType: InternalSignerType;
    metadata: AppMetadata;
    communicator?: Communicator;
    uiHandler?: UIHandler;
    callback: ProviderEventCallback;
    apiKey: string;
    paymasters?: Record<number, PaymasterConfig>;
    ens?: string;
    localAccount?: LocalAccount;
}): Signer {
    const { signerType, metadata, communicator, uiHandler, callback, apiKey, paymasters, ens, localAccount } = params;

    switch (signerType) {
        case 'crossPlatform': {
            if (!communicator) {
                throw new Error('Communicator is required for crossPlatform signer');
            }
            return new CrossPlatformSigner({
                metadata,
                callback,
                communicator,
            });
        }

        case 'appSpecific': {
            if (!uiHandler) {
                throw new Error('UIHandler is required for appSpecific signer');
            }
            return new AppSpecificSigner({
                metadata,
                callback,
                uiHandler,
                apiKey,
                paymasters,
                ens,
            });
        }

        case 'eip7702': {
            if (!localAccount) {
                throw new Error('LocalAccount is required for eip7702 signer');
            }
            return new EIP7702Signer({
                metadata,
                callback,
                localAccount,
                apiKey,
            });
        }
    }
}