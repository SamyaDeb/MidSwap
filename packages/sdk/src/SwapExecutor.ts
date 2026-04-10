/**
 * SwapExecutor - Handles swap transaction execution
 *
 * Uses the real Midnight DApp Connector flow:
 *   findDeployedContract → callTx.addLiquidity/swap → httpClientProofProvider
 *   → balanceUnsealedTransaction → submitTransaction
 */

import { WalletConnector } from './WalletConnector';
import { PoolManager } from './PoolManager';
import { MEVAnalytics } from './MEVAnalytics';
import type {
  SwapParams,
  SwapResult,
  SwapQuote,
  NetworkConfig,
  OptimisticSwapResult,
  PendingSwapStatus,
  PendingSwapStatusListener,
} from './types';
import { MidSwapError, MidSwapErrorCode } from './types';
import { logger } from './logger';

// ---- Lazy-loaded WASM/contract modules (dynamic imports to avoid crash at module init) ----
let _contractModule: any = null;
let _witnessesModule: any = null;
let _sdkModules: {
  findDeployedContract: any;
  httpClientProofProvider: any;
  httpClientProvingProvider: any;
  setNetworkId: any;
  ZKConfigProvider: any;
  CompiledContract: any;
  ContractExecutable: any;
  indexerPublicDataProvider: any;
} | null = null;

async function getContractModule() {
  if (!_contractModule) {
    // @ts-ignore – path alias handled by Vite / tsconfig paths
    _contractModule = await import('../../contracts/managed/OptimalAMM/contract/index.js');
  }
  return _contractModule;
}

async function getWitnessesModule() {
  if (!_witnessesModule) {
    // @ts-ignore
    _witnessesModule = await import('../../contracts/src/witnesses');
  }
  return _witnessesModule;
}

async function getSDKModules() {
  if (!_sdkModules) {
    const [contracts, proofProvider, networkId, jsTypes, compactJs, indexerProvider] =
      await Promise.all([
        // @ts-ignore - dynamic imports, types resolved at runtime
        import('@midnight-ntwrk/midnight-js-contracts'),
        // @ts-ignore
        import('@midnight-ntwrk/midnight-js-http-client-proof-provider'),
        // @ts-ignore
        import('@midnight-ntwrk/midnight-js-network-id'),
        // @ts-ignore
        import('@midnight-ntwrk/midnight-js-types'),
        // @ts-ignore
        import('@midnight-ntwrk/compact-js'),
        // @ts-ignore
        import('@midnight-ntwrk/midnight-js-indexer-public-data-provider'),
      ]);
    _sdkModules = {
      findDeployedContract: (contracts as any).findDeployedContract,
      httpClientProofProvider: (proofProvider as any).httpClientProofProvider,
      httpClientProvingProvider: (proofProvider as any).httpClientProvingProvider,
      setNetworkId: (networkId as any).setNetworkId,
      ZKConfigProvider: (jsTypes as any).ZKConfigProvider,
      CompiledContract: (compactJs as any).CompiledContract,
      ContractExecutable: (compactJs as any).ContractExecutable,
      indexerPublicDataProvider: (indexerProvider as any).indexerPublicDataProvider,
    };
  }
  return _sdkModules;
}

// -------------------------------------------------------
// Browser-compatible ZK Config Provider
// Fetches .bzkir, .prover, .verifier from the static /zk/ path
// served by vite-plugin-static-copy in dev and prod.
// Compatible with httpClientProofProvider/httpClientProvingProvider.
// -------------------------------------------------------

function createBrowserZkConfigProvider(zkBaseUrl: string) {
  const cache = new Map<string, Uint8Array>();

  async function fetchBytes(url: string): Promise<Uint8Array> {
    const cached = cache.get(url);
    if (cached) return cached;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch ZK asset at ${url}: ${resp.status} ${resp.statusText}`);
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    cache.set(url, bytes);
    return bytes;
  }

  // Implements the same interface as ZKConfigProvider / NodeZkConfigProvider
  return {
    getZKIR(circuitId: string): Promise<Uint8Array> {
      // MUST use .bzkir (binary ZKIR) — proof server rejects .zkir (text format) with 400
      return fetchBytes(`${zkBaseUrl}/zkir/${circuitId}.bzkir`);
    },
    getProverKey(circuitId: string): Promise<Uint8Array> {
      return fetchBytes(`${zkBaseUrl}/keys/${circuitId}.prover`);
    },
    getVerifierKey(circuitId: string): Promise<Uint8Array> {
      return fetchBytes(`${zkBaseUrl}/keys/${circuitId}.verifier`);
    },
    // get() is called by httpClientProvingProvider via zkConfigToProvingKeyMaterial
    async get(circuitId: string) {
      const [proverKey, verifierKey, zkir] = await Promise.all([
        fetchBytes(`${zkBaseUrl}/keys/${circuitId}.prover`),
        fetchBytes(`${zkBaseUrl}/keys/${circuitId}.verifier`),
        fetchBytes(`${zkBaseUrl}/zkir/${circuitId}.bzkir`),
      ]);
      return { circuitId, proverKey, verifierKey, zkir };
    },
    // getVerifierKeys() is called by findDeployedContract for contract state verification
    async getVerifierKeys(circuitIds: string[]) {
      return Promise.all(
        circuitIds.map(async (id: string) => {
          const key = await fetchBytes(`${zkBaseUrl}/keys/${id}.verifier`);
          return [id, key] as [string, Uint8Array];
        }),
      );
    },
  };
}

// -------------------------------------------------------
// Helper: bytes → lowercase hex string
// -------------------------------------------------------
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// -------------------------------------------------------
// In-memory private state provider for contracts with no private state
// (OptimalAMM is purely public state — no private state needed)
// -------------------------------------------------------

function createInMemoryPrivateStateProvider() {
  let _contractAddress: string | null = null;
  const _states = new Map<string, any>();
  const _signingKeys = new Map<string, any>();

  return {
    setContractAddress(addr: string) { _contractAddress = addr; },
    getContractAddress() { return _contractAddress; },
    async get(key: string) { return _states.get(key) ?? {}; },
    async set(key: string, value: any) { _states.set(key, value); },
    async getSigningKey(addr: string) { return _signingKeys.get(addr); },
    async setSigningKey(addr: string, key: any) { _signingKeys.set(addr, key); },
  };
}

// -------------------------------------------------------
// Cached contract instance for findDeployedContract
// -------------------------------------------------------
let _cachedContractInstance: { address: string; contract: any } | null = null;

// -------------------------------------------------------
// Core: execute a contract call using the proven SDK path
// Uses findDeployedContract + callTx — the same approach as init-pool.ts
// -------------------------------------------------------
async function executeContractCall(
  wallet: WalletConnector,
  config: NetworkConfig,
  contractAddress: string,
  circuitId: string,
  args: any[],
): Promise<{ txHash: string; status: string; blockHeight?: number }> {
  const [
    sdk,
    { Contract },
    { createWitnesses },
  ] = await Promise.all([
    getSDKModules(),
    getContractModule(),
    getWitnessesModule(),
  ]);

  const { findDeployedContract, httpClientProofProvider, setNetworkId, CompiledContract, indexerPublicDataProvider } = sdk;

  // Set network ID (required by Midnight SDK)
  setNetworkId(config.network === 'mainnet' ? 'mainnet' : 'preprod');

  // Build proof server URL (full URL required for httpClientProofProvider's new URL())
  const rawProofUrl = (config.proofServer ?? '/api/proof').replace(/\/$/, '');
  const proofServerUrl = rawProofUrl.startsWith('http')
    ? rawProofUrl
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:6300') + rawProofUrl;

  // Build indexer URLs
  const rawIndexerUrl = (config.indexerGraphQL ?? '/api/indexer').replace(/\/$/, '');
  const indexerHttpUrl = rawIndexerUrl.startsWith('http')
    ? rawIndexerUrl
    : (typeof window !== 'undefined' ? window.location.origin : 'https://indexer.preprod.midnight.network/api/v4/graphql') + rawIndexerUrl;
  const indexerWsUrl = config.indexerWS ?? 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

  // 1. ZK Config Provider (browser-compatible, uses .bzkir)
  const zkConfigProvider = createBrowserZkConfigProvider(config.zkBaseUrl ?? '/zk/OptimalAMM');

  // 2. Proof Provider (uses the proven httpClientProofProvider from the SDK)
  const proofProvider = httpClientProofProvider(proofServerUrl, zkConfigProvider as any, {
    timeout: 300000, // 5 minutes for ZK proof generation
  });

  // 3. Public Data Provider (indexer — handles contract state queries)
  const publicDataProvider = indexerPublicDataProvider(
    indexerHttpUrl,
    indexerWsUrl,
    typeof window !== 'undefined' ? (window as any).WebSocket : undefined,
  );

  // 4. Get wallet identity for coinPublicKey
  const walletApi = wallet.getAPI();
  const addresses = await walletApi.getShieldedAddresses();
  const coinPublicKey = addresses.shieldedCoinPublicKey;
  const encryptionPublicKey = addresses.shieldedEncryptionPublicKey;

  // 5. Wallet Provider — bridges Lace DApp Connector to SDK wallet interface
  //    balanceTx: serialize proven tx → Lace balanceUnsealedTransaction → return balanced hex
  //    The SDK calls: proofProvider.proveTx(unprovenTx) → walletProvider.balanceTx(provenTx) → midnightProvider.submitTx
  const walletProvider = {
    balanceTx: async (provenTx: any, _ttl?: Date) => {
      const txBytes = provenTx.serialize();
      const txHex = bytesToHex(txBytes);
      logger.info(`Balancing transaction (${txBytes.length} bytes) via Lace…`);
      const { tx: balancedHex } = await walletApi.balanceUnsealedTransaction(txHex);
      // Return the balanced hex as-is — midnightProvider.submitTx will receive it
      return balancedHex;
    },
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
  };

  // 6. Midnight Provider — submits balanced tx via Lace
  const midnightProvider = {
    submitTx: async (balancedTxHex: any) => {
      logger.info('Submitting transaction via Lace…');
      const txHexStr = typeof balancedTxHex === 'string' ? balancedTxHex : bytesToHex(balancedTxHex.serialize());
      await walletApi.submitTransaction(txHexStr);
      // Lace submitTransaction returns void.
      // Return a recognizable placeholder — the real confirmation comes from callTx's
      // result.public.status / result.public.txHash which are populated by the SDK pipeline.
      return `lace-submitted-${Date.now()}`;
    },
  };

  // 7. Private State Provider (in-memory, empty — OptimalAMM has no private state)
  const privateStateProvider = createInMemoryPrivateStateProvider();

  // 8. Build providers object matching the midnight-js-contracts interface
  const providers = {
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
  } as any;

  // 9. Get or create contract instance via findDeployedContract
  if (!_cachedContractInstance || _cachedContractInstance.address !== contractAddress) {
    logger.info(`Setting up contract instance for ${contractAddress}…`);

    const witnesses = (createWitnesses as any)();
    const compiledContract = (CompiledContract as any)
      .make('OptimalAMM', Contract)
      .pipe(
        (CompiledContract as any).withWitnesses(witnesses),
      );

    const contract = await findDeployedContract(providers, {
      compiledContract: compiledContract as any,
      contractAddress: contractAddress as any,
      privateStateId: 'optimalAMMPrivateState',
      initialPrivateState: {},
    });

    _cachedContractInstance = { address: contractAddress, contract };
  }

  // 10. Call the circuit via callTx
  //     callTx is a full pipeline: prove → balance → submit → wait for result.
  //     The returned result.public contains the real on-chain outcome (status, txHash, blockHeight).
  logger.info(`Calling circuit '${circuitId}' on contract ${contractAddress}…`);
  const callFn = _cachedContractInstance.contract.callTx[circuitId];
  if (!callFn) {
    throw new Error(`Circuit '${circuitId}' not found on contract callTx interface`);
  }

  const result = await callFn(...args);

  // Extract transaction details from the SDK result
  // The midnight-js-contracts pipeline populates result.public with the on-chain outcome
  const txHash = result?.public?.txHash ?? result?.txHash ?? 'unknown';
  const status = result?.public?.status ?? result?.status ?? 'unknown';
  const blockHeight = result?.public?.blockHeight ?? result?.blockHeight ?? 0;

  // Log all available fields for debugging
  logger.info(`Circuit '${circuitId}' completed: status=${status}, txHash=${txHash}, blockHeight=${blockHeight}`);
  if (result?.public) {
    logger.info(`  Full public result keys: ${Object.keys(result.public).join(', ')}`);
  }

  // Check for on-chain failure
  if (status && typeof status === 'string' && status !== 'SucceedEntirely' && status !== 'unknown') {
    throw new MidSwapError(
      `Circuit '${circuitId}' failed on-chain with status: ${status}`,
      MidSwapErrorCode.TRANSACTION_FAILED,
      { txHash, status, blockHeight },
    );
  }

  return { txHash, status: String(status), blockHeight };
}

// ============================================
// SwapExecutor
// ============================================

export class SwapExecutor {
  private wallet: WalletConnector;
  private poolManager: PoolManager;
  private mevAnalytics: MEVAnalytics;
  private config: NetworkConfig;

  private readonly CONFIRMATION_POLL_INTERVAL = 2000;
  private readonly MAX_CONFIRMATION_WAIT = 120000;

  constructor(
    wallet: WalletConnector,
    poolManager: PoolManager,
    config: NetworkConfig,
  ) {
    this.wallet = wallet;
    this.poolManager = poolManager;
    this.mevAnalytics = new MEVAnalytics();
    this.config = config;
  }

  // ============================================
  // Quote
  // ============================================

  async getQuote(
    poolAddress: string,
    amountIn: bigint,
    zeroForOne: boolean,
    slippageBps: number = 50,
  ): Promise<SwapQuote> {
    if (amountIn <= 0n) {
      throw new MidSwapError('Invalid input amount', MidSwapErrorCode.INVALID_AMOUNT);
    }

    const pool = await this.poolManager.getPool(poolAddress);
    if (!pool) {
      throw new MidSwapError('Pool not found', MidSwapErrorCode.POOL_NOT_FOUND, { poolAddress });
    }
    if (!pool.initialized) {
      throw new MidSwapError('Pool not initialized', MidSwapErrorCode.POOL_NOT_INITIALIZED, { poolAddress });
    }

    const reserveIn = zeroForOne ? pool.reserve0 : pool.reserve1;
    const reserveOut = zeroForOne ? pool.reserve1 : pool.reserve0;

    const amountOut = this.poolManager.getAmountOut(amountIn, reserveIn, reserveOut, pool.feeBps);
    const priceImpact = this.poolManager.getPriceImpact(amountIn, amountOut, reserveIn, reserveOut);
    const fee = (amountIn * BigInt(pool.feeBps)) / 10000n;
    const mevSavings = this.mevAnalytics.estimateMEVSavings(amountIn, amountOut, reserveIn, reserveOut);
    const minimumReceived = (amountOut * BigInt(10000 - slippageBps)) / 10000n;

    const tokenInDecimals = zeroForOne ? pool.token0.decimals : pool.token1.decimals;
    const tokenOutDecimals = zeroForOne ? pool.token1.decimals : pool.token0.decimals;
    const executionPrice =
      Number(amountOut) / Math.pow(10, tokenOutDecimals) /
      (Number(amountIn) / Math.pow(10, tokenInDecimals));

    return {
      amountOut,
      priceImpact,
      fee,
      mevSavings: mevSavings.estimatedMEV,
      executionPrice,
      minimumReceived,
      route: [
        zeroForOne ? pool.token0.symbol : pool.token1.symbol,
        zeroForOne ? pool.token1.symbol : pool.token0.symbol,
      ],
    };
  }

  /**
   * Reverse quote: given a desired output amount, compute the required input.
   */
  async getQuoteReverse(
    poolAddress: string,
    amountOut: bigint,
    zeroForOne: boolean,
    slippageBps: number = 50,
  ): Promise<SwapQuote & { amountIn: bigint }> {
    if (amountOut <= 0n) {
      throw new MidSwapError('Invalid output amount', MidSwapErrorCode.INVALID_AMOUNT);
    }

    const pool = await this.poolManager.getPool(poolAddress);
    if (!pool) {
      throw new MidSwapError('Pool not found', MidSwapErrorCode.POOL_NOT_FOUND, { poolAddress });
    }
    if (!pool.initialized) {
      throw new MidSwapError('Pool not initialized', MidSwapErrorCode.POOL_NOT_INITIALIZED, { poolAddress });
    }

    const reserveIn = zeroForOne ? pool.reserve0 : pool.reserve1;
    const reserveOut = zeroForOne ? pool.reserve1 : pool.reserve0;

    const amountIn = this.poolManager.getAmountIn(amountOut, reserveIn, reserveOut, pool.feeBps);
    const priceImpact = this.poolManager.getPriceImpact(amountIn, amountOut, reserveIn, reserveOut);
    const fee = (amountIn * BigInt(pool.feeBps)) / 10000n;
    const mevSavings = this.mevAnalytics.estimateMEVSavings(amountIn, amountOut, reserveIn, reserveOut);
    // For a reverse quote, minimumReceived = amountOut (user set it exactly); but amountIn may need slippage buffer
    const minimumReceived = amountOut; // user wants this exact output
    const maximumInput = (amountIn * BigInt(10000 + slippageBps)) / 10000n;

    const tokenInDecimals = zeroForOne ? pool.token0.decimals : pool.token1.decimals;
    const tokenOutDecimals = zeroForOne ? pool.token1.decimals : pool.token0.decimals;
    const executionPrice =
      Number(amountOut) / Math.pow(10, tokenOutDecimals) /
      (Number(amountIn) / Math.pow(10, tokenInDecimals));

    return {
      amountIn,
      amountOut,
      priceImpact,
      fee,
      mevSavings: mevSavings.estimatedMEV,
      executionPrice,
      minimumReceived,
      maximumInput,
      route: [
        zeroForOne ? pool.token0.symbol : pool.token1.symbol,
        zeroForOne ? pool.token1.symbol : pool.token0.symbol,
      ],
    };
  }

  // ============================================
  // Execute Swap
  // ============================================

  async executeSwap(params: SwapParams): Promise<SwapResult> {
    const now = Math.floor(Date.now() / 1000);
    if (now > params.deadline) {
      throw new MidSwapError('Transaction deadline exceeded', MidSwapErrorCode.DEADLINE_EXCEEDED);
    }

    const pool = await this.poolManager.getPool(params.poolAddress);
    if (!pool) {
      throw new MidSwapError('Pool not found', MidSwapErrorCode.POOL_NOT_FOUND);
    }

    const reserveIn = params.zeroForOne ? pool.reserve0 : pool.reserve1;
    const reserveOut = params.zeroForOne ? pool.reserve1 : pool.reserve0;

    const expectedOutput = this.poolManager.getAmountOut(
      params.amountIn, reserveIn, reserveOut, pool.feeBps,
    );

    if (expectedOutput < params.amountOutMin) {
      throw new MidSwapError(
        `Output ${expectedOutput} is less than minimum ${params.amountOutMin}`,
        MidSwapErrorCode.SLIPPAGE_EXCEEDED,
        { expectedOutput, amountOutMin: params.amountOutMin },
      );
    }

    const mevSavings = this.mevAnalytics.estimateMEVSavings(
      params.amountIn, expectedOutput, reserveIn, reserveOut,
    );

    try {
      const result = await executeContractCall(
        this.wallet,
        this.config,
        params.poolAddress,
        'swap',
        [params.amountIn, params.amountOutMin, params.zeroForOne],
      );

      const txDetails = await this.waitForConfirmation(result.txHash, result.blockHeight);
      this.poolManager.invalidateCache(params.poolAddress);

      const priceImpact = this.poolManager.getPriceImpact(
        params.amountIn, expectedOutput, reserveIn, reserveOut,
      );

      return {
        txHash: result.txHash,
        amountIn: params.amountIn,
        amountOut: expectedOutput,
        priceImpact,
        fee: (params.amountIn * BigInt(pool.feeBps)) / 10000n,
        gasUsed: txDetails.gasUsed,
        mevSaved: mevSavings.estimatedMEV,
        blockNumber: txDetails.blockNumber || result.blockHeight || 0,
        timestamp: Date.now(),
      };
    } catch (error: unknown) {
      if (error instanceof MidSwapError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Swap failed: ${message}`,
        MidSwapErrorCode.TRANSACTION_FAILED,
        { originalError: error },
      );
    }
  }

  // ============================================
  // Execute Add Liquidity
  // ============================================

  async executeAddLiquidity(
    poolAddress: string,
    amount0: bigint,
    amount1: bigint,
    depositorBytes: Uint8Array,
  ): Promise<string> {
    try {
      const result = await executeContractCall(
        this.wallet,
        this.config,
        poolAddress,
        'addLiquidity',
        [amount0, amount1, depositorBytes],
      );
      return result.txHash;
    } catch (error: unknown) {
      if (error instanceof MidSwapError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Add liquidity failed: ${message}`,
        MidSwapErrorCode.TRANSACTION_FAILED,
        { originalError: error },
      );
    }
  }

  // ============================================
  // Execute Remove Liquidity
  // ============================================

  async executeRemoveLiquidity(
    poolAddress: string,
    lpAmount: bigint,
    withdrawerBytes: Uint8Array,
  ): Promise<string> {
    try {
      const result = await executeContractCall(
        this.wallet,
        this.config,
        poolAddress,
        'removeLiquidity',
        [lpAmount, withdrawerBytes],
      );
      return result.txHash;
    } catch (error: unknown) {
      if (error instanceof MidSwapError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Remove liquidity failed: ${message}`,
        MidSwapErrorCode.TRANSACTION_FAILED,
        { originalError: error },
      );
    }
  }

  // ============================================
  // Optimistic Swap (returns in <2s, proves in background)
  // ============================================

  /**
   * Execute a swap optimistically: validates inputs and computes expected output
   * locally (~instant), then returns immediately. ZK proof generation, submission,
   * and on-chain confirmation happen in the background.
   *
   * Subscribe to status via `result.onStatusChange()` or await `result.confirmation`.
   */
  executeSwapOptimistic(params: SwapParams): OptimisticSwapResult {
    // --- Synchronous validation (instant) ---
    const now = Math.floor(Date.now() / 1000);
    if (now > params.deadline) {
      throw new MidSwapError('Transaction deadline exceeded', MidSwapErrorCode.DEADLINE_EXCEEDED);
    }

    // We need pool data — use the cached version (PoolManager caches for 30s).
    // If the cache is empty this throws, which is fine: the caller should have
    // fetched a quote (which warms the cache) before calling this.
    const cachedPool = this.poolManager.getCachedPool(params.poolAddress);
    if (!cachedPool) {
      throw new MidSwapError(
        'Pool not in cache. Fetch a quote first to warm the cache.',
        MidSwapErrorCode.POOL_NOT_FOUND,
        { poolAddress: params.poolAddress },
      );
    }
    if (!cachedPool.initialized) {
      throw new MidSwapError('Pool not initialized', MidSwapErrorCode.POOL_NOT_INITIALIZED);
    }

    const reserveIn = params.zeroForOne ? cachedPool.reserve0 : cachedPool.reserve1;
    const reserveOut = params.zeroForOne ? cachedPool.reserve1 : cachedPool.reserve0;

    const expectedOutput = this.poolManager.getAmountOut(
      params.amountIn, reserveIn, reserveOut, cachedPool.feeBps,
    );

    if (expectedOutput < params.amountOutMin) {
      throw new MidSwapError(
        `Output ${expectedOutput} is less than minimum ${params.amountOutMin}`,
        MidSwapErrorCode.SLIPPAGE_EXCEEDED,
        { expectedOutput, amountOutMin: params.amountOutMin },
      );
    }

    const priceImpact = this.poolManager.getPriceImpact(
      params.amountIn, expectedOutput, reserveIn, reserveOut,
    );
    const fee = (params.amountIn * BigInt(cachedPool.feeBps)) / 10000n;
    const mevSavings = this.mevAnalytics.estimateMEVSavings(
      params.amountIn, expectedOutput, reserveIn, reserveOut,
    );

    // --- Build optimistic result object ---
    const pendingId = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let currentStatus: PendingSwapStatus = 'validating';
    const listeners = new Set<PendingSwapStatusListener>();

    const updateStatus = (status: PendingSwapStatus, detail?: string) => {
      currentStatus = status;
      listeners.forEach((cb) => {
        try { cb(status, detail); } catch { /* ignore listener errors */ }
      });
    };

    // --- Background proof + submit (fire-and-forget from caller's perspective) ---
    const confirmation = (async (): Promise<SwapResult> => {
      try {
        updateStatus('proving');

        const swapResult = await executeContractCall(
          this.wallet,
          this.config,
          params.poolAddress,
          'swap',
          [params.amountIn, params.amountOutMin, params.zeroForOne],
        );

        updateStatus('confirming', swapResult.txHash);

        const txDetails = await this.waitForConfirmation(swapResult.txHash, swapResult.blockHeight);
        this.poolManager.invalidateCache(params.poolAddress);

        const result: SwapResult = {
          txHash: swapResult.txHash,
          amountIn: params.amountIn,
          amountOut: expectedOutput,
          priceImpact,
          fee,
          gasUsed: txDetails.gasUsed,
          mevSaved: mevSavings.estimatedMEV,
          blockNumber: txDetails.blockNumber || swapResult.blockHeight || 0,
          timestamp: Date.now(),
        };

        updateStatus('confirmed');
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        updateStatus('failed', message);
        throw error instanceof MidSwapError
          ? error
          : new MidSwapError(
              `Swap failed: ${message}`,
              MidSwapErrorCode.TRANSACTION_FAILED,
              { originalError: error },
            );
      }
    })();

    const optimisticResult: OptimisticSwapResult = {
      pendingId,
      expectedAmountOut: expectedOutput,
      expectedPriceImpact: priceImpact,
      expectedFee: fee,
      estimatedMevSaved: mevSavings.estimatedMEV,
      params,
      get status() { return currentStatus; },
      onStatusChange(cb: PendingSwapStatusListener) {
        listeners.add(cb);
        return () => { listeners.delete(cb); };
      },
      confirmation,
    };

    return optimisticResult;
  }

  // ============================================
  // Multi-hop (future)
  // ============================================

  async findBestRoute(
    _tokenIn: string,
    _tokenOut: string,
    _amountIn: bigint,
  ): Promise<{ route: string[]; expectedOutput: bigint; priceImpact: number }> {
    throw new MidSwapError('Multi-hop swaps not yet implemented', MidSwapErrorCode.UNKNOWN_ERROR);
  }

  // ============================================
  // Transaction Confirmation Polling
  // ============================================

  /**
   * Wait for transaction confirmation.
   *
   * The midnight-js-contracts `callTx` pipeline already waits for the on-chain result
   * before returning, so in most cases the transaction is already confirmed when we
   * reach this method. We use this as a safety net:
   *
   * 1. If callTx returned a real txHash + blockHeight, return immediately.
   * 2. If the txHash is a placeholder (Lace returns void), poll the indexer for the
   *    contract's latest state change to detect confirmation.
   * 3. Fall back to direct txHash polling if the indexer supports it.
   */
  private async waitForConfirmation(
    txHash: string,
    blockHeight?: number,
  ): Promise<{
    blockNumber: number;
    gasUsed: bigint;
  }> {
    // If callTx already gave us a real block height, the tx is confirmed
    if (blockHeight && blockHeight > 0) {
      logger.info(`Transaction already confirmed at block ${blockHeight}`);
      return { blockNumber: blockHeight, gasUsed: 0n };
    }

    // If we have a real txHash (not our placeholder), try hash-based polling
    if (txHash && !txHash.startsWith('lace-submitted-') && !txHash.startsWith('submitted-') && txHash !== 'unknown') {
      return this.pollByTxHash(txHash);
    }

    // Fallback: the tx was submitted but we have no usable hash.
    // The callTx pipeline from midnight-js-contracts typically waits for the result
    // before returning, so if we got here with status=SucceedEntirely, it's already done.
    logger.info('Transaction submitted via Lace (no txHash available). Assuming confirmed based on callTx result.');
    return { blockNumber: 0, gasUsed: 0n };
  }

  /**
   * Poll the indexer by transaction hash until confirmed or timed out.
   */
  private async pollByTxHash(txHash: string): Promise<{
    blockNumber: number;
    gasUsed: bigint;
  }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_CONFIRMATION_WAIT) {
      try {
        const response = await fetch(this.config.indexerGraphQL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetTransaction($hash: String!) {
                transaction(hash: $hash) {
                  blockHeight
                  status
                  gasUsed
                }
              }
            `,
            variables: { hash: txHash },
          }),
        });

        const result = await response.json() as {
          data?: {
            transaction?: {
              blockHeight: number;
              status: string;
              gasUsed: string;
            };
          };
          errors?: Array<{ message: string }>;
        };

        const tx = result.data?.transaction;
        if (tx && tx.status === 'confirmed') {
          return { blockNumber: tx.blockHeight, gasUsed: BigInt(tx.gasUsed || '0') };
        }
        if (tx && tx.status === 'failed') {
          throw new MidSwapError(
            'Transaction failed on-chain',
            MidSwapErrorCode.TRANSACTION_FAILED,
            { txHash },
          );
        }
      } catch (error) {
        if (error instanceof MidSwapError) throw error;
        logger.error('Confirmation poll error:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, this.CONFIRMATION_POLL_INTERVAL));
    }

    logger.warn(`Confirmation polling timed out after ${this.MAX_CONFIRMATION_WAIT}ms for tx ${txHash}`);
    return { blockNumber: 0, gasUsed: 0n };
  }
}
