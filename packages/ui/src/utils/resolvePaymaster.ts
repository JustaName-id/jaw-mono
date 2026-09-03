/**
 * The paymaster a request runs against: the one named in the request's
 * `paymasterService` capability, else the one configured for the chain.
 *
 * The url decides for the pair. Resolving the two halves on their own lets them
 * come from different places: a dapp that names a sponsorship paymaster in
 * capabilities, on a wallet configured with `paymasters[chainId].context` for
 * the ERC-20 one, sent that token context to the sponsor. A context belongs to
 * the paymaster it was written for, and the SDK now forwards whatever pair it
 * is handed, so a mismatch made here survives all the way down.
 */
export function resolvePaymaster(
  capability: { url?: string; context?: Record<string, unknown> } | undefined,
  configured: { url?: string; context?: Record<string, unknown> } | undefined
): { url?: string; context?: Record<string, unknown> } {
  if (capability?.url) {
    return { url: capability.url, context: capability.context };
  }
  return { url: configured?.url, context: configured?.context };
}
