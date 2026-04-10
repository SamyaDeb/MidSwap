/**
 * MidnightUSDC — Initialize + Mint
 *
 * Connects to the already-deployed MidnightUSDC contract using
 * findDeployedContract, then calls initialize() and mint().
 *
 * Prerequisites:
 *   1. Proof server running: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
 *   2. Contract already deployed (see deploy-musdc.ts)
 *   3. DEPLOYER_SEED_PHRASE env var set
 *   4. CONTRACT_ADDRESS env var set (or --contract=...)
 *
 * Usage:
 *   DEPLOYER_SEED_PHRASE="..." CONTRACT_ADDRESS="95b67b..." SYNC_TIMEOUT_MS=300000 \
 *     pnpm --filter @midswap/contracts init:musdc
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

// Midnight SDK internals JSON.stringify proof/tx data that may contain BigInt values.
// This polyfill makes BigInt serializable as a numeric string, preventing
// "TypeError: Do not know how to serialize a BigInt" errors.
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  InMemoryTransactionHistoryStorage,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../managed/MidnightUSDC/contract/index.js';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';

// ---------------------------------------------------------------------------
// Network config
// ---------------------------------------------------------------------------

const NETWORKS = {
  preprod: {
    networkId: 'preprod' as NetworkId,
    indexerHttp: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeRpc: 'wss://rpc.preprod.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  },
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type EmptyPrivateState = Record<string, never>;
const PRIVATE_STATE_KEY = 'musdcPrivateState';
const TX_STATUS_SUCCESS = 'SucceedEntirely';
const MINT_AMOUNT = 100_000_000n; // 100 mUSDC at 6 decimals

// ---------------------------------------------------------------------------
// Key derivation (same as init-pool.ts)
// ---------------------------------------------------------------------------

function deriveRoleKey(accountKey: AccountKey, role: Role, idx = 0): Buffer {
  const r = accountKey.selectRole(role).deriveKeyAt(idx);
  if (r.type === 'keyDerived') return Buffer.from(r.key);
  return deriveRoleKey(accountKey, role, idx + 1);
}

function deriveAllKeys(seed: Uint8Array) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') throw new Error('Bad seed');
  const account = hdWallet.hdWallet.selectAccount(0);
  const shieldedSeed = deriveRoleKey(account, Roles.Zswap);
  const dustSeed = deriveRoleKey(account, Roles.Dust);
  const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);
  hdWallet.hdWallet.clear();
  return {
    shielded: { seed: shieldedSeed, keys: ledgerSdk.ZswapSecretKeys.fromSeed(shieldedSeed) },
    dust: { seed: dustSeed, key: ledgerSdk.DustSecretKey.fromSeed(dustSeed) },
    unshielded: unshieldedKey,
  };
}

// ---------------------------------------------------------------------------
// CLI config
// ---------------------------------------------------------------------------

function parseConfig() {
  const args = process.argv.slice(2);
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) throw new Error('DEPLOYER_SEED_PHRASE env var is required');

  const contractAddress =
    args.find((a) => a.startsWith('--contract='))?.split('=')[1] ||
    process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error(
      'CONTRACT_ADDRESS is required (set --contract=... or CONTRACT_ADDRESS env var)',
    );
  }

  const network = (
    args.find((a) => a.startsWith('--network='))?.split('=')[1] ||
    process.env.NETWORK ||
    'preprod'
  ) as 'preprod';

  const skipInit = args.includes('--skip-init') || process.env.SKIP_INIT === '1';
  const skipMint = args.includes('--skip-mint') || process.env.SKIP_MINT === '1';

  return { seedPhrase, contractAddress, network, skipInit, skipMint };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = parseConfig();
  const networkConfig = NETWORKS[config.network];

  if (!validateSeedPhrase(config.seedPhrase)) throw new Error('Invalid seed phrase');

  setNetworkId(networkConfig.networkId);

  console.log('\n========================================');
  console.log('  MidnightUSDC — Initialize + Mint');
  console.log('========================================\n');
  console.log(`  Network:  ${config.network}`);
  console.log(`  Contract: ${config.contractAddress}`);
  console.log(`  Skip init: ${config.skipInit}`);
  console.log(`  Skip mint: ${config.skipMint}`);

  // Derive keys
  const seedBytes = mnemonicToSeedSync(config.seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  console.log(`  Night key: ${toHexString(derivedKeys.unshielded).slice(0, 16)}...`);

  // Init wallet
  console.log('\n  Starting wallet...');
  const walletConfig: DefaultConfiguration = {
    networkId: networkConfig.networkId,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL(networkConfig.nodeRpc),
    provingServerUrl: new URL(networkConfig.proofServer),
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexerHttp,
      indexerWsUrl: networkConfig.indexerWs,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const unshieldedKeystore = createKeystore(derivedKeys.unshielded, networkConfig.networkId);

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(derivedKeys.shielded.keys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        derivedKeys.dust.key,
        ledgerSdk.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);

  // Sync wallet (long timeout — preprod WebSocket is flaky)
  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '300000', 10);
  console.log(`  Syncing wallet (timeout ${SYNC_TIMEOUT_MS / 1000}s)...`);
  try {
    await Promise.race([
      wallet.waitForSyncedState(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Sync timed out (${SYNC_TIMEOUT_MS / 1000}s)`)), SYNC_TIMEOUT_MS),
      ),
    ]);
    console.log('  Wallet synced\n');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timed out')) {
      console.warn(`  Warning: ${msg} — attempting transactions anyway\n`);
    } else {
      throw e;
    }
  }

  // Providers
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';
  const privateStateProvider = await levelPrivateStateProvider<
    typeof PRIVATE_STATE_KEY,
    EmptyPrivateState
  >({
    privateStoragePasswordProvider: () => privateStatePassword,
    accountId: 'deployer-musdc',
    privateStateStoreName: path.join(__dirname, '../.private-state-musdc'),
  });

  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexerHttp,
    networkConfig.indexerWs,
  );

  const managedDir = path.join(__dirname, '../managed/MidnightUSDC');
  const zkConfigProvider = new NodeZkConfigProvider(managedDir);
  const proofProvider = httpClientProofProvider(networkConfig.proofServer, zkConfigProvider);

  const walletProvider = {
    balanceTx: async (tx: any, ttl?: Date) => {
      const t0 = Date.now();
      console.log('    [balanceTx] Starting balanceUnboundTransaction...');
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: derivedKeys.shielded.keys,
          dustSecretKey: derivedKeys.dust.key,
        },
        {
          ttl: ttl || new Date(Date.now() + 10 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );
      console.log(`    [balanceTx] Balanced in ${((Date.now() - t0) / 1000).toFixed(1)}s, finalizing...`);
      const result = wallet.finalizeRecipe(recipe);
      console.log(`    [balanceTx] Finalized in ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
      return result;
    },
    getCoinPublicKey: () => derivedKeys.shielded.keys.coinPublicKey,
    getEncryptionPublicKey: () => derivedKeys.shielded.keys.encryptionPublicKey,
  };

  const midnightProvider = {
    submitTx: async (tx: ledgerSdk.FinalizedTransaction) => {
      const t0 = Date.now();
      console.log('    [submitTx] Submitting transaction...');
      const result = await wallet.submitTransaction(tx) as any;
      console.log(`    [submitTx] Confirmed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return result;
    },
  };

  // MidnightUSDC has no witnesses — empty object
  const emptyWitnesses = {} as Record<string, never>;

  const compiledContract = CompiledContract.make<Contract<EmptyPrivateState>, EmptyPrivateState>(
    'MidnightUSDC',
    Contract,
  ).pipe(
    CompiledContract.withWitnesses(emptyWitnesses),
    CompiledContract.withCompiledFileAssets(managedDir),
  );

  const providers = {
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
  };

  // Connect to already-deployed contract
  // NOTE: pass initialPrivateState so findDeployedContract doesn't require a pre-existing
  // private state entry. MidnightUSDC has no private state (empty record), so this is safe.
  console.log('  Connecting to deployed MidnightUSDC...');
  const contract = await findDeployedContract(providers as any, {
    compiledContract: compiledContract as any,
    contractAddress: config.contractAddress as unknown as ContractAddress,
    privateStateId: PRIVATE_STATE_KEY,
    initialPrivateState: {} as EmptyPrivateState,
  });
  console.log('  Connected!\n');

  try {
    // ===================================================================
    // STEP 1: Initialize
    // ===================================================================
    if (!config.skipInit) {
      console.log('[1/2] Initializing MidnightUSDC...');
      console.log('  Generating ZK proof (this may take several minutes)...');
      const initStart = Date.now();

      try {
        const initResult = await contract.callTx.initialize();
        console.log(`  Total initialize time: ${((Date.now() - initStart) / 1000).toFixed(1)}s`);
        if (String(initResult.public.status) !== TX_STATUS_SUCCESS) {
          throw new Error(`Initialize failed: ${initResult.public.status}`);
        }
        console.log(`  Initialized!`);
        console.log(`    TX Hash: ${initResult.public.txHash}`);
        console.log(`    Block:   ${initResult.public.blockHeight}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Already initialized') || msg.includes('already initialized')) {
          console.log('  Already initialized — skipping\n');
        } else {
          throw err;
        }
      }
    } else {
      console.log('[1/2] Skipping initialization (--skip-init)\n');
    }

    // ===================================================================
    // STEP 2: Mint initial supply
    // ===================================================================
    if (!config.skipMint) {
      console.log('[2/2] Minting initial mUSDC supply...');
      console.log(`  Amount: ${MINT_AMOUNT} raw units (= ${Number(MINT_AMOUNT) / 1_000_000} mUSDC)`);

      const depositorHex = unshieldedKeystore.getAddress();
      const toBytes = new Uint8Array(Buffer.from(depositorHex, 'hex'));
      if (toBytes.length !== 32) {
        throw new Error(`Expected 32-byte address, got ${toBytes.length}`);
      }
      console.log(`  To: ${depositorHex.slice(0, 16)}...`);
      console.log('  Generating ZK proof (this may take several minutes)...');

      const mintResult = await contract.callTx.mint(toBytes, MINT_AMOUNT);
      if (String(mintResult.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`Mint failed: ${mintResult.public.status}`);
      }
      console.log(`  Minted ${MINT_AMOUNT} units to deployer`);
      console.log(`    TX Hash: ${mintResult.public.txHash}`);
      console.log(`    Block:   ${mintResult.public.blockHeight}\n`);

      // Save deployment info
      const deploymentsDir = path.join(__dirname, '../deployments');
      if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

      const info = {
        contractName: 'MidnightUSDC',
        contractAddress: config.contractAddress,
        network: config.network,
        deployedAt: new Date().toISOString(),
        initialized: true,
        mintedTo: depositorHex,
        mintedAmount: MINT_AMOUNT.toString(),
      };

      const outFile = path.join(deploymentsDir, 'musdc-preprod.json');
      fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
      console.log(`  Saved deployment info to: ${outFile}`);
    } else {
      console.log('[2/2] Skipping mint (--skip-mint)\n');
    }
  } finally {
    await wallet.stop();
  }

  console.log('\n========================================');
  console.log('  MidnightUSDC init+mint complete!');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
