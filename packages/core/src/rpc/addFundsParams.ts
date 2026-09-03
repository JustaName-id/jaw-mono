import { standardErrors } from '../errors/index.js';
import { isRecord } from './paramUtils.js';

const METHOD = 'wallet_addFunds';

/**
 * A wallet_addFunds request after validation.
 *
 * Both fields are hints about what to show. Neither can name where the funds
 * go: the destination is the connected account, resolved by the wallet (see
 * `resolveDestination`). A dapp that could name the destination could point the
 * QR at an address the user does not own, while the user is looking at wallet
 * chrome — so an `address` key in the params is ignored rather than honoured.
 */
export interface AddFundsParams {
    /** Chain the QR pins via EIP-681. Undefined ⇒ the connected chain. */
    chainId?: number;
    /** Asset symbol to ask the sender for, e.g. 'USDC'. Display only. */
    asset?: string;
}

/**
 * Validates the dapp's params. Called before any dialog opens, so a malformed
 * request is refused with -32602 rather than surfacing inside an open screen.
 *
 * Absent params are legal: `wallet_addFunds` with no arguments is the common
 * case, and means "show the connected account on the connected chain".
 */
export function parseAddFundsParams(params: unknown): AddFundsParams {
    if (params === undefined || params === null) return {};
    if (!Array.isArray(params)) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: expected a single object parameter`);
    }
    if (params.length === 0 || params[0] === undefined || params[0] === null) return {};
    if (!isRecord(params[0])) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: expected a single object parameter`);
    }

    const { chainId, asset } = params[0];

    return {
        chainId: parseChainId(chainId),
        asset: parseAsset(asset),
    };
}

/**
 * A decimal chainId, not the hex quantity the other methods take. This param
 * never reaches an RPC call — it only decides which chain the QR names — and
 * `chains` in the SDK config are decimal ids, so decimal is the shape a caller
 * already holds. Hex is still accepted so a viem-shaped caller is not punished.
 */
function parseChainId(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;

    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw standardErrors.rpc.invalidParams(`${METHOD}: invalid chainId ${value}`);
        }
        return value;
    }

    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) {
        return Number(BigInt(value));
    }

    throw standardErrors.rpc.invalidParams(`${METHOD}: chainId must be a number or a hex quantity`);
}

/**
 * An asset symbol, which is rendered as-is next to the QR. Length and charset
 * are bounded because this string is dapp-supplied text on a wallet surface: a
 * long or newline-bearing value could push the address out of view or dress the
 * screen up as something it is not.
 */
function parseAsset(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || !/^[A-Za-z0-9.$-]{1,12}$/.test(value)) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: asset must be a short token symbol, e.g. 'USDC'`);
    }
    return value;
}
