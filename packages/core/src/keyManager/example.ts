/**
 * Example usage of KeyManager
 * This file demonstrates the basic usage of the KeyManager class
 */

import { KeyManager } from './keyManager.js';
import {
  exportKeyToHexString,
  importKeyFromHexString,
  encryptContent,
  decryptContent,
} from '../utils/crypto.js';

/**
 * Example 1: Basic key exchange between two parties
 */
async function exampleKeyExchange() {
  console.log('=== Example 1: Key Exchange ===\n');

  // Party A (e.g., your DApp)
  const partyA = new KeyManager();
  const publicKeyA = await partyA.getOwnPublicKey();
  const publicKeyAHex = await exportKeyToHexString('public', publicKeyA);
  console.log('Party A public key:', publicKeyAHex.substring(0, 32) + '...');

  // Party B (e.g., JAW keys popup)
  const partyB = new KeyManager();
  const publicKeyB = await partyB.getOwnPublicKey();
  const publicKeyBHex = await exportKeyToHexString('public', publicKeyB);
  console.log('Party B public key:', publicKeyBHex.substring(0, 32) + '...');

  // Exchange keys
  const importedKeyA = await importKeyFromHexString('public', publicKeyAHex);
  const importedKeyB = await importKeyFromHexString('public', publicKeyBHex);

  await partyA.setPeerPublicKey(importedKeyB);
  await partyB.setPeerPublicKey(importedKeyA);

  // Both parties now have shared secrets
  const secretA = await partyA.getSharedSecret();
  const secretB = await partyB.getSharedSecret();

  console.log('Party A has shared secret:', secretA !== null);
  console.log('Party B has shared secret:', secretB !== null);
  console.log('');
}

/**
 * Example 2: Encrypted message exchange
 */
async function exampleEncryptedMessage() {
  console.log('=== Example 2: Encrypted Message ===\n');

  // Setup
  const alice = new KeyManager();
  const bob = new KeyManager();

  const aliceKey = await alice.getOwnPublicKey();
  const bobKey = await bob.getOwnPublicKey();

  await alice.setPeerPublicKey(bobKey);
  await bob.setPeerPublicKey(aliceKey);

  // Alice sends an encrypted message
  const message = {
    action: {
      method: 'eth_requestAccounts',
      params: [],
    },
    chainId: 1,
  };

  const aliceSecret = await alice.getSharedSecret();
  if (!aliceSecret) throw new Error('No shared secret');

  const encrypted = await encryptContent(message, aliceSecret);
  console.log('Alice encrypted message');
  console.log('IV length:', encrypted.iv.length, 'bytes');
  console.log('Ciphertext length:', encrypted.cipherText.byteLength, 'bytes');

  // Bob decrypts the message
  const bobSecret = await bob.getSharedSecret();
  if (!bobSecret) throw new Error('No shared secret');

  const decrypted = await decryptContent(encrypted, bobSecret);
  console.log('Bob decrypted message:', JSON.stringify(decrypted, null, 2));
  console.log('Message match:', JSON.stringify(message) === JSON.stringify(decrypted));
  console.log('');
}

/**
 * Example 3: Key persistence
 */
async function examplePersistence() {
  console.log('=== Example 3: Key Persistence ===\n');

  // Create a key manager and generate keys
  const km1 = new KeyManager();
  const key1 = await km1.getOwnPublicKey();
  const key1Hex = await exportKeyToHexString('public', key1);
  console.log('First key manager public key:', key1Hex.substring(0, 32) + '...');

  // Create a new key manager - should load the same keys
  const km2 = new KeyManager();
  const key2 = await km2.getOwnPublicKey();
  const key2Hex = await exportKeyToHexString('public', key2);
  console.log('Second key manager public key:', key2Hex.substring(0, 32) + '...');

  console.log('Keys match (loaded from storage):', key1Hex === key2Hex);

  // Clear and regenerate
  await km2.clear();
  const key3 = await km2.getOwnPublicKey();
  const key3Hex = await exportKeyToHexString('public', key3);
  console.log('After clear, new key:', key3Hex.substring(0, 32) + '...');
  console.log('New key different:', key1Hex !== key3Hex);
  console.log('');
}

/**
 * Run all examples
 */
export async function runExamples() {
  try {
    await exampleKeyExchange();
    await exampleEncryptedMessage();
    await examplePersistence();
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

