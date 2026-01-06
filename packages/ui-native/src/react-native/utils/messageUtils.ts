/**
 * Message utility functions
 * Extracted to break require cycles between ReactNativeUIHandler and wrappers
 */

export function hexToUtf8(hex: string): string {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export function isSiweMessage(message: string): boolean {
  if (!message) return false;

  try {
    let decodedMessage = message;
    if (message.startsWith('0x')) {
      decodedMessage = hexToUtf8(message);
    }

    const hasSiwePhrase = decodedMessage.includes('wants you to sign in with your Ethereum account');
    if (!hasSiwePhrase) return false;

    const hasUri = /URI:\s*.+/.test(decodedMessage);
    const hasVersion = /Version:\s*1/.test(decodedMessage);
    const hasChainId = /Chain ID:\s*\d+/.test(decodedMessage);
    const hasNonce = /Nonce:\s*[a-zA-Z0-9]{8,}/.test(decodedMessage);
    const hasIssuedAt = /Issued At:\s*.+/.test(decodedMessage);

    return hasSiwePhrase && hasUri && hasVersion && hasChainId && hasNonce && hasIssuedAt;
  } catch {
    return false;
  }
}
