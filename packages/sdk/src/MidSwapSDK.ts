/**
 * MidSwapSDK - Main Entry Point
 * 
 * Privacy-preserving DEX SDK for Midnight blockchain
 */

import { WalletConnector } from './WalletConnector';
import { PoolManager } from './PoolManager';
import { SwapExecutor } from './SwapExecutor';
import { MEVAnalytics } from './MEVAnalytics';
import { logger } from './logger';
import type { 
  NetworkConfig, 
  SwapParams, 
  SwapResult, 
  SwapQuote,
  LiquidityParams,
  LiquidityResult,
  PoolInfo,
  WalletState,
  SDKEvent,
  SDKEventListener,
  OptimisticSwapResult,
} from './types';
import { PREPROD_CONFIG, MidSwapError, MidSwapErrorCode } from './types';

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

export class MidSwapSDK {
  // Public modules
  public readonly wallet: WalletConnector;
  public readonly pools: PoolManager;
  public readonly swaps: SwapExecutor;
  public readonly mev: MEVAnalytics;
  
  // Configuration
  private config: NetworkConfig;
  private eventListeners: Set<SDKEventListener> = new Set();

  constructor(config: Partial<NetworkConfig> = {}) {
    this.config = { ...PREPROD_CONFIG, ...config };
    
    // Initialize modules
    this.wallet = new WalletConnector(this.config);
    this.pools = new PoolManager(this.config);
    this.mev = new MEVAnalytics();
    this.swaps = new SwapExecutor(this.wallet, this.pools, this.config);

    // Subscribe to wallet changes
    this.wallet.subscribe((state) => {
      if (state.isConnected) {
        this.emit({ type: 'wallet_connected', address: state.address! });
      } else {
        this.emit({ type: 'wallet_disconnected' });
      }
    });
  }

  // ============================================
  // Wallet Methods
  // ============================================

  /**
   * Connect to wallet
   */
  async connect(): Promise<WalletState> {
    return this.wallet.connect();
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.wallet.disconnect();
  }

  /**
   * Check if wallet is connected
   */
  async isConnected(): Promise<boolean> {
    return this.wallet.isConnected();
  }

  /**
   * Get current wallet state
   */
  getWalletState(): WalletState {
    return this.wallet.getState();
  }

  /**
   * Subscribe to wallet state changes
   */
  onWalletChange(callback: (state: WalletState) => void): () => void {
    return this.wallet.subscribe(callback);
  }

  // ============================================
  // Pool Methods
  // ============================================

  /**
   * Get pool information
   */
  async getPool(address: string): Promise<PoolInfo | null> {
    return this.pools.getPool(address);
  }

  /**
   * Refresh pool data
   */
  async refreshPool(address: string): Promise<PoolInfo | null> {
    return this.pools.getPool(address, true);
  }

  /**
   * Read a user's token balance from the MidnightUSDC (or any compatible) contract state.
   *
   * The OptimalAMM is a state-tracking demo AMM — it does NOT do real token transfers.
   * mUSDC balances are tracked in the MidnightUSDC contract state (slot 1 = balances map),
   * NOT in Lace's getShieldedBalances() which only returns native shielded tokens.
   *
   * Returns the raw balance (0n if user has no balance or contract not found).
   */
  async getContractTokenBalance(tokenContractAddress: string): Promise<bigint> {
    let coinPubKeyBytes: Uint8Array;
    try {
      coinPubKeyBytes = await this.wallet.getIdentityBytes32();
    } catch {
      return 0n;
    }
    return this.pools.readContractTokenBalance(tokenContractAddress, coinPubKeyBytes);
  }

  /**
   * Get user's LP position for a pool.
   * Reads the LP balance from on-chain contract state using the user's coin public key,
   * which is accurate across page reloads. Falls back to localStorage if the key is unavailable.
   */
  async getUserPosition(poolAddress: string): Promise<{
    lpBalance: bigint;
    poolShare: number;
    token0Value: bigint;
    token1Value: bigint;
  } | null> {
    const walletState = this.wallet.getState();
    if (!walletState.isConnected || !walletState.address) {
      return null;
    }

    // Fetch coin public key bytes for on-chain LP balance lookup
    let coinPubKeyBytes: Uint8Array | undefined;
    try {
      coinPubKeyBytes = await this.wallet.getIdentityBytes32();
    } catch {
      // getIdentityBytes32 may fail before wallet is fully connected; localStorage fallback used
    }

    return this.pools.getUserPosition(poolAddress, walletState.address, coinPubKeyBytes);
  }

  // ============================================
  // Swap Methods
  // ============================================

  /**
   * Get swap quote
   */
  async getSwapQuote(
    poolAddress: string,
    amountIn: bigint,
    zeroForOne: boolean,
    slippageBps?: number
  ): Promise<SwapQuote> {
    return this.swaps.getQuote(poolAddress, amountIn, zeroForOne, slippageBps);
  }

  /**
   * Execute swap
   */
  async swap(params: SwapParams): Promise<SwapResult> {
    this.emit({ type: 'swap_initiated', params });
    
    try {
      const result = await this.swaps.executeSwap(params);
      this.emit({ type: 'swap_completed', result });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.emit({ type: 'swap_failed', error: message });
      throw error;
    }
  }

  /**
   * Convenience method for swapping with calculated parameters
   */
  async swapExactInput(
    poolAddress: string,
    amountIn: bigint,
    zeroForOne: boolean,
    slippageBps: number = 50,
    deadlineMinutes: number = 20
  ): Promise<SwapResult> {
    // Get quote
    const quote = await this.getSwapQuote(poolAddress, amountIn, zeroForOne, slippageBps);
    
    // Build params
    const params: SwapParams = {
      poolAddress,
      amountIn,
      amountOutMin: quote.minimumReceived,
      zeroForOne,
      deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60
    };

    return this.swap(params);
  }

  /**
   * Optimistic swap: returns immediately (~1-2s) with the expected output,
   * while ZK proof generation + submission happens in the background.
   *
   * This is the recommended swap method for UI flows where perceived latency
   * matters. The returned object includes:
   *   - `expectedAmountOut` — local AMM calculation
   *   - `onStatusChange(cb)` — subscribe to proof progress
   *   - `confirmation` — Promise that resolves with the final SwapResult
   *
   * Prerequisites: call `getSwapQuote()` first so the pool cache is warm.
   */
  swapOptimistic(params: SwapParams): OptimisticSwapResult {
    this.emit({ type: 'swap_initiated', params });

    const optimistic = this.swaps.executeSwapOptimistic(params);

    // Emit the optimistic result event
    this.emit({ type: 'swap_optimistic', result: optimistic });

    // Wire up status events
    optimistic.onStatusChange((status, detail) => {
      switch (status) {
        case 'proving':
          this.emit({ type: 'swap_proving', pendingId: optimistic.pendingId });
          break;
        case 'confirming':
          if (detail) {
            this.emit({ type: 'swap_submitted', pendingId: optimistic.pendingId, txHash: detail });
          }
          break;
        case 'confirmed':
          // The confirmation promise resolves separately; the swap_completed event
          // is emitted when we get the full result below.
          break;
        case 'failed':
          this.emit({ type: 'swap_failed', error: detail || 'Unknown error', pendingId: optimistic.pendingId });
          break;
      }
    });

    // When the background confirmation resolves, emit swap_completed
    optimistic.confirmation.then(
      (result) => {
        this.emit({ type: 'swap_completed', result, pendingId: optimistic.pendingId });
      },
      (error: unknown) => {
        // swap_failed was already emitted via onStatusChange
        logger.error('Optimistic swap confirmation failed:', error);
      },
    );

    return optimistic;
  }

  // ============================================
  // Liquidity Methods
  // ============================================

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(params: LiquidityParams): Promise<LiquidityResult> {
    // Validate deadline
    const now = Math.floor(Date.now() / 1000);
    if (now > params.deadline) {
      throw new MidSwapError(
        'Transaction deadline exceeded',
        MidSwapErrorCode.DEADLINE_EXCEEDED
      );
    }

    // Get pool
    const pool = await this.pools.getPool(params.poolAddress);
    if (!pool) {
      throw new MidSwapError(
        'Pool not found',
        MidSwapErrorCode.POOL_NOT_FOUND
      );
    }

    // Calculate exact proportional amounts so that the on-chain assertion
    //   amount0 * reserve1 == amount1 * reserve0
    // holds exactly in integer arithmetic.
    //
    // The valid deposit pairs are integer multiples of the reduced reserve
    // ratio: (reserve0 / gcd(reserve0, reserve1), reserve1 / gcd(reserve0, reserve1)).
    // We therefore choose the largest whole multiple that fits inside both
    // desired amounts.
    let amount0: bigint;
    let amount1: bigint;

    if (pool.reserve0 === 0n && pool.reserve1 === 0n) {
      // First deposit — any ratio is acceptable; use desired amounts directly.
      amount0 = params.amount0Desired;
      amount1 = params.amount1Desired;
    } else {
      const ratioGcd = gcd(pool.reserve0, pool.reserve1);
      const unit0 = pool.reserve0 / ratioGcd;
      const unit1 = pool.reserve1 / ratioGcd;

      const maxMultiplierFrom0 = params.amount0Desired / unit0;
      const maxMultiplierFrom1 = params.amount1Desired / unit1;
      const multiplier = maxMultiplierFrom0 < maxMultiplierFrom1
        ? maxMultiplierFrom0
        : maxMultiplierFrom1;

      if (multiplier <= 0n) {
        throw new MidSwapError(
          `Amounts too small for the current pool ratio. Minimum exact deposit step is ${unit0} token0 and ${unit1} token1.`,
          MidSwapErrorCode.INVALID_AMOUNT,
        );
      }

      amount0 = unit0 * multiplier;
      amount1 = unit1 * multiplier;

      if (amount0 < params.amount0Min || amount1 < params.amount1Min) {
        throw new MidSwapError(
          'Calculated exact proportional amounts below minimums',
          MidSwapErrorCode.SLIPPAGE_EXCEEDED,
        );
      }
    }

    // Invariant guard: verify the cross-multiplication holds exactly before
    // sending to the circuit, which enforces the same condition.
    if (pool.reserve0 !== 0n && pool.reserve1 !== 0n) {
      if (amount0 * pool.reserve1 !== amount1 * pool.reserve0) {
        throw new MidSwapError(
          `addLiquidity invariant violated: amount0 * reserve1 (${amount0 * pool.reserve1}) ` +
          `!= amount1 * reserve0 (${amount1 * pool.reserve0})`,
          MidSwapErrorCode.INVALID_AMOUNT
        );
      }
    }

    // Get user identity bytes for the circuit call
    const userIdentity = await this.wallet.getIdentityBytes32();

    // Execute addLiquidity circuit via real ZK proving flow
    const txHash = await this.swaps.executeAddLiquidity(
      params.poolAddress,
      amount0,
      amount1,
      userIdentity,
    );

    // Calculate LP tokens (estimate)
    const lpTokens = this.pools.calculateLPTokens(
      amount0,
      amount1,
      pool.reserve0,
      pool.reserve1,
      pool.totalSupply
    );

    // Calculate pool share
    const poolShare = Number(lpTokens) / Number(pool.totalSupply + lpTokens);

    // Persist minted LP tokens to localStorage so getUserPosition can read them
    try {
      const walletState = this.wallet.getState();
      if (walletState.isConnected && walletState.address) {
        const storageKey = `midswap_lp_${params.poolAddress}_${walletState.address}`;
        const existing = localStorage.getItem(storageKey);
        const prev = existing ? BigInt(existing) : 0n;
        localStorage.setItem(storageKey, (prev + lpTokens).toString());
      }
    } catch {
      // localStorage unavailable — non-fatal
    }

    // Invalidate cache
    this.pools.invalidateCache(params.poolAddress);

    const result: LiquidityResult = {
      txHash,
      lpTokens,
      amount0Used: amount0,
      amount1Used: amount1,
      poolShare
    };

    this.emit({ type: 'liquidity_added', result });

    return result;
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(
    poolAddress: string,
    lpAmount: bigint,
    amount0Min: bigint,
    amount1Min: bigint,
    deadlineMinutes: number = 20
  ): Promise<LiquidityResult> {
    if (!Number.isFinite(deadlineMinutes) || deadlineMinutes <= 0) {
      throw new MidSwapError(
        'Transaction deadline exceeded',
        MidSwapErrorCode.DEADLINE_EXCEEDED
      );
    }

    const deadline = Math.floor(Date.now() / 1000) + Math.floor(deadlineMinutes * 60);

    // Get pool
    const pool = await this.pools.getPool(poolAddress);
    if (!pool) {
      throw new MidSwapError(
        'Pool not found',
        MidSwapErrorCode.POOL_NOT_FOUND
      );
    }

    // Calculate expected amounts
    const { amount0, amount1 } = this.pools.calculateRemoveLiquidity(
      lpAmount,
      pool.reserve0,
      pool.reserve1,
      pool.totalSupply
    );

    // Verify minimums
    if (amount0 < amount0Min || amount1 < amount1Min) {
      throw new MidSwapError(
        'Output amounts below minimum',
        MidSwapErrorCode.SLIPPAGE_EXCEEDED
      );
    }

    if (Math.floor(Date.now() / 1000) > deadline) {
      throw new MidSwapError(
        'Transaction deadline exceeded',
        MidSwapErrorCode.DEADLINE_EXCEEDED
      );
    }

    // Get user identity bytes for the circuit call
    const userIdentity = await this.wallet.getIdentityBytes32();

    if (Math.floor(Date.now() / 1000) > deadline) {
      throw new MidSwapError(
        'Transaction deadline exceeded',
        MidSwapErrorCode.DEADLINE_EXCEEDED
      );
    }

    // Execute removeLiquidity circuit via real ZK proving flow
    const txHash = await this.swaps.executeRemoveLiquidity(
      poolAddress,
      lpAmount,
      userIdentity,
    );

    // Invalidate cache
    this.pools.invalidateCache(poolAddress);

    // Subtract burned LP tokens from localStorage
    try {
      const walletState = this.wallet.getState();
      if (walletState.isConnected && walletState.address) {
        const storageKey = `midswap_lp_${poolAddress}_${walletState.address}`;
        const existing = localStorage.getItem(storageKey);
        const prev = existing ? BigInt(existing) : 0n;
        const updated = prev > lpAmount ? prev - lpAmount : 0n;
        localStorage.setItem(storageKey, updated.toString());
      }
    } catch {
      // localStorage unavailable — non-fatal
    }

    const result: LiquidityResult = {
      txHash,
      lpTokens: lpAmount,
      amount0Used: amount0,
      amount1Used: amount1,
      poolShare: 0 // After removal
    };

    this.emit({ type: 'liquidity_removed', result });

    return result;
  }

  // ============================================
  // MEV Analytics
  // ============================================

  /**
   * Get estimated MEV savings for a potential trade
   */
  estimateMEVSavings(
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ) {
    return this.mev.estimateMEVSavings(amountIn, amountOut, reserveIn, reserveOut);
  }

  /**
   * Get Ethereum MEV statistics
   */
  async getEthereumMEVStats() {
    return this.mev.getEthereumMEVStats();
  }

  // ============================================
  // Event System
  // ============================================

  /**
   * Subscribe to SDK events
   */
  on(listener: SDKEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(event: SDKEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Event listener error:', error);
      }
    });
  }

  // ============================================
  // Configuration
  // ============================================

  /**
   * Get current network configuration
   */
  getConfig(): NetworkConfig {
    return { ...this.config };
  }

  /**
   * Get network name
   */
  getNetwork(): 'preprod' | 'mainnet' {
    return this.config.network;
  }

  // ============================================
  // Health Check
  // ============================================

  /**
   * Check if all services are healthy
   */
  async healthCheck(): Promise<{
    wallet: boolean;
    indexer: boolean;
    proofServer: boolean;
  }> {
    const results = {
      wallet: false,
      indexer: false,
      proofServer: false
    };

    // Check wallet
    results.wallet = this.wallet.isWalletInstalled();

    // Check indexer
    try {
      const response = await fetch(this.config.indexerGraphQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' })
      });
      results.indexer = response.ok;
    } catch {
      results.indexer = false;
    }

    // Check proof server
    try {
      const response = await fetch(`${this.config.proofServer}/health`);
      const data = await response.json() as { status: string };
      results.proofServer = data.status === 'ok';
    } catch {
      results.proofServer = false;
    }

    return results;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new MidSwap SDK instance
 */
export function createMidSwapSDK(config?: Partial<NetworkConfig>): MidSwapSDK {
  return new MidSwapSDK(config);
}

// ============================================
// Default Instance (lazy singleton)
// ============================================

/**
 * Lazy default SDK instance.
 * Constructed on first access to avoid module-load-time side effects
 * (WASM imports, wallet API probing) that crash Vite/browser environments.
 */
let _defaultInstance: MidSwapSDK | null = null;

export const midswap: MidSwapSDK = new Proxy({} as MidSwapSDK, {
  get(_target, prop) {
    if (!_defaultInstance) {
      _defaultInstance = new MidSwapSDK();
    }
    const val = (_defaultInstance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? val.bind(_defaultInstance) : val;
  }
});
