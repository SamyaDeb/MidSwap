/**
 * MidSwap LiquidityPool Contract Tests
 * 
 * Integration tests for the LiquidityPool Compact contract with witness providers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Contract } from '../managed/LiquidityPool/contract';
import { createWitnesses, divFloorImpl, sqrtFloorImpl } from '../src/witnesses';

describe('Witness Providers', () => {
  describe('divFloor', () => {
    it('computes floor division correctly', () => {
      expect(divFloorImpl(10n, 3n)).toBe(3n);
      expect(divFloorImpl(9n, 3n)).toBe(3n);
      expect(divFloorImpl(100n, 7n)).toBe(14n);
      expect(divFloorImpl(1000000000000n, 999n)).toBe(1001001001n);
    });

    it('handles exact division', () => {
      expect(divFloorImpl(100n, 10n)).toBe(10n);
      expect(divFloorImpl(1000000n, 1000n)).toBe(1000n);
    });

    it('throws on division by zero', () => {
      expect(() => divFloorImpl(10n, 0n)).toThrow('Division by zero');
    });
  });

  describe('sqrtFloor', () => {
    it('computes integer square root correctly', () => {
      expect(sqrtFloorImpl(0n)).toBe(0n);
      expect(sqrtFloorImpl(1n)).toBe(1n);
      expect(sqrtFloorImpl(4n)).toBe(2n);
      expect(sqrtFloorImpl(9n)).toBe(3n);
      expect(sqrtFloorImpl(16n)).toBe(4n);
      expect(sqrtFloorImpl(25n)).toBe(5n);
    });

    it('floors non-perfect squares', () => {
      expect(sqrtFloorImpl(10n)).toBe(3n);  // sqrt(10) ≈ 3.162
      expect(sqrtFloorImpl(15n)).toBe(3n);  // sqrt(15) ≈ 3.872
      expect(sqrtFloorImpl(99n)).toBe(9n);  // sqrt(99) ≈ 9.949
      expect(sqrtFloorImpl(1000000n)).toBe(1000n);
    });

    it('handles large numbers', () => {
      const large = 1000000000000n;
      const result = sqrtFloorImpl(large);
      expect(result).toBe(1000000n);
      expect(result * result).toBeLessThanOrEqual(large);
    });

    it('throws on negative input', () => {
      expect(() => sqrtFloorImpl(-1n)).toThrow('negative');
    });
  });
});

describe('LiquidityPool Contract', () => {
  let contract: Contract<null>;

  beforeEach(() => {
    const witnesses = createWitnesses<null>();
    contract = new Contract(witnesses);
  });

  it('should create contract with witnesses', () => {
    expect(contract).toBeDefined();
    expect(contract.circuits).toBeDefined();
    expect(contract.witnesses).toBeDefined();
  });

  it('should have all required circuits', () => {
    expect(contract.circuits.initialize).toBeDefined();
    expect(contract.circuits.addLiquidity).toBeDefined();
    expect(contract.circuits.removeLiquidity).toBeDefined();
    expect(contract.circuits.swap).toBeDefined();
    expect(contract.circuits.getReserves).toBeDefined();
    expect(contract.circuits.getUserBalance).toBeDefined();
    expect(contract.circuits.getAmountOut).toBeDefined();
    expect(contract.circuits.getAmountIn).toBeDefined();
    expect(contract.circuits.getFeeBps).toBeDefined();
    expect(contract.circuits.isInitialized).toBeDefined();
  });

  it('should have required witness providers', () => {
    expect(contract.witnesses.divFloor).toBeDefined();
    expect(contract.witnesses.sqrtFloor).toBeDefined();
  });
});

describe('AMM Math Verification', () => {
  describe('Constant product formula', () => {
    it('verifies k invariant holds after swap', () => {
      const reserve0 = 1000000n;
      const reserve1 = 1000000n;
      const amountIn = 10000n;
      const feeBps = 30n; // 0.3%

      const k = reserve0 * reserve1;

      // Calculate swap output
      const feeMultiplier = 10000n - feeBps;
      const amountInWithFee = amountIn * feeMultiplier;
      const numerator = amountInWithFee * reserve1;
      const denominator = (reserve0 * 10000n) + amountInWithFee;
      const amountOut = divFloorImpl(numerator, denominator);

      // Update reserves
      const newReserve0 = reserve0 + amountIn;
      const newReserve1 = reserve1 - amountOut;
      const newK = newReserve0 * newReserve1;

      // k should increase or stay same (due to fees)
      expect(newK).toBeGreaterThanOrEqual(k);
    });
  });

  describe('Initial liquidity calculation', () => {
    it('calculates LP tokens as geometric mean', () => {
      const amount0 = 1000000n;
      const amount1 = 1000000n;
      const product = amount0 * amount1;
      const liquidity = sqrtFloorImpl(product);
      
      expect(liquidity).toBe(1000000n);
      
      // Verify minimum liquidity lock
      const minLiquidity = 1000n;
      const lpTokens = liquidity - minLiquidity;
      expect(lpTokens).toBe(999000n);
    });

    it('handles asymmetric initial liquidity', () => {
      const amount0 = 2000000n;
      const amount1 = 500000n;
      const product = amount0 * amount1;
      const liquidity = sqrtFloorImpl(product);
      
      expect(liquidity).toBe(1000000n);
    });
  });

  describe('Proportional liquidity addition', () => {
    it('calculates LP tokens proportionally', () => {
      const reserve0 = 1000000n;
      const reserve1 = 1000000n;
      const totalSupply = 999000n; // After initial liquidity lock
      
      const amount0 = 100000n; // 10% of reserve
      const lpTokens = divFloorImpl(amount0 * totalSupply, reserve0);
      
      expect(lpTokens).toBe(99900n); // 10% of supply
    });
  });

  describe('Price impact calculation', () => {
    it('calculates price impact for small trade', () => {
      const reserve0 = 1000000n;
      const reserve1 = 1000000n;
      const amountIn = 1000n; // 0.1% of pool
      const feeBps = 30n;

      const feeMultiplier = 10000n - feeBps;
      const amountInWithFee = amountIn * feeMultiplier;
      const numerator = amountInWithFee * reserve1;
      const denominator = (reserve0 * 10000n) + amountInWithFee;
      const amountOut = divFloorImpl(numerator, denominator);

      // Ideal output without slippage
      const idealOut = (amountIn * reserve1) / reserve0;
      
      // Price impact should be minimal for small trade
      const impact = ((idealOut - amountOut) * 10000n) / idealOut;
      expect(impact).toBeLessThan(50n); // Less than 0.5%
    });

    it('calculates higher price impact for large trade', () => {
      const reserve0 = 1000000n;
      const reserve1 = 1000000n;
      const amountIn = 100000n; // 10% of pool
      const feeBps = 30n;

      const feeMultiplier = 10000n - feeBps;
      const amountInWithFee = amountIn * feeMultiplier;
      const numerator = amountInWithFee * reserve1;
      const denominator = (reserve0 * 10000n) + amountInWithFee;
      const amountOut = divFloorImpl(numerator, denominator);

      // Ideal output without slippage
      const idealOut = (amountIn * reserve1) / reserve0;
      
      // Price impact should be significant for large trade
      const impact = ((idealOut - amountOut) * 10000n) / idealOut;
      expect(impact).toBeGreaterThan(500n); // Greater than 5%
    });
  });
});
