/**
 * MidSwap SDK
 * 
 * Privacy-preserving DEX SDK for Midnight blockchain
 * 
 * @example
 * ```typescript
 * import { MidSwapSDK } from '@midswap/sdk';
 * 
 * const sdk = new MidSwapSDK();
 * await sdk.connect();
 * 
 * const quote = await sdk.getSwapQuote(poolAddress, amountIn, true);
 * const result = await sdk.swap({ ... });
 * ```
 */

// Main SDK
export { MidSwapSDK, createMidSwapSDK, midswap } from './MidSwapSDK';

// Modules
export { WalletConnector } from './WalletConnector';
export { PoolManager } from './PoolManager';
export { SwapExecutor } from './SwapExecutor';
export { MEVAnalytics } from './MEVAnalytics';
export { logger } from './logger';
export type { LogLevel } from './logger';

// Types
export type {
  // Network
  NetworkConfig,
  
  // Tokens
  TokenInfo,
  
  // Pools
  PoolInfo,
  PoolReserves,
  
  // Swaps
  SwapParams,
  SwapQuote,
  SwapResult,
  
  // Optimistic Swap
  OptimisticSwapResult,
  PendingSwapStatus,
  PendingSwapStatusListener,
  
  // Liquidity
  LiquidityParams,
  LiquidityResult,
  LPPosition,
  
  // MEV
  MEVSavings,
  MEVStats,
  EthereumMEVData,
  MEVAttack,
  
  // Wallet
  WalletState,
  WalletBalance,
  MidnightProvider,
  MidnightAPI,
  InitialAPI,
  ConnectedAPI,
  KeyMaterialProvider,
  ProvingProvider,
  WalletConfiguration,
  TokenType,
  
  // Events
  SDKEvent,
  SDKEventListener
} from './types';

// Constants and Errors
export {
  PREPROD_CONFIG,
  MAINNET_CONFIG,
  SUPPORTED_TOKENS,
  MidSwapError,
  MidSwapErrorCode
} from './types';
