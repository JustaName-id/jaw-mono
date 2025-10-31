import {SignerType} from "../messages/index.js";
import {AppMetadata, ProviderEventCallback} from "../provider/index.js";
import {Communicator} from "../communicator/index.js";
import {Signer} from "./interface.js";
import {JAWSigner} from "./JAWSigner.js";
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
    communicator: Communicator;
    callback: ProviderEventCallback;
}): Signer {
    const { signerType, metadata, communicator, callback } = params;
    switch (signerType) {
        case 'crossPlatform': {
            return new JAWSigner({
                metadata,
                callback,
                communicator,
            });
        }
    }
}