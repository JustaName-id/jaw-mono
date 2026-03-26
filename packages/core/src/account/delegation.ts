import { type Address, type Client, isAddressEqual } from "viem";
import { getCode } from "viem/actions";
import { EIP7702_CODE_PREFIX } from "../constants.js";

/**
 * Checks if an EOA is delegated to a specific implementation address via EIP-7702.
 * Returns true only if the EOA's bytecode is `0xef0100 || implementationAddress`.
 */
export async function isDelegatedToImplementation(
  client: Client,
  eoaAddress: Address,
  implementationAddress: Address
): Promise<boolean> {
  const code = await getCode(client, { address: eoaAddress });

  if (!code || !code.startsWith(EIP7702_CODE_PREFIX)) {
    return false;
  }

  const delegatedTo = `0x${code.slice(EIP7702_CODE_PREFIX.length)}` as Address;
  return isAddressEqual(delegatedTo, implementationAddress);
}
