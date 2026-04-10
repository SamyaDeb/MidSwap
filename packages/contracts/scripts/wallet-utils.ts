/**
 * Midnight Wallet Utility Functions
 * 
 * Helper functions for working with Midnight HD wallets, deriving keys,
 * and managing transactions.
 */

import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

export interface DerivedKeys {
  nightKey: Uint8Array;      // Private key for Night (main) chain
  dustKey: Uint8Array;       // Private key for Dust (fees)
  zswapKey: Uint8Array;      // Private key for Zswap (shielded operations)
}

export interface WalletConfig {
  seedPhrase: string;
  accountIndex?: number;
  keyIndex?: number;
}

/**
 * Derive wallet keys from a BIP39 seed phrase
 */
export function deriveKeysFromSeed(config: WalletConfig): DerivedKeys {
  const { seedPhrase, accountIndex = 0, keyIndex = 0 } = config;

  console.log('  Deriving wallet keys from seed phrase...');
  
  // Convert mnemonic to seed bytes
  const seed = mnemonicToSeedSync(seedPhrase, '');
  
  // Create HD wallet from seed
  const walletResult = HDWallet.fromSeed(seed);

  if (walletResult.type !== 'seedOk') {
    throw new Error(`Failed to create HD wallet: ${walletResult.type}`);
  }

  const hdWallet = walletResult.hdWallet;
  const account = hdWallet.selectAccount(accountIndex);

  // Derive Night key (main chain)
  const nightKeyResult = account.selectRole(Roles.NightExternal).deriveKeyAt(keyIndex);
  if (nightKeyResult.type !== 'keyDerived') {
    throw new Error(`Failed to derive Night key: ${nightKeyResult.type}`);
  }

  // Derive Dust key (for fees)
  const dustKeyResult = account.selectRole(Roles.Dust).deriveKeyAt(keyIndex);
  if (dustKeyResult.type !== 'keyDerived') {
    throw new Error(`Failed to derive Dust key: ${dustKeyResult.type}`);
  }

  // Derive Zswap key (shielded operations)
  const zswapKeyResult = account.selectRole(Roles.Zswap).deriveKeyAt(keyIndex);
  if (zswapKeyResult.type !== 'keyDerived') {
    throw new Error(`Failed to derive Zswap key: ${zswapKeyResult.type}`);
  }

  console.log('  ✓ Keys derived successfully');
  console.log(`    Account: ${accountIndex}, Key Index: ${keyIndex}`);
  console.log(`    Derivation path: m/44'/2400'/${accountIndex}'/[role]/${keyIndex}`);

  // Clear sensitive data from wallet
  hdWallet.clear();

  return {
    nightKey: nightKeyResult.key,
    dustKey: dustKeyResult.key,
    zswapKey: zswapKeyResult.key
  };
}

/**
 * Derive a public address from keys
 * Note: This is a simplified version. Actual address derivation may require
 * additional Midnight SDK utilities.
 */
export function deriveAddress(publicKey: Uint8Array, prefix: string = 'mn_addr_preprod'): string {
  // Convert public key to base58 or bech32 format
  // This is a placeholder - actual implementation depends on Midnight SDK utilities
  const base58 = Buffer.from(publicKey).toString('base64url').slice(0, 58);
  return `${prefix}1${base58}`;
}

/**
 * Validate a seed phrase (BIP39 mnemonic)
 */
export function validateSeedPhrase(seedPhrase: string): boolean {
  const words = seedPhrase.trim().split(/\s+/);

  // BIP39 supports 12, 15, 18, 21, or 24 words
  const validLengths = [12, 15, 18, 21, 24];

  if (!validLengths.includes(words.length)) {
    console.error(`Invalid seed phrase length: ${words.length} words`);
    console.error(`Expected one of: ${validLengths.join(', ')} words`);
    return false;
  }

  // Check for empty words
  if (words.some(w => !w || w.length === 0)) {
    console.error('Seed phrase contains empty words');
    return false;
  }

  try {
    const seed = mnemonicToSeedSync(seedPhrase, '');
    if (!seed || seed.length !== 64) {
      console.error('Failed to derive seed from mnemonic');
      return false;
    }
    console.log(`  ✓ Seed phrase validated: ${words.length} words`);
    return true;
  } catch (error) {
    console.error('Invalid seed phrase:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Securely clear sensitive data from memory
 */
export function secureClear(data: Uint8Array | string): void {
  if (typeof data === 'string') {
    // Can't truly clear strings in JavaScript, but we can help GC
    data = '';
  } else if (data instanceof Uint8Array) {
    // Zero out the array
    for (let i = 0; i < data.length; i++) {
      data[i] = 0;
    }
  }
}

/**
 * Format a byte array as hex string (for display purposes only)
 */
export function toHexString(bytes: Uint8Array, maxLength: number = 32): string {
  const hex = Buffer.from(bytes).toString('hex');
  if (hex.length > maxLength) {
    return hex.slice(0, maxLength) + '...';
  }
  return hex;
}

/**
 * Check if running in a secure environment
 */
export function checkSecurityWarnings(): string[] {
  const warnings: string[] = [];

  // Check if running in production
  if (process.env.NODE_ENV === 'production') {
    warnings.push('Running in production mode - ensure seed phrase is stored securely');
  }

  // Check if seed phrase is in environment
  if (process.env.DEPLOYER_SEED_PHRASE) {
    warnings.push('Seed phrase found in environment variable - ensure this is intentional');
  }

  // Check if we're in a CI/CD environment
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    warnings.push('Running in CI/CD environment - ensure secrets are properly configured');
  }

  return warnings;
}

/**
 * Create a mock wallet for testing (DO NOT USE IN PRODUCTION)
 */
export function createTestWallet(): { seedPhrase: string; keys: DerivedKeys } {
  const { generateMnemonicWords, joinMnemonicWords } = require('@midnight-ntwrk/wallet-sdk-hd');
  
  const words = generateMnemonicWords();
  const seedPhrase = joinMnemonicWords(words);
  
  const keys = deriveKeysFromSeed({ seedPhrase });
  
  return { seedPhrase, keys };
}
