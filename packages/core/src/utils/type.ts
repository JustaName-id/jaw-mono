import { isHex } from 'viem';
import { standardErrors } from '../errors/index.js';

// ============================================================================
// Branded Types
// ============================================================================

interface Tag<T extends string, RealType> {
    __tag__: T;
    __realType__: RealType;
}

export type OpaqueType<T extends string, U> = U & Tag<T, U>;

export function OpaqueType<T extends Tag<string, unknown>>() {
    return (value: T extends Tag<string, infer U> ? U : never): T => value as T;
}

export type HexString = OpaqueType<'HexString', string>;
export const HexString = OpaqueType<HexString>();

export type IntNumber = OpaqueType<'IntNumber', number>;
export function IntNumber(num: number): IntNumber {
    return Math.floor(num) as IntNumber;
}

// ============================================================================
// Regex Patterns
// ============================================================================

const INT_STRING_REGEX = /^[0-9]*$/;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Remove 0x prefix from hex string
 */
function strip0x(hex: string): string {
    return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

/**
 * Ensure hex string has even length by prepending '0' if needed
 */
export function ensureEvenLengthHexString(hex: unknown, includePrefix = false): HexString {
    if (typeof hex !== 'string') {
        throw standardErrors.rpc.invalidParams(`"${String(hex)}" is not a string`);
    }

    let h = strip0x(hex).toLowerCase();

    if (h.length % 2 === 1) {
        h = '0' + h;
    }

    return HexString(includePrefix ? `0x${h}` : h);
}

// ============================================================================
// Number Conversion
// ============================================================================

/**
 * Convert number to hex string
 */
export function hexStringFromNumber(num: number): HexString {
    return HexString(`0x${BigInt(num).toString(16)}`);
}

/**
 * Ensure value is an integer number
 * Supports: number, decimal string, hex string
 */
export function ensureIntNumber(num: unknown): IntNumber {
    if (typeof num === 'number' && Number.isInteger(num)) {
        return IntNumber(num);
    }
    if (typeof num === 'string') {
        // Handle decimal strings like "123"
        if (INT_STRING_REGEX.test(num)) {
            return IntNumber(Number(num));
        }
        // Handle hex strings like "0x7b"
        if (isHex(num)) {
            return IntNumber(Number(BigInt(ensureEvenLengthHexString(num, true))));
        }
    }
    throw standardErrors.rpc.invalidParams(`Not an integer: ${String(num)}`);
}