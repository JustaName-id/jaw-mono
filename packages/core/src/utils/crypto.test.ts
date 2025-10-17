import { decrypt, deriveSharedSecret, encrypt, generateKeyPair, importKeyFromHexString } from './crypto.js';
import {describe, it, expect} from "bun:test";

describe('Crypto', () => {
    describe('generateKeyPair', () => {
        it('should generate a unique key pair on each call', async () => {
            const firstPublicKey = (await generateKeyPair()).publicKey;
            const secondPublicKey = (await generateKeyPair()).publicKey;

            expect(firstPublicKey).not.toBe(secondPublicKey);
        });
    });

    describe('deriveSharedSecret', () => {
        it('should derive a shared secret successfully', async () => {
            const ownKeyPair = await generateKeyPair();
            const peerKeyPair = await generateKeyPair();

            const sharedSecret = await deriveSharedSecret(ownKeyPair.privateKey, peerKeyPair.publicKey);
            expect(sharedSecret).toBeDefined();
        });
    });

    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt a message successfully', async () => {
            const ownKeyPair = await generateKeyPair();
            const peerKeyPair = await generateKeyPair();

            const sharedSecret = await deriveSharedSecret(ownKeyPair.privateKey, peerKeyPair.publicKey);
            const sharedSecretDerivedByPeer = await deriveSharedSecret(
                peerKeyPair.privateKey,
                ownKeyPair.publicKey
            );

            const plaintext = 'This is a secret message';
            const encryptedMessage = await encrypt(sharedSecret, plaintext);
            const decryptedText = await decrypt(sharedSecretDerivedByPeer, encryptedMessage);

            expect(decryptedText).toBe(plaintext);
        });

        it('should throw an error when decrypting with a different shared secret', async () => {
            const ownKeyPair = await generateKeyPair();
            const peerKeyPair = await generateKeyPair();

            const sharedSecret = await deriveSharedSecret(ownKeyPair.privateKey, peerKeyPair.publicKey);

            const plaintext = 'This is a secret message';

            const encryptedMessage = await encrypt(sharedSecret, plaintext);

            // generate new keypair on otherKeyManager and use it to derive different shared secret
            const sharedSecretDerivedByPeer = await deriveSharedSecret(
                peerKeyPair.privateKey,
                peerKeyPair.publicKey
            );

            // Attempting to decrypt with a different shared secret
            await expect(decrypt(sharedSecretDerivedByPeer, encryptedMessage)).rejects.toThrow(
                'The operation failed for an operation-specific reason'
            );
        });
    });

    describe('hexToBytes validation', () => {
        it('should throw on empty string', async () => {
            await expect(importKeyFromHexString('public', '')).rejects.toThrow('empty string');
        });

        it('should throw on odd length hex string', async () => {
            await expect(importKeyFromHexString('public', '123')).rejects.toThrow('odd length');
        });

        it('should throw on invalid characters', async () => {
            await expect(importKeyFromHexString('public', 'xyz123')).rejects.toThrow('non-hexadecimal');
        });

        it('should throw on hex string with spaces', async () => {
            await expect(importKeyFromHexString('public', '12345678 9')).rejects.toThrow('non-hexadecimal');
        });

        it('should accept valid hex string (lowercase)', async () => {
            // This will fail at key import (invalid key data), but should pass hex validation
            await expect(importKeyFromHexString('public', 'abcd1234')).rejects.not.toThrow('Invalid hex string');
        });

        it('should accept valid hex string (uppercase)', async () => {
            // This will fail at key import (invalid key data), but should pass hex validation
            await expect(importKeyFromHexString('public', 'ABCD1234')).rejects.not.toThrow('Invalid hex string');
        });

        it('should accept valid hex string (mixed case)', async () => {
            // This will fail at key import (invalid key data), but should pass hex validation
            await expect(importKeyFromHexString('public', 'AbCd1234')).rejects.not.toThrow('Invalid hex string');
        });
    });
});
