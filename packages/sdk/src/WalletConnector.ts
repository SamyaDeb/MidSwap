/**
 * WalletConnector - Real Midnight Wallet Integration
 *
 * Connects to Lace wallet via the DApp Connector API v4.
 * Uses window.midnight['lace'].connect(networkId) → ConnectedAPI
 */

import type {
  NetworkConfig,
  WalletState,
  WalletBalance,
  InitialAPI,
  ConnectedAPI,
  KeyMaterialProvider,
  ProvingProvider,
} from './types';
import { MidSwapError, MidSwapErrorCode } from './types';
import { logger } from './logger';

// Extend window for Midnight wallet injection
declare global {
  interface Window {
    midnight?: Record<string, InitialAPI | undefined>;
  }
}

export class WalletConnector {
  private api: ConnectedAPI | null = null;
  private config: NetworkConfig;
  private listeners: Set<(state: WalletState) => void> = new Set();
  private currentState: WalletState;

  constructor(config: NetworkConfig) {
    this.config = config;
    this.currentState = this.getDisconnectedState();
  }

  // ============================================
  // Connection Management
  // ============================================

  isWalletInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    return this.findProvider() !== null;
  }

  getAvailableProviders(): string[] {
    if (typeof window === 'undefined' || !window.midnight) return [];
    return Object.keys(window.midnight).filter(k => window.midnight![k] !== undefined);
  }

  /**
   * Find the Lace / Midnight provider regardless of what key it was injected under.
   *
   * Lace has been observed to inject under several keys:
   *   - 'lace'                  (original key used in early docs)
   *   - 'io.lace.midnight'      (reverse-DNS format per CAIP-372 draft)
   *   - 'midnightLace'          (another variant seen in the wild)
   *   - any key whose .name contains 'lace' (case-insensitive)
   *
   * We try all known keys first, then fall back to picking the first
   * injected provider whose name includes 'lace' (case-insensitive),
   * and finally just take the first available provider.
   */
  private findProvider(preferredName?: string): InitialAPI | null {
    if (typeof window === 'undefined' || !window.midnight) return null;

    const midnight = window.midnight;

    // 1. Try exact preferred name first (e.g. 'lace')
    if (preferredName && midnight[preferredName]) {
      return midnight[preferredName]!;
    }

    // 2. Try all known Lace key variants
    const knownKeys = ['lace', 'io.lace.midnight', 'midnightLace', 'laceMidnight', 'midnight-lace'];
    for (const key of knownKeys) {
      if (midnight[key]) return midnight[key]!;
    }

    // 3. Find by .name containing 'lace' (case-insensitive)
    for (const [, provider] of Object.entries(midnight)) {
      if (provider && provider.name?.toLowerCase().includes('lace')) {
        return provider;
      }
    }

    // 4. Return the first available provider regardless of name
    const allProviders = Object.values(midnight).filter(Boolean);
    return allProviders.length > 0 ? allProviders[0]! : null;
  }

  /**
   * Wait up to `timeoutMs` for the wallet extension to inject itself into
   * window.midnight.  Extensions inject asynchronously after page load.
   */
  private async waitForProvider(timeoutMs = 3000): Promise<InitialAPI | null> {
    // Already available?
    const immediate = this.findProvider();
    if (immediate) return immediate;

    return new Promise(resolve => {
      const deadline = Date.now() + timeoutMs;
      const poll = setInterval(() => {
        const p = this.findProvider();
        if (p || Date.now() >= deadline) {
          clearInterval(poll);
          resolve(p);
        }
      }, 100);
    });
  }

  /**
   * Connect to Lace wallet.
   * Calls InitialAPI.connect(networkId) — NOT .enable().
   *
   * The provider key is auto-discovered; pass a preferred key as hint if known.
   */
  async connect(providerName: string = 'lace'): Promise<WalletState> {
    if (typeof window === 'undefined') {
      throw new MidSwapError(
        'Wallet connection requires a browser environment',
        MidSwapErrorCode.WALLET_NOT_FOUND,
      );
    }

    // Wait up to 3 s for the extension to inject
    const provider = await this.waitForProvider(3000);

    if (!provider) {
      const available = this.getAvailableProviders();
      throw new MidSwapError(
        available.length === 0
          ? 'Midnight wallet not found. Please install the Lace extension and refresh the page.'
          : `Wallet provider not found. Available providers: ${available.join(', ')}`,
        MidSwapErrorCode.WALLET_NOT_FOUND,
        {
          triedKey: providerName,
          availableProviders: available,
          installUrl: 'https://www.lace.io/',
        },
      );
    }

    logger.info(`[WalletConnector] Connecting via provider: "${provider.name}" (key auto-discovered)`);

    try {
      // Use connect(networkId) — the real API entry point
      // Lace on preprod expects the string 'preprod'; on mainnet use 'mainnet'.
      this.api = await provider.connect(this.config.network);

      // Fetch shielded address
      const addrs = await this.api.getShieldedAddresses();
      const address = addrs.shieldedAddress;

      const state: WalletState = {
        isConnected: true,
        address,
        network: this.config.network,
        balance: { native: 0n, shieldedTokens: new Map() },
        providerName,
      };

      this.currentState = state;
      this.notifyListeners(state);

      // Refresh balance in background
      this.refreshBalance().catch(err => logger.error('Failed to refresh balance:', err));

      return state;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('rejected') || message.includes('denied')) {
        throw new MidSwapError(
          'Wallet connection rejected by user',
          MidSwapErrorCode.WALLET_CONNECTION_REJECTED,
        );
      }

      throw new MidSwapError(
        `Failed to connect wallet: ${message}`,
        MidSwapErrorCode.WALLET_NOT_CONNECTED,
        { originalError: error },
      );
    }
  }

  disconnect(): void {
    this.api = null;
    this.currentState = this.getDisconnectedState();
    this.notifyListeners(this.currentState);
  }

  async isConnected(): Promise<boolean> {
    if (!this.api) return false;
    try {
      const status = await (this.api as any).getConnectionStatus?.();
      return status?.status === 'connected';
    } catch {
      return this.currentState.isConnected;
    }
  }

  getState(): WalletState {
    return { ...this.currentState };
  }

  getAddress(): string {
    if (!this.currentState.isConnected || !this.currentState.address) {
      throw new MidSwapError('Wallet not connected', MidSwapErrorCode.WALLET_NOT_CONNECTED);
    }
    return this.currentState.address;
  }

  /**
   * Returns the raw shielded coin public key bytes (32 bytes).
   * Used as the `trader_0 / depositor_0 / withdrawer_0` parameter in circuits.
   */
  async getIdentityBytes32(): Promise<Uint8Array> {
    const api = this.getAPI();
    const addrs = await api.getShieldedAddresses();
    // shieldedCoinPublicKey is a bech32m string; we need its raw bytes.
    // Decode bech32m → bytes (skip the "shielded1" or similar HRP).
    return bech32mToBytes32(addrs.shieldedCoinPublicKey);
  }

  // ============================================
  // Balance Management
  // ============================================

  async refreshBalance(): Promise<WalletBalance> {
    const api = this.getAPI();

    try {
      const [shielded, dust] = await Promise.all([
        api.getShieldedBalances(),
        api.getDustBalance(),
      ]);

      // Native = dust balance
      const native = dust.balance;

      // Shielded tokens map
      const shieldedTokens = new Map<string, bigint>(
        Object.entries(shielded).map(([k, v]) => [k, v]),
      );

      const balance: WalletBalance = { native, shieldedTokens };
      this.currentState = { ...this.currentState, balance };
      this.notifyListeners(this.currentState);
      return balance;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Failed to fetch balance: ${message}`,
        MidSwapErrorCode.NETWORK_ERROR,
        { originalError: error },
      );
    }
  }

  getTokenBalance(tokenAddress: string): bigint {
    if (tokenAddress === 'native') return this.currentState.balance.native;
    return this.currentState.balance.shieldedTokens.get(tokenAddress) ?? 0n;
  }

  // ============================================
  // Raw API Access
  // ============================================

  getAPI(): ConnectedAPI {
    if (!this.api) {
      throw new MidSwapError('Wallet not connected', MidSwapErrorCode.WALLET_NOT_CONNECTED);
    }
    return this.api;
  }

  /**
   * Get a ProvingProvider from the wallet.
   * The keyMaterialProvider must serve the ZK key files for each circuit.
   */
  async getProvingProvider(keyMaterialProvider: KeyMaterialProvider): Promise<ProvingProvider> {
    const api = this.getAPI();
    return api.getProvingProvider(keyMaterialProvider);
  }

  /**
   * Balance an unsealed transaction (with pre-binding proof data).
   * Returns a balanced transaction string ready for submission.
   */
  async balanceUnsealedTransaction(txHex: string): Promise<string> {
    const api = this.getAPI();
    try {
      const result = await api.balanceUnsealedTransaction(txHex);
      return result.tx;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Failed to balance transaction: ${message}`,
        MidSwapErrorCode.TRANSACTION_FAILED,
        { originalError: error },
      );
    }
  }

  /**
   * Submit a balanced, sealed transaction to the network.
   */
  async submitTransaction(txHex: string): Promise<void> {
    const api = this.getAPI();
    try {
      logger.debug('Submitting transaction...');
      await api.submitTransaction(txHex);
      logger.info('Transaction submitted');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new MidSwapError(
        `Failed to submit transaction: ${message}`,
        MidSwapErrorCode.TRANSACTION_REJECTED,
        { originalError: error },
      );
    }
  }

  // ============================================
  // Event Subscription
  // ============================================

  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private notifyListeners(state: WalletState): void {
    this.listeners.forEach(listener => {
      try { listener(state); } catch (err) { logger.error('Listener error:', err); }
    });
  }

  private getDisconnectedState(): WalletState {
    return {
      isConnected: false,
      address: null,
      network: this.config.network,
      balance: { native: 0n, shieldedTokens: new Map() },
    };
  }
}

// ============================================
// Bech32m decoder (no external dependency)
// ============================================

const BECH32M_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32mToBytes32(encoded: string): Uint8Array {
  try {
    const lower = encoded.toLowerCase();
    const sep = lower.lastIndexOf('1');
    if (sep < 1) throw new Error('no separator');

    const data: number[] = [];
    for (let i = sep + 1; i < lower.length; i++) {
      const v = BECH32M_CHARSET.indexOf(lower[i]);
      if (v < 0) throw new Error('invalid char');
      data.push(v);
    }

    // Drop checksum (last 6 items), convert 5-bit groups to bytes
    const payload = data.slice(0, data.length - 6);
    const bytes = convertBits(payload, 5, 8, false);

    const out = new Uint8Array(32);
    const len = Math.min(bytes.length, 32);
    out.set(bytes.slice(0, len));
    return out;
  } catch {
    // Fallback: XOR fold the UTF-8 bytes
    const input = new TextEncoder().encode(encoded);
    const out = new Uint8Array(32);
    for (let i = 0; i < input.length; i++) out[i % 32] ^= input[i];
    return out;
  }
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): Uint8Array {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxv);
  return new Uint8Array(result);
}
