/**
 * Embedded "Continue as" connect fast path.
 *
 * On Safari the first connect (and any account creation) runs in the popup's
 * first-party world; the embedded iframe partition is blind to it. On the next
 * dApp action the iframe re-establishes its session with a fresh
 * wallet_connect, so the user is walked through "Continue as" (the passkey
 * ceremony Safari requires) and then a "Connect to app" screen — even though
 * they already approved connecting this exact account to this exact dApp in
 * the popup moments earlier.
 *
 * That second Connect screen re-asks an answered question: the lastAccount
 * hint is persisted dApp-side ONLY after the user approves a connection
 * (sendAccountHint fires post-approval, never on mere authentication), and the
 * user has just re-confirmed the choice by completing the Continue-as ceremony
 * for that same credential. So when the freshly authenticated credential IS
 * the hinted one, the connect can be approved silently.
 *
 * Everything else keeps the explicit screen:
 *   - a different account than the hint (a switch is a new connection),
 *   - no hint (first connect, or the hint lookup failed — fail closed),
 *   - popup/standalone contexts (no hint semantics there),
 *   - SIWE-capability connects (they need a real signature over a message the
 *     user should see, not consent replay).
 */
export function isSilentContinueAsConnect(args: {
  /** Running inside the embedded (iframe) transport */
  isEmbedded: boolean;
  /** Backend-resolved lastAccount hint (the account the dApp is connected as) */
  hintedCredentialId: string | null;
  /** Credential the user just authenticated with (Continue as / sign in) */
  authenticatedCredentialId: string;
  /** wallet_connect / eth_requestAccounts request params */
  params: unknown[];
}): boolean {
  const { isEmbedded, hintedCredentialId, authenticatedCredentialId, params } = args;
  if (!isEmbedded) return false;
  if (!hintedCredentialId || authenticatedCredentialId !== hintedCredentialId) return false;

  const capabilities = (params[0] as { capabilities?: { signInWithEthereum?: unknown } } | undefined)?.capabilities;
  if (capabilities?.signInWithEthereum) return false;

  return true;
}
