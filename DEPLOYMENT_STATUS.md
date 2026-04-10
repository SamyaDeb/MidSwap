# MidSwap Deployment Guide

## Current Status

The MidSwap project is now unblocked on contract compilation.

- Contract `packages/contracts/src/LiquidityPool.compact` compiles on Compact toolchain `0.30.0` (language `0.22.0`)
- Frontend and SDK builds are passing
- Deployment script is aligned with current Compact artifact layout

## What Changed

### 1) Contract logic rewritten for Compact 0.22 constraints

Compact 0.22 grammar does not include infix division/modulo operators for expressions. To preserve Uniswap-style AMM behavior, the contract now uses:

- witness-based floor division: `divFloor(numerator, denominator)`
- witness-based floor square root: `sqrtFloor(value)`
- on-chain constraint verification for both operations:
  - division: `q * d <= n` and `n - q * d < d`
  - sqrt: `r*r <= v` and `v - r*r < 2*r + 1`

This keeps real AMM math while remaining valid Compact syntax.

### 2) Uniswap-like real features retained

Implemented circuits:

- `initialize(amount0, amount1, depositor, fee): lpTokens`
- `addLiquidity(amount0, amount1, depositor): lpTokens`
- `removeLiquidity(lpAmount, withdrawer): [amount0, amount1]`
- `swap(amountIn, minOut, zeroForOne, trader): amountOut`
- `getReserves(): [reserve0, reserve1]`
- `getUserBalance(user): lpBalance`
- plus pricing helpers: `getAmountOut`, `getAmountIn`, `getFeeBps`, `isInitialized`

Behavior:

- constant-product invariant (`x * y = k`) enforcement
- configurable fee in basis points
- slippage check on swaps (`minOut`)
- LP mint/burn with proportional accounting
- private arithmetic witnesses with explicit disclosures and bounded proofs

### 3) Build and deployment tooling updated

- `packages/contracts/scripts/build.js`
  - now uses `compact compile <source> <target>`
  - checks for modern artifacts under `managed/LiquidityPool/`
- `packages/contracts/scripts/check-compiler.js`
  - checks for `compact` binary (not `compactc`)
- `packages/contracts/package.json`
  - `build:compile` updated to new CLI format
- `packages/contracts/scripts/deploy.ts`
  - artifact loading aligned to:
    - `managed/LiquidityPool/contract/index.js`
    - `managed/LiquidityPool/compiler/contract-info.json`

## Verification Results

Commands executed successfully:

```bash
pnpm --filter @midswap/contracts build
pnpm --filter @midswap/sdk build
pnpm --filter @midswap/web build
```

Contract compile output includes:

```bash
Compiling 10 circuits:
```

Compiled artifacts are present under:

- `packages/contracts/managed/LiquidityPool/contract/`
- `packages/contracts/managed/LiquidityPool/compiler/`
- `packages/contracts/managed/LiquidityPool/zkir/`
- `packages/contracts/managed/LiquidityPool/keys/`

## Important Notes

1. Contract uses witness circuits (`divFloor`, `sqrtFloor`) by design.
2. These witnesses are validated by strict on-chain constraints; they cannot return arbitrary values without failing assertions.
3. `Map<Bytes<32>, Uint<64>>` LP balances are mutable contract ledger state (not sealed), which is required by Compact rules for exported circuit updates.

## Deployment Steps (Preprod)

1. Start proof server

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
```

2. Build contracts

```bash
pnpm --filter @midswap/contracts build
```

3. Set deployer

```bash
export DEPLOYER_ADDRESS="mn_addr_preprod1..."
```

4. Deploy

```bash
pnpm --filter @midswap/contracts deploy
```

5. Update frontend env with deployed pool

```bash
VITE_POOL_TNIGHT_MUSDC=<deployed_pool_address>
```

## Remaining Work

1. Implement witness providers in TypeScript runtime path used for contract execution (`divFloor`, `sqrtFloor`).
2. Add contract-level integration tests for:
   - initialize
   - add/remove liquidity
   - swap exact in
   - quotes/invariant checks
3. Run real preprod deployment and wire resulting address into frontend.

## Summary

- Contract compilation blocker is resolved.
- AMM logic is production-oriented and real (no mock calculations in contract path).
- Project is ready for witness wiring, deployment execution, and test authoring.
