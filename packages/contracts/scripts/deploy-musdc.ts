/**
 * MidnightUSDC Token Contract — Deploy + Initialize + Mint
 *
 * Deploys the MidnightUSDC token contract to Midnight preprod, calls
 * initialize(), then mints an initial supply to the deployer wallet.
 *
 * Prerequisites:
 *   1. Proof server running: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
 *   2. Contract compiled: /Users/samya/.local/bin/compact compile src/MidnightUSDC.compact managed/MidnightUSDC
 *   3. DEPLOYER_SEED_PHRASE env var set
 *
 * Usage:
 *   DEPLOYER_SEED_PHRASE="..." pnpm --filter @midswap/contracts deploy:musdc
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';
import { Contract } from '../managed/MidnightUSDC/contract/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
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
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';

// ---------------------------------------------------------------------------
// Network
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
// Wallet key derivation (identical to deploy-automated.ts)
// ---------------------------------------------------------------------------

type EmptyPrivateState = Record<string, never>;
const PRIVATE_STATE_KEY = 'musdcPrivateState';
const TX_STATUS_SUCCESS = 'SucceedEntirely';

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
// Proof server health
// ---------------------------------------------------------------------------

async function checkProofServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok' || res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const networkConfig = NETWORKS.preprod;

  console.log('\n========================================');
  console.log('  MidnightUSDC — Deploy + Init + Mint');
  console.log('========================================\n');

  // 1. Seed phrase
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) {
    console.error('DEPLOYER_SEED_PHRASE not set');
    process.exit(1);
  }
  if (!validateSeedPhrase(seedPhrase)) throw new Error('Invalid seed phrase');

  // 2. Network ID
  setNetworkId(networkConfig.networkId);
  console.log(`  Network: ${networkConfig.networkId}`);

  // 3. Proof server
  console.log('  Checking proof server...');
  if (!(await checkProofServer(networkConfig.proofServer))) {
    throw new Error('Proof server not running at ' + networkConfig.proofServer);
  }
  console.log('  Proof server OK\n');

  // 4. Compiled artifacts check
  const managedDir = path.join(__dirname, '../managed/MidnightUSDC');
  if (!fs.existsSync(path.join(managedDir, 'contract/index.js'))) {
    throw new Error('MidnightUSDC not compiled — run compact compile first');
  }

  // 5. Derive keys
  const seedBytes = mnemonicToSeedSync(seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  console.log(`  Night key: ${toHexString(derivedKeys.unshielded).slice(0, 16)}...`);

  // 6. Init wallet
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

  // 7. Sync wallet
  console.log('  Syncing wallet...');
  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '120000', 10);
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
      console.warn(`  ⚠ ${msg} — attempting deploy anyway\n`);
    } else {
      throw e;
    }
  }

  // 8. Providers
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

  const providers = {
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
  };

  // MidnightUSDC has no witnesses — pass empty object
  const emptyWitnesses = {} as Record<string, never>;

  const compiledContract = CompiledContract.make<Contract<EmptyPrivateState>, EmptyPrivateState>(
    'MidnightUSDC',
    Contract,
  ).pipe(
    CompiledContract.withWitnesses(emptyWitnesses),
    CompiledContract.withCompiledFileAssets(managedDir),
  );

  // ===================================================================
  // STEP A: Deploy
  // ===================================================================
  console.log('[1/3] Deploying MidnightUSDC...');
  console.log('  This may take a few minutes while ZK proofs are generated...');

  const deployedContract = await deployContract(providers as any, {
    compiledContract: compiledContract as any,
    privateStateId: PRIVATE_STATE_KEY,
    initialPrivateState: {} as EmptyPrivateState,
    args: [] as const,
  });

  if (deployedContract.deployTxData.public.status !== TX_STATUS_SUCCESS) {
    throw new Error(`Deploy failed: ${deployedContract.deployTxData.public.status}`);
  }

  const contractAddress: string = deployedContract.deployTxData.public.contractAddress as unknown as string;
  const deployTxHash = deployedContract.deployTxData.public.txHash;
  const blockHeight = deployedContract.deployTxData.public.blockHeight || 0;

  console.log(`  ✓ Deployed!`);
  console.log(`    Address:  ${contractAddress}`);
  console.log(`    TX Hash:  ${deployTxHash}`);
  console.log(`    Block:    ${blockHeight}\n`);

  // ===================================================================
  // STEP B: Initialize
  // ===================================================================
  console.log('[2/3] Initializing MidnightUSDC...');

  try {
    const initResult = await deployedContract.callTx.initialize();
    if (String(initResult.public.status) !== TX_STATUS_SUCCESS) {
      throw new Error(`Initialize failed: ${initResult.public.status}`);
    }
    console.log(`  ✓ Initialized — TX: ${initResult.public.txHash}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Already initialized')) {
      console.log('  Already initialized — skipping\n');
    } else {
      throw err;
    }
  }

  // ===================================================================
  // STEP C: Mint initial supply to deployer
  // ===================================================================
  console.log('[3/3] Minting initial mUSDC supply...');

  // Use the unshielded address (32 bytes) as the "to" identity, same as
  // depositorBytes in init-pool.ts and test-transactions.ts
  const depositorHex = unshieldedKeystore.getAddress();
  const toBytes = new Uint8Array(Buffer.from(depositorHex, 'hex'));
  if (toBytes.length !== 32) {
    throw new Error(`Expected 32-byte address, got ${toBytes.length}`);
  }

  // Mint 100,000,000 raw units (= 100 mUSDC at 6 decimals)
  const MINT_AMOUNT = 100_000_000n;

  const mintResult = await deployedContract.callTx.mint(toBytes, MINT_AMOUNT);
  if (String(mintResult.public.status) !== TX_STATUS_SUCCESS) {
    throw new Error(`Mint failed: ${mintResult.public.status}`);
  }
  console.log(`  ✓ Minted ${MINT_AMOUNT} units to deployer`);
  console.log(`    TX: ${mintResult.public.txHash}\n`);

  // ===================================================================
  // Save deployment info
  // ===================================================================
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const info = {
    contractName: 'MidnightUSDC',
    contractAddress,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
    txHash: deployTxHash,
    blockHeight,
    mintedTo: depositorHex,
    mintedAmount: MINT_AMOUNT.toString(),
  };

  const outFile = path.join(deploymentsDir, 'musdc-preprod.json');
  fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
  console.log(`Saved to: ${outFile}`);

  await wallet.stop();

  console.log('\n========================================');
  console.log('  MidnightUSDC deployment complete!');
  console.log('========================================');
  console.log(`  Address: ${contractAddress}`);
  console.log(`  Minted:  ${MINT_AMOUNT} to deployer`);
  console.log('');
  console.log('Next: update packages/sdk/src/types.ts');
  console.log(`  mUSDC.address → '${contractAddress}'`);
  console.log('');
}

main().catch((err) => {
  console.error('\n✗ MidnightUSDC deployment failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
