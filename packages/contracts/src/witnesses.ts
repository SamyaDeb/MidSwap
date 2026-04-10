/**
 * MidSwap Witness Providers
 * 
 * These witness functions provide off-chain computation for the LiquidityPool contract.
 * The contract verifies correctness via on-chain constraints (verifyFloorDivision, verifyFloorSqrt).
 * 
 * @see LiquidityPool.compact for the verification circuits
 */

import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

// Type alias for the Ledger (empty in our case, ledger state is managed by runtime)
type Ledger = Record<string, never>;

/**
 * Witness provider type matching the contract's expected signature.
 * PS = Private State type parameter
 */
export type Witnesses<PS> = {
  divFloor(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
    numerator: bigint,
    denominator: bigint
  ): [PS, bigint];
  
  sqrtFloor(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
    value: bigint
  ): [PS, bigint];
};

/**
 * Floor division: returns floor(numerator / denominator)
 * 
 * Used for:
 * - LP token calculations in addLiquidity
 * - Token amount calculations in removeLiquidity
 * - Swap output calculations
 * 
 * The contract verifies: q * d <= n && n - q*d < d
 */
function divFloorImpl(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('Division by zero or negative denominator');
  }
  
  // BigInt division in JavaScript is floor division for positive numbers
  return numerator / denominator;
}

/**
 * Floor square root: returns floor(sqrt(value))
 * 
 * Uses Newton's method (Babylonian algorithm) for integer square root.
 * 
 * Used for:
 * - Initial liquidity calculation: sqrt(amount0 * amount1)
 * 
 * The contract verifies: r*r <= v && v - r*r < 2*r + 1
 */
function sqrtFloorImpl(value: bigint): bigint {
  if (value < 0n) {
    throw new Error('Cannot compute square root of negative number');
  }
  
  if (value === 0n) {
    return 0n;
  }
  
  if (value <= 3n) {
    return 1n;
  }
  
  // Newton's method for integer square root
  let x = value;
  let y = (x + 1n) / 2n;
  
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  
  return x;
}

/**
 * Create witness providers for the LiquidityPool contract.
 * 
 * Usage:
 * ```typescript
 * import { Contract } from '../managed/LiquidityPool/contract';
 * import { createWitnesses } from './witnesses';
 * 
 * const witnesses = createWitnesses<MyPrivateState>();
 * const contract = new Contract(witnesses);
 * ```
 */
export function createWitnesses<PS>(): Witnesses<PS> {
  return {
    divFloor(
      context: __compactRuntime.WitnessContext<Ledger, PS>,
      numerator: bigint,
      denominator: bigint
    ): [PS, bigint] {
      const result = divFloorImpl(numerator, denominator);
      return [context.privateState, result];
    },
    
    sqrtFloor(
      context: __compactRuntime.WitnessContext<Ledger, PS>,
      value: bigint
    ): [PS, bigint] {
      const result = sqrtFloorImpl(value);
      return [context.privateState, result];
    }
  };
}

/**
 * Default witness providers with null private state.
 * Use this for simple test scenarios.
 */
export const defaultWitnesses = createWitnesses<null>();

// Export individual functions for unit testing
export { divFloorImpl, sqrtFloorImpl };
