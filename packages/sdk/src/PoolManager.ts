/**
 * PoolManager - Handles liquidity pool queries and calculations
 *
 * Uses the real Midnight indexer GraphQL schema:
 *   contractAction(address: HexEncoded!) { state, transaction { hash, block { height } } }
 *
 * The `state` field is a raw hex-encoded ledger blob.
 * We decode it by reading state slots directly via compact-runtime's queryLedgerState,
 * because the compiled contract's ledger() function returns {} (no field accessors generated).
 *
 * State slot layout (from compiled contract):
 *   slot 0 = reserve0      (uint64)
 *   slot 1 = reserve1      (uint64)
 *   slot 2 = totalLPSupply (uint64)
 *   slot 4 = initialized   (bool)
 *   slot 5 = feeBps        (uint16)
 */

import type { NetworkConfig, PoolInfo, PoolReserves, TokenInfo } from './types';
import { MidSwapError, MidSwapErrorCode, SUPPORTED_TOKENS } from './types';
import { logger } from './logger';

// ---- Lazy-loaded compact-runtime (dynamic import to avoid WASM crash at module init) ----
let _compactRuntime: any = null;
async function getCompactRuntime(): Promise<any> {
  if (!_compactRuntime) {
    _compactRuntime = await import('@midnight-ntwrk/compact-runtime');
  }
  return _compactRuntime;
}

// Runtime pool state shape
interface RuntimeLedger {
  reserve0: bigint;
  reserve1: bigint;
  totalLPSupply: bigint;
  feeBps: bigint;
  initialized: boolean;
  lpBalances?: unknown;
}

interface PoolTokenConfig {
  token0: TokenInfo;
  token1: TokenInfo;
}

const POOL_TOKEN_REGISTRY: Map<string, PoolTokenConfig> = new Map();

// GraphQL response types
interface ContractActionResponse {
  data?: {
    contractAction?: {
      state: string;            // hex-encoded ledger state blob
      zswapState?: string;
      address?: string;
      transaction?: {
        hash: string;
        block?: { height: number };
      };
      unshieldedBalances?: unknown;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export class PoolManager {
  private config: NetworkConfig;
  private poolCache: Map<string, { pool: PoolInfo; timestamp: number }> = new Map();
  private tokenConfigCache: Map<string, PoolTokenConfig> = new Map();
  private readonly CACHE_TTL = 30_000; // 30 s

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  // ============================================
  // Token Registry
  // ============================================

  registerPoolTokens(poolAddress: string, token0: TokenInfo, token1: TokenInfo): void {
    POOL_TOKEN_REGISTRY.set(poolAddress, { token0, token1 });
    this.tokenConfigCache.set(poolAddress, { token0, token1 });
  }

  async getPoolTokens(poolAddress: string): Promise<PoolTokenConfig> {
    const cached = this.tokenConfigCache.get(poolAddress);
    if (cached) return cached;

    const registered = POOL_TOKEN_REGISTRY.get(poolAddress);
    if (registered) {
      this.tokenConfigCache.set(poolAddress, registered);
      return registered;
    }

    // Fallback to default tNight/mUSDC pair
    logger.debug('Using default token config for pool:', poolAddress);
    const defaultConfig: PoolTokenConfig = {
      token0: SUPPORTED_TOKENS.tNight,
      token1: SUPPORTED_TOKENS.mUSDC,
    };
    this.tokenConfigCache.set(poolAddress, defaultConfig);
    return defaultConfig;
  }

  // ============================================
  // Pool Queries — real indexer schema
  // ============================================

  /**
   * Fetch pool info from the Midnight indexer.
   *
   * Real schema:
   *   contractAction(address: HexEncoded!) { state, transaction { hash, block { height } } }
   *
   * `state` is a hex blob; decoded with `ledger(hexBlob)` at runtime.
   */
  async getPool(poolAddress: string, forceRefresh = false): Promise<PoolInfo | null> {
    if (!forceRefresh) {
      const cached = this.poolCache.get(poolAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.pool;
      }
    }

    try {
      const tokenConfig = await this.getPoolTokens(poolAddress);
      const raw = await this.fetchContractAction(poolAddress);
      if (!raw) return null;

      const ledgerState = await this.decodeLedgerState(raw.state);
      if (!ledgerState) return null;

      const reserve0 = ledgerState.reserve0;
      const reserve1 = ledgerState.reserve1;

      const poolInfo: PoolInfo = {
        address: poolAddress,
        token0: tokenConfig.token0,
        token1: tokenConfig.token1,
        reserve0,
        reserve1,
        totalSupply: ledgerState.totalLPSupply,
        feeBps: Number(ledgerState.feeBps),
        initialized: ledgerState.initialized,
        price: this.calculatePrice(
          reserve0,
          reserve1,
          tokenConfig.token0.decimals,
          tokenConfig.token1.decimals,
        ),
      };

      this.poolCache.set(poolAddress, { pool: poolInfo, timestamp: Date.now() });
      return poolInfo;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch pool:', message);
      throw new MidSwapError(
        `Failed to fetch pool: ${message}`,
        MidSwapErrorCode.INDEXER_ERROR,
        { originalError: error },
      );
    }
  }

  /**
   * Get pool reserves with block info.
   */
  async getReserves(poolAddress: string): Promise<PoolReserves> {
    try {
      const raw = await this.fetchContractAction(poolAddress);
      if (!raw) {
        throw new MidSwapError('Pool not found', MidSwapErrorCode.POOL_NOT_FOUND, { poolAddress });
      }

      const ledgerState = await this.decodeLedgerState(raw.state);
      if (!ledgerState) {
        throw new MidSwapError('Pool not found', MidSwapErrorCode.POOL_NOT_FOUND, { poolAddress });
      }

      const blockNumber = raw.transaction?.block?.height ?? 0;

      return {
        reserve0: ledgerState.reserve0,
        reserve1: ledgerState.reserve1,
        blockNumber,
        timestamp: Date.now(),
      };
    } catch (error) {
      if (error instanceof MidSwapError) throw error;
      throw new MidSwapError(
        'Failed to fetch reserves',
        MidSwapErrorCode.INDEXER_ERROR,
        { originalError: error },
      );
    }
  }

  // ============================================
  // User LP Position
  // ============================================

  /**
   * Fetch user's LP position.
   *
   * If `coinPubKeyBytes` (32-byte Uint8Array of the user's shielded coin public key) is provided,
   * the LP balance is read directly from the on-chain contract state (slot 6 lpBalances map).
   * Otherwise, falls back to a localStorage cache keyed by `userAddress`.
   *
   * On-chain reading is authoritative and persists across page reloads, while the localStorage
   * fallback is only accurate within the same browser session.
   */
  async getUserPosition(
    poolAddress: string,
    userAddress: string,
    coinPubKeyBytes?: Uint8Array,
  ): Promise<{
    lpBalance: bigint;
    poolShare: number;
    token0Value: bigint;
    token1Value: bigint;
  } | null> {
    try {
      const raw = await this.fetchContractAction(poolAddress);
      if (!raw) return null;

      const ledgerState = await this.decodeLedgerState(raw.state);
      if (!ledgerState) return null;

      let lpBalance = 0n;

      if (coinPubKeyBytes && coinPubKeyBytes.length === 32) {
        // Read LP balance from on-chain contract state (slot 6 = lpBalances map)
        const onChainBalance = await this.readLPBalance(raw.state, coinPubKeyBytes);
        if (onChainBalance !== null) {
          lpBalance = onChainBalance;
          // Keep localStorage in sync for quick subsequent reads
          try {
            if (typeof localStorage !== 'undefined') {
              const storageKey = `midswap_lp_${poolAddress}_${userAddress}`;
              localStorage.setItem(storageKey, lpBalance.toString());
            }
          } catch { /* ignore */ }
        }
      } else {
        // Fallback: read LP balance from localStorage (within-session tracking only)
        try {
          const storageKey = `midswap_lp_${poolAddress}_${userAddress}`;
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
          if (stored) lpBalance = BigInt(stored);
        } catch {
          // localStorage unavailable (e.g. Node.js environment)
        }
      }

      const totalSupply = ledgerState.totalLPSupply;
      if (totalSupply === 0n || lpBalance === 0n) {
        return {
          lpBalance,
          poolShare: 0,
          token0Value: 0n,
          token1Value: 0n,
        };
      }

      const token0Value = (lpBalance * ledgerState.reserve0) / totalSupply;
      const token1Value = (lpBalance * ledgerState.reserve1) / totalSupply;
      const poolShare = Number(lpBalance) / Number(totalSupply);

      return {
        lpBalance,
        poolShare,
        token0Value,
        token1Value,
      };
    } catch {
      return null;
    }
  }

  /**
   * Read a user's LP balance directly from the on-chain contract state.
   * Queries slot 6 (lpBalances map) using the user's coin public key bytes as the map key.
   * Returns 0n if the user has no LP position.
   */
  private async readLPBalance(stateHex: string, coinPubKeyBytes: Uint8Array): Promise<bigint | null> {
    try {
      const cr = await getCompactRuntime();

      const bytes = Uint8Array.from(
        stateHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
      );

      const cs = cr.ContractState.deserialize(bytes);
      const chargedState = cs.data;

      const context = {
        currentQueryContext: new cr.QueryContext(chargedState, cr.dummyContractAddress()),
        costModel: cr.CostModel.initialCostModel(),
      };
      const partialProofData = {
        input: { value: [], alignment: [] },
        output: undefined,
        publicTranscript: [],
        privateTranscriptOutputs: [],
      };

      const u8    = new cr.CompactTypeUnsignedInteger(255n, 1);
      const u64   = new cr.CompactTypeUnsignedInteger(18446744073709551615n, 8);
      const bytes32 = new cr.CompactTypeBytes(32);

      // Navigate to slot 6 (lpBalances map) then index by user's coin public key bytes.
      // Returns 0 if the key is absent (map default for Uint<64>).
      const lpBalance = u64.fromValue(
        cr.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          { idx: { cached: false, pushPath: false, path: [
            { tag: 'value', value: { value: u8.toValue(6n), alignment: u8.alignment() } },
          ]}},
          { idx: { cached: false, pushPath: false, path: [
            { tag: 'value', value: { value: bytes32.toValue(coinPubKeyBytes), alignment: bytes32.alignment() } },
          ]}},
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );

      return lpBalance as bigint;
    } catch (err) {
      logger.debug('readLPBalance failed (user may have no position):', err);
      return null;
    }
  }

  // ============================================
  // AMM Calculations (pure math, no network calls)
  // ============================================

  getAmountOut(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    feeBps: number,
  ): bigint {
    if (amountIn <= 0n) throw new MidSwapError('Invalid input amount', MidSwapErrorCode.INVALID_AMOUNT);
    if (reserveIn <= 0n || reserveOut <= 0n)
      throw new MidSwapError('Insufficient liquidity', MidSwapErrorCode.INSUFFICIENT_LIQUIDITY);

    const feeMultiplier = 10_000n - BigInt(feeBps);
    const amountInWithFee = amountIn * feeMultiplier;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10_000n + amountInWithFee;
    return numerator / denominator;
  }

  getAmountIn(
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    feeBps: number,
  ): bigint {
    if (amountOut <= 0n) throw new MidSwapError('Invalid output amount', MidSwapErrorCode.INVALID_AMOUNT);
    if (reserveIn <= 0n || reserveOut <= 0n)
      throw new MidSwapError('Insufficient liquidity', MidSwapErrorCode.INSUFFICIENT_LIQUIDITY);
    if (amountOut >= reserveOut)
      throw new MidSwapError('Insufficient liquidity for desired output', MidSwapErrorCode.INSUFFICIENT_LIQUIDITY);

    const feeMultiplier = 10_000n - BigInt(feeBps);
    const numerator = reserveIn * amountOut * 10_000n;
    const denominator = (reserveOut - amountOut) * feeMultiplier;
    return numerator / denominator + 1n;
  }

  getPriceImpact(
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
  ): number {
    if (reserveIn === 0n) return 0;
    const idealOut = (amountIn * reserveOut) / reserveIn;
    if (idealOut <= amountOut) return 0;
    return Number(((idealOut - amountOut) * 10_000n) / idealOut);
  }

  calculatePrice(
    reserve0: bigint,
    reserve1: bigint,
    decimals0: number,
    decimals1: number,
  ): number {
    if (reserve0 === 0n) return 0;
    return (Number(reserve1) / 10 ** decimals1) / (Number(reserve0) / 10 ** decimals0);
  }

  getOptimalLiquidityAmounts(
    amount0Desired: bigint,
    amount1Desired: bigint,
    reserve0: bigint,
    reserve1: bigint,
  ): { amount0: bigint; amount1: bigint } {
    if (reserve0 === 0n && reserve1 === 0n) {
      return { amount0: amount0Desired, amount1: amount1Desired };
    }
    const amount1Optimal = this.quote(amount0Desired, reserve0, reserve1);
    if (amount1Optimal <= amount1Desired) {
      return { amount0: amount0Desired, amount1: amount1Optimal };
    }
    const amount0Optimal = this.quote(amount1Desired, reserve1, reserve0);
    return { amount0: amount0Optimal, amount1: amount1Desired };
  }

  quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
    if (amountA <= 0n) throw new MidSwapError('Insufficient amount', MidSwapErrorCode.INVALID_AMOUNT);
    if (reserveA <= 0n || reserveB <= 0n)
      throw new MidSwapError('Insufficient liquidity', MidSwapErrorCode.INSUFFICIENT_LIQUIDITY);
    return (amountA * reserveB) / reserveA;
  }

  calculateLPTokens(
    amount0: bigint,
    amount1: bigint,
    reserve0: bigint,
    reserve1: bigint,
    totalSupply: bigint,
  ): bigint {
    if (totalSupply === 0n) return this.sqrt(amount0 * amount1);
    const lp0 = (amount0 * totalSupply) / reserve0;
    const lp1 = (amount1 * totalSupply) / reserve1;
    return lp0 < lp1 ? lp0 : lp1;
  }

  calculateRemoveLiquidity(
    lpAmount: bigint,
    reserve0: bigint,
    reserve1: bigint,
    totalSupply: bigint,
  ): { amount0: bigint; amount1: bigint } {
    if (totalSupply === 0n) return { amount0: 0n, amount1: 0n };
    return {
      amount0: (lpAmount * reserve0) / totalSupply,
      amount1: (lpAmount * reserve1) / totalSupply,
    };
  }

  // ============================================
  // Cache Management
  // ============================================

  /**
   * Return the cached pool synchronously, or null if not cached / expired.
   * Used by the optimistic swap path to avoid async network calls.
   */
  getCachedPool(poolAddress: string): PoolInfo | null {
    const cached = this.poolCache.get(poolAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.pool;
    }
    return null;
  }

  invalidateCache(poolAddress: string): void {
    this.poolCache.delete(poolAddress);
  }

  clearCache(): void {
    this.poolCache.clear();
  }

  // ============================================
  // Private Helpers
  // ============================================

  /** Fetch the raw contractAction response from the indexer */
  private async fetchContractAction(poolAddress: string) {
    const response = await fetch(this.config.indexerGraphQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetContractAction($address: HexEncoded!) {
            contractAction(address: $address) {
              state
              address
              transaction {
                hash
                block { height }
              }
            }
          }
        `,
        variables: { address: poolAddress },
      }),
    });

    const result = await response.json() as ContractActionResponse;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.contractAction ?? null;
  }

  /** Decode the hex state blob by reading state slots via compact-runtime queryLedgerState */
  private async decodeLedgerState(stateHex: string): Promise<RuntimeLedger | null> {
    try {
      const cr = await getCompactRuntime();

      // Parse hex → bytes
      const bytes = Uint8Array.from(
        stateHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
      );

      // Reconstruct ContractState → ChargedState
      const cs = cr.ContractState.deserialize(bytes);
      const chargedState = cs.data;

      // Build query context
      const context = {
        currentQueryContext: new cr.QueryContext(chargedState, cr.dummyContractAddress()),
        costModel: cr.CostModel.initialCostModel(),
      };
      const partialProofData = {
        input: { value: [], alignment: [] },
        output: undefined,
        publicTranscript: [],
        privateTranscriptOutputs: [],
      };

      const u64  = new cr.CompactTypeUnsignedInteger(18446744073709551615n, 8);
      const bool = cr.CompactTypeBoolean;
      const u16  = new cr.CompactTypeUnsignedInteger(65535n, 2);
      const u8   = new cr.CompactTypeUnsignedInteger(255n, 1);

      const readSlot = (slotIdx: number, descriptor: any): any =>
        descriptor.fromValue(
          cr.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            { idx: { cached: false, pushPath: false, path: [
              { tag: 'value', value: { value: u8.toValue(BigInt(slotIdx)), alignment: u8.alignment() } },
            ]}},
            { popeq: { cached: false, result: undefined } },
          ]).value
        );

      return {
        reserve0:      readSlot(0, u64),
        reserve1:      readSlot(1, u64),
        totalLPSupply: readSlot(2, u64),
        initialized:   readSlot(4, bool),
        feeBps:        readSlot(5, u16),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to decode ledger state:', msg);
      throw new Error(`Failed to decode ledger state: ${msg}`);
    }
  }

  /**
   * Read a user's token balance from a Compact contract that stores balances in a
   * Map<Bytes<32>, Uint<64>> at slot 1 (e.g. MidnightUSDC).
   *
   * MidnightUSDC state layout (from managed/MidnightUSDC/contract/index.js initialState):
   *   slot 1 = balances  Map<Bytes<32>, Uint<64>>   (user coin public key → balance)
   *   slot 2 = initialized  bool
   *   slot 3 = totalSupply  uint64
   *
   * NOTE: This is NOT a native Lace shielded token — it lives in the contract state.
   * getShieldedBalances() from Lace will never return it.
   */
  async readContractTokenBalance(
    tokenContractAddress: string,
    coinPubKeyBytes: Uint8Array,
  ): Promise<bigint> {
    try {
      const raw = await this.fetchContractAction(tokenContractAddress);
      if (!raw) return 0n;

      const cr = await getCompactRuntime();

      const bytes = Uint8Array.from(
        raw.state.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)),
      );

      const cs = cr.ContractState.deserialize(bytes);
      const chargedState = cs.data;

      const context = {
        currentQueryContext: new cr.QueryContext(chargedState, cr.dummyContractAddress()),
        costModel: cr.CostModel.initialCostModel(),
      };
      const partialProofData = {
        input: { value: [], alignment: [] },
        output: undefined,
        publicTranscript: [],
        privateTranscriptOutputs: [],
      };

      const u8     = new cr.CompactTypeUnsignedInteger(255n, 1);
      const u64    = new cr.CompactTypeUnsignedInteger(18446744073709551615n, 8);
      const bytes32 = new cr.CompactTypeBytes(32);

      // Navigate: slot 1 (balances map) → index by coinPubKeyBytes
      const balance = u64.fromValue(
        cr.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          { idx: { cached: false, pushPath: false, path: [
            { tag: 'value', value: { value: u8.toValue(1n), alignment: u8.alignment() } },
          ]}},
          { idx: { cached: false, pushPath: false, path: [
            { tag: 'value', value: { value: bytes32.toValue(coinPubKeyBytes), alignment: bytes32.alignment() } },
          ]}},
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );

      return balance as bigint;
    } catch (err) {
      logger.debug('readContractTokenBalance failed:', err);
      return 0n;
    }
  }

  private sqrt(value: bigint): bigint {
    if (value < 0n) throw new Error('Square root of negative number');
    if (value < 2n) return value;
    let x = value;
    let y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (value / y + y) / 2n; }
    return x;
  }
}
