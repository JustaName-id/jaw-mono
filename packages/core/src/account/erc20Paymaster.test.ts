import { describe, it, expect } from 'vitest';
import { tightenErc20UserOpGas } from './erc20Paymaster.js';

// Tightening sized against on-chain receipts: bundler returns ~2x effective price
// and ~2.2-2.7x actual gas used. Multipliers (1.50x baseFee, 0.85x gas limits)
// leave ~50-70% safety margin while still narrowing the 4-5x display gap.
describe('tightenErc20UserOpGas', () => {
    const baseFee = 5_000_000n;
    const priorityFee = 2_000_000n;
    // Mirror what we observed on Base Sepolia: bundler returns maxFeePerGas = 2x cap.
    const bundlerUserOp = {
        maxFeePerGas: 14_000_000n,
        maxPriorityFeePerGas: priorityFee,
        callGasLimit: 200_000n,
        verificationGasLimit: 220_000n,
    };

    it('tightens maxFeePerGas to baseFee * 1.50 + priorityFee when bundler returned higher', () => {
        const out = tightenErc20UserOpGas(bundlerUserOp, baseFee);
        // 5_000_000 * 1.50 + 2_000_000 = 9_500_000
        expect(out.maxFeePerGas).toBe(9_500_000n);
    });

    it('leaves maxFeePerGas alone when bundler already returned a tighter value', () => {
        const out = tightenErc20UserOpGas({ ...bundlerUserOp, maxFeePerGas: 7_000_000n }, baseFee);
        expect(out.maxFeePerGas).toBe(7_000_000n);
    });

    it('scales callGasLimit and verificationGasLimit by 0.85', () => {
        const out = tightenErc20UserOpGas(bundlerUserOp, baseFee);
        expect(out.callGasLimit).toBe(170_000n);
        expect(out.verificationGasLimit).toBe(187_000n);
    });

    it('never raises a value above the bundler estimate', () => {
        // Even with baseFee zero, candidateMaxFee = 0 + priorityFee = 2_000_000n,
        // which is less than bundler's 14_000_000n, so tightening just shrinks.
        const out = tightenErc20UserOpGas(bundlerUserOp, 0n);
        expect(out.maxFeePerGas).toBeLessThanOrEqual(bundlerUserOp.maxFeePerGas);
        expect(out.callGasLimit).toBeLessThanOrEqual(bundlerUserOp.callGasLimit);
        expect(out.verificationGasLimit).toBeLessThanOrEqual(bundlerUserOp.verificationGasLimit);
    });

    it('matches the Base Sepolia receipt empirics (~3.15x gap → ~1.82x gap)', () => {
        // From the actual Base Sepolia userOp: bundler estimate sum of (call + verification)
        // limits was 394,153 with maxFeePerGas 14_000_000. Sum * maxFee = 5.518e12 wei.
        // actualGasUsed was 250,478 and effective price 7_000_000 → actual cost 1.753e12.
        // Original ratio: 5.518e12 / 1.753e12 ≈ 3.15x (for these two limits alone).
        // After tightening: 335_030 * 9_500_000 = 3.183e12 → 1.82x. Still a win, with
        // more headroom than the prior 1.30x/0.75x knobs to avoid AA50 reverts.
        const tightened = tightenErc20UserOpGas(
            {
                maxFeePerGas: 14_000_000n,
                maxPriorityFeePerGas: 2_000_000n,
                callGasLimit: 179_800n,
                verificationGasLimit: 214_353n,
            },
            5_000_000n
        );
        const originalCost = (179_800n + 214_353n) * 14_000_000n;
        const tightenedCost = (tightened.callGasLimit + tightened.verificationGasLimit) * tightened.maxFeePerGas;
        const actualCost = 250_478n * 7_000_000n;
        // Tightened cost is at most ~1.9x actual (was ~3.15x)
        expect((tightenedCost * 100n) / actualCost).toBeLessThan(190n);
        // And tightened is strictly tighter than original
        expect(tightenedCost).toBeLessThan(originalCost);
        // But still above actual — we don't go below what's needed
        expect(tightenedCost).toBeGreaterThan(actualCost);
    });
});
