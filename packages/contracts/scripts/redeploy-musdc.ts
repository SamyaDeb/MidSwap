/**
 * MidnightUSDC — Full Redeploy + Initialize + Mint
 *
 * This script deploys a FRESH MidnightUSDC contract, then immediately calls
 * initialize() and mint() using the deployedContract reference returned by
 * deployContract(). This avoids the balanceUnboundTransaction deadlock that
 * occurs when using findDeployedContract() in a re-connect scenario.
 *
 * Root cause of the deadlock (for reference):
 *   When findDeployedContract() reconnects to an existing contract, callTx.*
 *   calls wallet.balanceUnboundTransaction(), which internally calls
 *   dust.balanceTransactions(), which calls Effect.runPromise() on an Effect
 *   containing SubscriptionRef.modifyEffect(). The SubscriptionRef was created
 *   inside Effect.runSync() (in WalletBuilder.startFirst), so the new
 *   Effect.runPromise() runtime cannot acquire the fiber lock → deadlock.
 *   deployContract() avoids this by running everything within the same internal
 *   Effect fiber context.
 *
 * After running this script, update packages/sdk/src/types.ts with the new address.
 *
 * Prerequisites:
 *   1. Proof server running: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
 *   2. Contract compiled: compact compile src/MidnightUSDC.compact managed/MidnightUSDC
 *   3. Wallet funded with tDUST
 *
 * Usage:
 *   DEPLOYER_SEED_PHRASE="..." pnpm --filter @midswap/contracts redeploy:musdc
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

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';
import { Contract } from '../managed/MidnightUSDC/contract/index.js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  InMemoryTransactionHistoryStorage,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

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
// Types / constants
// ---------------------------------------------------------------------------

type EmptyPrivateState = Record<string, never>;
const PRIVATE_STATE_KEY = 'musdcPrivateState';
const TX_STATUS_SUCCESS = 'SucceedEntirely';
const MINT_AMOUNT = 100_000_000n; // 100 mUSDC at 6 decimals

// ---------------------------------------------------------------------------
// Key derivation
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
    shielded: { seed: shieldedSeed, keys: ledger.ZswapSecretKeys.fromSeed(shieldedSeed) },
    dust: { seed: dustSeed, key: ledger.DustSecretKey.fromSeed(dustSeed) },
    unshielded: unshieldedKey,
  };
}

// ---------------------------------------------------------------------------
// Proof server health check
// ---------------------------------------------------------------------------

async function checkProofServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { headers: { Accept: 'application/json' } });
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok' || res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const networkConfig = NETWORKS.preprod;

  console.log('\n========================================');
  console.log('  MidnightUSDC — Redeploy + Init + Mint');
  console.log('========================================\n');

  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) {
    console.error('DEPLOYER_SEED_PHRASE env var is required');
    process.exit(1);
  }
  if (!validateSeedPhrase(seedPhrase)) throw new Error('Invalid seed phrase');

  setNetworkId(networkConfig.networkId);
  console.log(`  Network: ${networkConfig.networkId}`);

  // Proof server check
  console.log('  Checking proof server...');
  if (!(await checkProofServer(networkConfig.proofServer))) {
    throw new Error('Proof server not running at ' + networkConfig.proofServer);
  }
  console.log('  Proof server OK\n');

  // Compiled artifacts check
  const managedDir = path.join(__dirname, '../managed/MidnightUSDC');
  if (!fs.existsSync(path.join(managedDir, 'contract/index.js'))) {
    throw new Error('MidnightUSDC not compiled — run: compact compile src/MidnightUSDC.compact managed/MidnightUSDC');
  }

  // Derive keys
  const seedBytes = mnemonicToSeedSync(seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  console.log(`  Night key: ${toHexString(derivedKeys.unshielded).slice(0, 16)}...`);

  // Init wallet
  console.log('  Starting wallet...');
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
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);
  console.log('  Wallet started\n');

  // Sync wallet
  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '180000', 10);
  console.log(`  Syncing wallet (timeout ${SYNC_TIMEOUT_MS / 1000}s)...`);
  try {
    const synced = await Promise.race([
      wallet.waitForSyncedState(),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error(`Sync timed out (${SYNC_TIMEOUT_MS / 1000}s)`)),
          SYNC_TIMEOUT_MS,
        ),
      ),
    ]);
    console.log(`  Wallet synced. Dust coins: ${(synced as any).dust?.totalCoins}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timed out')) {
      console.warn(`  Warning: ${msg} — attempting deploy anyway\n`);
    } else {
      throw e;
    }
  }

  // Providers
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';

  // Use a fresh private-state store for the new deployment
  const privateStateProvider = await levelPrivateStateProvider<
    typeof PRIVATE_STATE_KEY,
    EmptyPrivateState
  >({
    privateStoragePasswordProvider: () => privateStatePassword,
    accountId: 'deployer-musdc-v2',
    privateStateStoreName: path.join(__dirname, '../.private-state-musdc-v2'),
  });

  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexerHttp,
    networkConfig.indexerWs,
  );
  const zkConfigProvider = new NodeZkConfigProvider(managedDir);
  const proofProvider = httpClientProofProvider(networkConfig.proofServer, zkConfigProvider);

  const walletProvider = {
    balanceTx: async (tx: any, ttl?: Date) => {
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
      return wallet.finalizeRecipe(recipe);
    },
    getCoinPublicKey: () => derivedKeys.shielded.keys.coinPublicKey,
    getEncryptionPublicKey: () => derivedKeys.shielded.keys.encryptionPublicKey,
  };

  const midnightProvider = {
    submitTx: async (tx: ledger.FinalizedTransaction) => wallet.submitTransaction(tx) as any,
  };

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

  // ===========================================================================
  // STEP 1: Deploy
  // ===========================================================================
  console.log('[1/3] Deploying MidnightUSDC...');
  console.log('  Generating ZK proofs (this may take a few minutes)...');

  const deployedContract = await deployContract(providers as any, {
    compiledContract: compiledContract as any,
    privateStateId: PRIVATE_STATE_KEY,
    initialPrivateState: {} as EmptyPrivateState,
    args: [] as const,
  });

  if (String(deployedContract.deployTxData.public.status) !== TX_STATUS_SUCCESS) {
    throw new Error(`Deploy failed: ${deployedContract.deployTxData.public.status}`);
  }

  const contractAddress = String(deployedContract.deployTxData.public.contractAddress);
  const deployTxHash = deployedContract.deployTxData.public.txHash;
  const deployBlock = deployedContract.deployTxData.public.blockHeight || 0;

  console.log(`  Deployed!`);
  console.log(`    Address: ${contractAddress}`);
  console.log(`    TX Hash: ${deployTxHash}`);
  console.log(`    Block:   ${deployBlock}\n`);

  // ===========================================================================
  // STEP 2: Initialize
  //   Uses deployedContract.callTx (same Effect fiber context as deployContract)
  // ===========================================================================
  console.log('[2/3] Initializing MidnightUSDC...');

  let initTxHash = '';
  let initBlock = 0;
  try {
    const initResult = await deployedContract.callTx.initialize();
    if (String(initResult.public.status) !== TX_STATUS_SUCCESS) {
      throw new Error(`Initialize failed: ${initResult.public.status}`);
    }
    initTxHash = initResult.public.txHash;
    initBlock = initResult.public.blockHeight || 0;
    console.log(`  Initialized!`);
    console.log(`    TX Hash: ${initTxHash}`);
    console.log(`    Block:   ${initBlock}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Already initialized') || msg.includes('already initialized')) {
      console.log('  Already initialized — skipping\n');
    } else {
      await wallet.stop();
      throw err;
    }
  }

  // ===========================================================================
  // STEP 3: Mint initial supply
  // ===========================================================================
  console.log('[3/3] Minting initial mUSDC supply...');
  console.log(`  Amount: ${MINT_AMOUNT} raw units (= ${Number(MINT_AMOUNT) / 1_000_000} mUSDC)`);

  const depositorHex = unshieldedKeystore.getAddress();
  const toBytes = new Uint8Array(Buffer.from(depositorHex, 'hex'));
  if (toBytes.length !== 32) {
    await wallet.stop();
    throw new Error(`Expected 32-byte address, got ${toBytes.length}`);
  }
  console.log(`  To: ${depositorHex.slice(0, 16)}...`);

  const mintResult = await deployedContract.callTx.mint(toBytes, MINT_AMOUNT);
  if (String(mintResult.public.status) !== TX_STATUS_SUCCESS) {
    await wallet.stop();
    throw new Error(`Mint failed: ${mintResult.public.status}`);
  }
  const mintTxHash = mintResult.public.txHash;
  const mintBlock = mintResult.public.blockHeight || 0;

  console.log(`  Minted ${MINT_AMOUNT} units to deployer`);
  console.log(`    TX Hash: ${mintTxHash}`);
  console.log(`    Block:   ${mintBlock}\n`);

  await wallet.stop();

  // ===========================================================================
  // Save deployment info
  // ===========================================================================
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const info = {
    contractName: 'MidnightUSDC',
    contractAddress,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
    deployTxHash,
    deployBlock,
    initialized: true,
    initTxHash,
    initBlock,
    mintedTo: depositorHex,
    mintedAmount: MINT_AMOUNT.toString(),
    mintTxHash,
    mintBlock,
  };

  const outFile = path.join(deploymentsDir, 'musdc-preprod.json');
  fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
  console.log(`  Saved deployment info to: ${outFile}`);

  console.log('\n========================================');
  console.log('  MidnightUSDC deploy + init + mint complete!');
  console.log('========================================\n');
  console.log(`  New contract address: ${contractAddress}\n`);
  console.log('  IMPORTANT: Update packages/sdk/src/types.ts:');
  console.log(`    mUSDC.address → '${contractAddress}'\n`);
  console.log('  Also update .env.local if needed.\n');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
