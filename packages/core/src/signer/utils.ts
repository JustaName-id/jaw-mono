import {SignerType} from "../messages/index.js";
import {AppMetadata, ProviderEventCallback} from "../provider/index.js";
import {Communicator} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {JAWSigner} from "./JAWSigner.js";
import {AppSpecificSigner} from "./AppSpecificSigner.js";
import {UIHandler} from "../ui/interface.js";
import {createLocalStorage} from "../storage-manager/utils.js";

const SIGNER_TYPE_KEY = 'SignerType';
const storage = createLocalStorage('JAWSDK', 'SignerConfig');

export function loadSignerType(): SignerType | null {
    return storage.getItem<SignerType>(SIGNER_TYPE_KEY);
}

export function storeSignerType(signerType: SignerType): void {
    storage.setItem(SIGNER_TYPE_KEY, signerType);
}

export function clearSignerType(): void {
    storage.removeItem(SIGNER_TYPE_KEY);
}

export function createSigner(params: {
    signerType: SignerType;
    metadata: AppMetadata;
    communicator?: Communicator;
    uiHandler?: UIHandler;
    callback: ProviderEventCallback;
}): Signer {
    const { signerType, metadata, communicator, uiHandler, callback } = params;

    switch (signerType) {
        case 'crossPlatform': {
            if (!communicator) {
                throw new Error('Communicator is required for crossPlatform signer');
            }
            return new JAWSigner({
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
            });
        }
    }
}