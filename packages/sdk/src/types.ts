/**
 * MidSwap SDK Type Definitions
 * 
 * All TypeScript interfaces and types for the MidSwap SDK
 */

// ============================================
// Network Configuration
// ============================================

export interface NetworkConfig {
  network: 'preprod' | 'mainnet';
  nodeRpc: string;
  indexerGraphQL: string;
  indexerWS: string;
  proofServer: string;
  zkBaseUrl?: string;
}

export const PREPROD_CONFIG: NetworkConfig = {
  network: 'preprod',
  nodeRpc: 'wss://rpc.preprod.midnight.network',
  indexerGraphQL: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  proofServer: 'http://localhost:6300',
  zkBaseUrl: '/zk/OptimalAMM'
};

export const MAINNET_CONFIG: NetworkConfig = {
  network: 'mainnet',
  nodeRpc: 'wss://rpc.midnight.network',
  indexerGraphQL: 'https://indexer.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.midnight.network/api/v4/graphql/ws',
  proofServer: 'http://localhost:6300',
  zkBaseUrl: '/zk/OptimalAMM'
};

// ============================================
// Token Types
// ============================================

export interface TokenInfo {
  /** Token contract address or identifier */
  address: string;
  /** Token symbol (e.g., "tNight", "mUSDC") */
  symbol: string;
  /** Full token name */
  name: string;
  /** Number of decimals */
  decimals: number;
  /** Optional logo URL */
  logoURI?: string;
  /** Whether this is a shielded token */
  isShielded: boolean;
}

// Default supported tokens
export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  tNight: {
    address: 'native',
    symbol: 'tNight',
    name: 'Test Night Token',
    decimals: 6,
    logoURI: '/tokens/tnight.svg',
    isShielded: true
  },
  mUSDC: {
    // Deployed MidnightUSDC contract address on Preprod
    address: 'c85172925beae8334c01135cfbd364cf2f6858e173be8c13bb82197890f645f4',
    symbol: 'mUSDC',
    name: 'Midnight USDC',
    decimals: 6,
    logoURI: '/tokens/musdc.svg',
    isShielded: true
  }
};

// ============================================
// Pool Types
// ============================================

export interface PoolInfo {
  /** Pool contract address */
  address: string;
  /** First token in the pair */
  token0: TokenInfo;
  /** Second token in the pair */
  token1: TokenInfo;
  /** Reserve of token0 */
  reserve0: bigint;
  /** Reserve of token1 */
  reserve1: bigint;
  /** Total LP token supply */
  totalSupply: bigint;
  /** Fee in basis points (30 = 0.3%) */
  feeBps: number;
  /** Whether pool is initialized */
  initialized: boolean;
  /** Current price (token1 per token0) */
  price: number;
  /** 24h volume in USD */
  volume24h?: number;
  /** Total value locked in USD */
  tvl?: number;
}

export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  blockNumber: number;
  timestamp: number;
}

// ============================================
// Swap Types
// ============================================

export interface SwapParams {
  /** Pool address to swap on */
  poolAddress: string;
  /** Amount of input token */
  amountIn: bigint;
  /** Minimum output amount (slippage protection) */
  amountOutMin: bigint;
  /** Swap direction: true = token0->token1, false = token1->token0 */
  zeroForOne: boolean;
  /** Transaction deadline (Unix timestamp) */
  deadline: number;
}

export interface SwapQuote {
  /** Expected output amount */
  amountOut: bigint;
  /** Price impact in basis points */
  priceImpact: number;
  /** Fee amount in input token */
  fee: bigint;
  /** Estimated MEV savings vs Ethereum */
  mevSavings: bigint;
  /** Execution price */
  executionPrice: number;
  /** Minimum output after slippage */
  minimumReceived: bigint;
  /** Maximum input after slippage (reverse quote only) */
  maximumInput?: bigint;
  /** Route taken (for multi-hop) */
  route: string[];
}

export interface SwapResult {
  /** Transaction hash */
  txHash: string;
  /** Actual input amount */
  amountIn: bigint;
  /** Actual output amount */
  amountOut: bigint;
  /** Actual price impact */
  priceImpact: number;
  /** Fee paid */
  fee: bigint;
  /** Gas used */
  gasUsed: bigint;
  /** Estimated MEV saved compared to Ethereum */
  mevSaved: bigint;
  /** Block number */
  blockNumber: number;
  /** Transaction timestamp */
  timestamp: number;
}

// ============================================
// Liquidity Types
// ============================================

export interface LiquidityParams {
  /** Pool address */
  poolAddress: string;
  /** Desired amount of token0 */
  amount0Desired: bigint;
  /** Desired amount of token1 */
  amount1Desired: bigint;
  /** Minimum amount of token0 (slippage) */
  amount0Min: bigint;
  /** Minimum amount of token1 (slippage) */
  amount1Min: bigint;
  /** Transaction deadline */
  deadline: number;
}

export interface LiquidityResult {
  /** Transaction hash */
  txHash: string;
  /** LP tokens received/burned */
  lpTokens: bigint;
  /** Actual token0 amount */
  amount0Used: bigint;
  /** Actual token1 amount */
  amount1Used: bigint;
  /** Share of pool (percentage) */
  poolShare: number;
}

export interface LPPosition {
  /** Pool address */
  poolAddress: string;
  /** LP token balance */
  lpBalance: bigint;
  /** Share of pool (0-1) */
  poolShare: number;
  /** Value of token0 portion */
  token0Value: bigint;
  /** Value of token1 portion */
  token1Value: bigint;
  /** Total value in USD */
  totalValueUSD: number;
  /** Unclaimed fees */
  unclaimedFees: {
    token0: bigint;
    token1: bigint;
  };
}

// ============================================
// MEV Analytics Types
// ============================================

export interface MEVSavings {
  /** Estimated MEV that would have been extracted on Ethereum */
  estimatedMEV: bigint;
  /** Type of MEV attack prevented */
  mevType: 'frontrun' | 'sandwich' | 'backrun' | 'none';
  /** Confidence level (0-100) */
  confidence: number;
  /** What Ethereum gas would have cost */
  ethereumGasWouldCost: bigint;
  /** Actual Midnight gas cost */
  midnightGasCost: bigint;
  /** Net savings */
  netSavings: bigint;
}

export interface MEVStats {
  /** Total MEV saved across all trades */
  totalSaved: bigint;
  /** Number of trades protected */
  tradesProtected: number;
  /** Average savings per trade */
  avgSavingsPerTrade: bigint;
  /** Savings by MEV type */
  savingsByType: {
    frontrun: bigint;
    sandwich: bigint;
    backrun: bigint;
  };
}

export interface EthereumMEVData {
  /** MEV extracted in last 24h (formatted) */
  last24hMEV: string;
  /** Average MEV per block */
  avgPerBlock: string;
  /** Top MEV extractors */
  topMEVBots: string[];
  /** Recent MEV transactions */
  recentAttacks: MEVAttack[];
}

export interface MEVAttack {
  /** Attack type */
  type: 'frontrun' | 'sandwich' | 'backrun';
  /** Amount extracted */
  profit: bigint;
  /** Victim address (truncated) */
  victim: string;
  /** Transaction hash */
  txHash: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================
// Wallet Types
// ============================================

export interface WalletState {
  /** Whether wallet is connected */
  isConnected: boolean;
  /** User's address (shielded) */
  address: string | null;
  /** Connected network */
  network: 'preprod' | 'mainnet';
  /** Token balances */
  balance: WalletBalance;
  /** Wallet provider name */
  providerName?: string;
}

export interface WalletBalance {
  /** Native tDUST/DUST balance */
  native: bigint;
  /** Shielded token balances */
  shieldedTokens: Map<string, bigint>;
}

// ============================================
// Real Midnight DApp Connector API types
// (matches @midnight-ntwrk/dapp-connector-api@4.0.1)
// ============================================

export type TokenType = string;

export type KeyMaterialProvider = {
  getZKIR(circuitKeyLocation: string): Promise<Uint8Array>;
  getProverKey(circuitKeyLocation: string): Promise<Uint8Array>;
  getVerifierKey(circuitKeyLocation: string): Promise<Uint8Array>;
};

export type ProvingProvider = {
  check(serializedPreimage: Uint8Array, keyLocation: string): Promise<(bigint | undefined)[]>;
  prove(serializedPreimage: Uint8Array, keyLocation: string, overwriteBindingInput?: bigint): Promise<Uint8Array>;
};

export type WalletConfiguration = {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri?: string;
  substrateNodeUri: string;
  networkId: string;
};

/** Real ConnectedAPI returned by InitialAPI.connect() */
export interface ConnectedAPI {
  getShieldedAddresses(): Promise<{
    shieldedAddress: string;
    shieldedCoinPublicKey: string;
    shieldedEncryptionPublicKey: string;
  }>;
  getShieldedBalances(): Promise<Record<TokenType, bigint>>;
  getUnshieldedBalances(): Promise<Record<TokenType, bigint>>;
  getDustBalance(): Promise<{ cap: bigint; balance: bigint }>;
  balanceUnsealedTransaction(tx: string, options?: { payFees?: boolean }): Promise<{ tx: string }>;
  balanceSealedTransaction(tx: string, options?: { payFees?: boolean }): Promise<{ tx: string }>;
  submitTransaction(tx: string): Promise<void>;
  getProvingProvider(keyMaterialProvider: KeyMaterialProvider): Promise<ProvingProvider>;
  getConfiguration(): Promise<WalletConfiguration>;
  hintUsage(methodNames: string[]): Promise<void>;
}

/** Real InitialAPI injected at window.midnight['lace'] */
export interface InitialAPI {
  rdns: string;
  name: string;
  icon: string;
  apiVersion: string;
  connect(networkId: string): Promise<ConnectedAPI>;
}

// Keep legacy aliases for code that still references old names
/** @deprecated use InitialAPI */
export type MidnightProvider = InitialAPI;
/** @deprecated use ConnectedAPI */
export type MidnightAPI = ConnectedAPI;

// ============================================
// Optimistic Swap Types
// ============================================

/** Status progression for a pending swap */
export type PendingSwapStatus = 'validating' | 'proving' | 'submitting' | 'confirming' | 'confirmed' | 'failed';

/** Listener for pending swap status changes */
export type PendingSwapStatusListener = (status: PendingSwapStatus, detail?: string) => void;

/**
 * Returned immediately (~1s) from swapOptimistic().
 * The actual ZK proof + submission happens in the background.
 */
export interface OptimisticSwapResult {
  /** Unique identifier for this pending swap */
  pendingId: string;
  /** Expected output computed locally via AMM math */
  expectedAmountOut: bigint;
  /** Expected price impact (basis points) */
  expectedPriceImpact: number;
  /** Expected fee in input token */
  expectedFee: bigint;
  /** Estimated MEV savings vs Ethereum */
  estimatedMevSaved: bigint;
  /** Original swap params */
  params: SwapParams;
  /** Current status */
  status: PendingSwapStatus;
  /** Subscribe to status updates. Returns unsubscribe function. */
  onStatusChange: (cb: PendingSwapStatusListener) => () => void;
  /**
   * Promise that resolves with the final SwapResult when the swap is
   * fully confirmed on-chain, or rejects if proving/submission fails.
   */
  confirmation: Promise<SwapResult>;
}

// ============================================
// Event Types
// ============================================

export type SDKEvent = 
  | { type: 'wallet_connected'; address: string }
  | { type: 'wallet_disconnected' }
  | { type: 'swap_initiated'; params: SwapParams }
  | { type: 'swap_optimistic'; result: OptimisticSwapResult }
  | { type: 'swap_proving'; pendingId: string }
  | { type: 'swap_proven'; pendingId: string }
  | { type: 'swap_submitted'; pendingId: string; txHash: string }
  | { type: 'swap_completed'; result: SwapResult; pendingId?: string }
  | { type: 'swap_failed'; error: string; pendingId?: string }
  | { type: 'liquidity_added'; result: LiquidityResult }
  | { type: 'liquidity_removed'; result: LiquidityResult }
  | { type: 'pool_updated'; pool: PoolInfo };

export type SDKEventListener = (event: SDKEvent) => void;

// ============================================
// Error Types
// ============================================

export class MidSwapError extends Error {
  constructor(
    message: string,
    public code: MidSwapErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MidSwapError';
  }
}

export enum MidSwapErrorCode {
  // Wallet errors
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_CONNECTION_REJECTED = 'WALLET_CONNECTION_REJECTED',
  
  // Pool errors
  POOL_NOT_FOUND = 'POOL_NOT_FOUND',
  POOL_NOT_INITIALIZED = 'POOL_NOT_INITIALIZED',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  
  // Swap errors
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  
  // Transaction errors
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  INDEXER_ERROR = 'INDEXER_ERROR',
  PROOF_SERVER_ERROR = 'PROOF_SERVER_ERROR',
  
  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
