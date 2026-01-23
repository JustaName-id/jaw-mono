import {SignerType} from "../messages/index.js";
import {AppMetadata, ProviderEventCallback, PaymasterConfig} from "../provider/index.js";
import {CommunicationAdapter} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {CrossPlatformSigner} from "./cross-platform/CrossPlatformSigner.js";
import {AppSpecificSigner} from "./app-specific/AppSpecificSigner.js";
import {UIHandler} from "../ui/interface.js";

// Re-export storage functions for backward compatibility
export { loadSignerType, storeSignerType, clearSignerType } from "./signerStorage.js";

export function createSigner(params: {
    signerType: SignerType;
    metadata: AppMetadata;
    adapter?: CommunicationAdapter;
    uiHandler?: UIHandler;
    callback: ProviderEventCallback;
    apiKey: string;
    paymasters?: Record<number, PaymasterConfig>;
    ens?: string;
    keysUrl?: string;
    showTestnets?: boolean;
}): Signer {
    const { signerType, metadata, adapter, uiHandler, callback, apiKey, paymasters, ens, keysUrl, showTestnets } = params;

    switch (signerType) {
        case 'crossPlatform': {
            if (!adapter) {
                throw new Error('CommunicationAdapter is required for crossPlatform signer');
            }
            return new CrossPlatformSigner({
                metadata,
                callback,
                adapter,
                apiKey,
                keysUrl,
                showTestnets,
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
    }
}