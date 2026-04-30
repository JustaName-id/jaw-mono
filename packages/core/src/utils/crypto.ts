import { EncryptedData, RPCRequest, RPCResponse } from '../messages/index.js';

/**
 * Generate ECDH P-256 key pair
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true,
        ['deriveKey']
    );
}

/**
 * Derive shared secret from own private key and peer's public key
 */
export async function deriveSharedSecret(ownPrivateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: peerPublicKey,
        },
        ownPrivateKey,
        {
            name: 'AES-GCM',
            length: 256,
        },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encrypt(sharedSecret: CryptoKey, plainText: string): Promise<EncryptedData> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherText = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        sharedSecret,
        new TextEncoder().encode(plainText)
    );

    return { iv, cipherText };
}

export async function decrypt(sharedSecret: CryptoKey, { iv, cipherText }: EncryptedData): Promise<string> {
    const plainText = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv as BufferSource,
        },
        sharedSecret,
        cipherText
    );

    return new TextDecoder().decode(plainText);
}

/**
 * Encrypt content with AES-GCM
 */
export async function encryptContent(
    content: RPCRequest | RPCResponse,
    sharedSecret: CryptoKey
): Promise<EncryptedData> {
    const serialized = JSON.stringify(content, (_, value) => {
        if (!(value instanceof Error)) return value;

        const error = value as Error & { code?: unknown };
        return {
            ...(error.code ? { code: error.code } : {}),
            message: error.message,
        };
    });
    return encrypt(sharedSecret, serialized);
}

/**
 * Decrypt content with AES-GCM
 */
export async function decryptContent<R extends RPCRequest | RPCResponse>(
    encryptedData: EncryptedData,
    sharedSecret: CryptoKey
): Promise<R> {
    return JSON.parse(await decrypt(sharedSecret, encryptedData));
}

/**
 * Export key to hex string
 */
export async function exportKeyToHexString(type: 'private' | 'public', key: CryptoKey): Promise<string> {
    const format = type === 'private' ? 'pkcs8' : 'spki';
    const exported = await crypto.subtle.exportKey(format, key);
    return bytesToHex(new Uint8Array(exported));
}

/**
 * Import key from hex string
 */
export async function importKeyFromHexString(type: 'private' | 'public', hexString: string): Promise<CryptoKey> {
    const format = type === 'private' ? 'pkcs8' : 'spki';
    const keyData = hexToBytes(hexString) as BufferSource;

    return await crypto.subtle.importKey(
        format,
        keyData,
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true,
        type === 'private' ? ['deriveKey'] : []
    );
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function hexToBytes(hex: string): Uint8Array {
    // Validate hex string format
    if (hex.length === 0) {
        throw new Error('Invalid hex string: empty string');
    }

    if (hex.length % 2 !== 0) {
        throw new Error('Invalid hex string: odd length (must have even number of characters)');
    }

    if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new Error('Invalid hex string: contains non-hexadecimal characters');
    }

    const buffer = new ArrayBuffer(hex.length / 2);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
