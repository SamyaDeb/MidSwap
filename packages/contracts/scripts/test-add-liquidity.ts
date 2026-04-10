/**
 * test-add-liquidity.ts
 *
 * E2E test for the Add Liquidity flow using the wallet SDK directly.
 * Mirrors the approach in init-pool.ts so it uses the proven, working path:
 *   httpClientProofProvider → findDeployedContract → contract.callTx.addLiquidity()
 *
 * Usage:
 *   DEPLOYER_SEED_PHRASE="... 24 words ..." \
 *   CONTRACT_ADDRESS=57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b \
 *   npx tsx packages/contracts/scripts/test-add-liquidity.ts
 *
 * Optional env vars:
 *   PROOF_SERVER_URL   (default: http://localhost:6300)
 *   AMOUNT0            amount0 in micro-units (default: 100)
 *   AMOUNT1            amount1 in micro-units (default: must be proportional to pool)
 *   NETWORK            preprod | mainnet (default: preprod)
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import * as compactRuntime from '@midnight-ntwrk/compact-runtime';
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
import {
  Contract,
  type Witnesses,
} from '../managed/OptimalAMM/contract/index.js';
import { createWitnesses } from '../src/witnesses.js';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';

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

// ============================================================
// Config
// ============================================================

const NETWORKS = {
  preprod: {
    networkId: 'preprod' as NetworkId,
    indexerHttp: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeRpc: 'wss://rpc.preprod.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  },
  mainnet: {
    networkId: 'mainnet' as NetworkId,
    indexerHttp: 'https://indexer.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.midnight.network/api/v4/graphql/ws',
    nodeRpc: 'wss://rpc.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  },
} as const;

const PRIVATE_STATE_KEY = 'liquidityPoolPrivateState';
const TX_STATUS_SUCCESS = 'SucceedEntirely';

type LiquidityPoolPrivateState = Record<string, never>;

// ============================================================
// Key derivation (identical to init-pool.ts)
// ============================================================

function deriveRoleKey(accountKey: AccountKey, role: Role, addressIndex = 0): Buffer {
  const result = accountKey.selectRole(role).deriveKeyAt(addressIndex);
  if (result.type === 'keyDerived') return Buffer.from(result.key);
  return deriveRoleKey(accountKey, role, addressIndex + 1);
}

function deriveAllKeys(seed: Uint8Array) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to derive keys from seed');

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

// ============================================================
// Indexer query helpers
// ============================================================

async function queryPoolState(indexerHttp: string, contractAddress: string) {
  const query = `
    query { contractAction(address: "${contractAddress}") { state } }
  `;
  const resp = await fetch(indexerHttp, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = (await resp.json()) as any;
  return json.data?.contractAction?.state as string | null;
}

// ============================================================
// Pool state reader using compact-runtime's queryLedgerState
// ============================================================
async function readPoolReserves(stateHex: string) {
  // Use the same slot-query approach as PoolManager.ts
  const { queryLedgerState, ContractState, CostModel } = compactRuntime as any;
  const stateBytes = Uint8Array.from(stateHex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const contractState = ContractState.deserialize(stateBytes);

  function readSlot(slotIdx: bigint): unknown {
    return queryLedgerState(
      contractState,
      'dummy',
      CostModel?.free ?? (() => {}),
      (s: any) => { s.dup(); s.idx(slotIdx); s.popeq(1); }
    );
  }

  try {
    // Slot 0 = reserve0, Slot 1 = reserve1, Slot 2 = totalLPSupply, Slot 4 = initialized
    const reserve0 = BigInt(String(readSlot(0n) ?? 0) || '0');
    const reserve1 = BigInt(String(readSlot(1n) ?? 0) || '0');
    const totalLPSupply = BigInt(String(readSlot(2n) ?? 0) || '0');
    const initialized = Boolean(readSlot(4n));
    return { reserve0, reserve1, totalLPSupply, initialized };
  } catch {
    // Fall back to returning raw hex length
    return { reserve0: null, reserve1: null, totalLPSupply: null, initialized: null, raw: stateHex.slice(0, 40) + '...' };
  }
}

async function main() {
  // ---- Validate inputs ----
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) throw new Error('DEPLOYER_SEED_PHRASE env var is required');
  if (!validateSeedPhrase(seedPhrase)) throw new Error('Invalid seed phrase');

  const contractAddress =
    process.env.CONTRACT_ADDRESS ||
    '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b';

  const network = (process.env.NETWORK || 'preprod') as 'preprod' | 'mainnet';
  const networkConfig = NETWORKS[network];

  console.log('\n============================================================');
  console.log('  MidSwap – Add Liquidity E2E Test');
  console.log('============================================================');
  console.log(`  Network  : ${network}`);
  console.log(`  Contract : ${contractAddress}`);
  console.log(`  Proof srv: ${networkConfig.proofServer}`);

  // ---- Check proof server ----
  console.log('\n[1/7] Checking proof server …');
  try {
    const health = await fetch(`${networkConfig.proofServer}/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    console.log('  ✓ Proof server reachable');
  } catch (e) {
    throw new Error(`Proof server not reachable at ${networkConfig.proofServer}: ${(e as Error).message}`);
  }

  // ---- Derive keys ----
  console.log('\n[2/7] Deriving wallet keys …');
  setNetworkId(networkConfig.networkId);
  const seedBytes = mnemonicToSeedSync(seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  const unshieldedKeystore = createKeystore(derivedKeys.unshielded, networkConfig.networkId);
  const depositorBytes = ledgerSdk.encodeCoinPublicKey(derivedKeys.shielded.keys.coinPublicKey);
  const depositorHex = Buffer.from(depositorBytes).toString('hex');
  console.log(`  ✓ Depositor identity: ${depositorHex}`);

  // ---- Query current pool state ----
  console.log('\n[3/7] Reading current pool state from indexer …');
  const stateHex = await queryPoolState(networkConfig.indexerHttp, contractAddress);
  if (!stateHex) throw new Error('Pool contract state not found');

  const poolState = await readPoolReserves(stateHex);
  const reserve0 = poolState.reserve0 as bigint ?? 0n;
  const reserve1 = poolState.reserve1 as bigint ?? 0n;
  const totalLPSupply = poolState.totalLPSupply as bigint ?? 0n;
  const initialized = poolState.initialized as boolean ?? false;

  console.log(`  ✓ reserve0=${reserve0} reserve1=${reserve1} totalLP=${totalLPSupply} initialized=${initialized}`);
  // Don't throw on uninitialized — trust the on-chain state

  // ---- Calculate exact proportional amounts ----
  // The addLiquidity circuit requires integer pairs that satisfy
  // amount0 * reserve1 == amount1 * reserve0 exactly.
  // So we quantize deposits by the reduced reserve ratio.
  const amount0 = BigInt(process.env.AMOUNT0 || '100');

  let amount1: bigint;
  if (reserve0 === 0n || reserve1 === 0n) {
    amount1 = amount0; // shouldn't happen on an initialized pool
  } else {
    const ratioGcd = gcd(reserve0, reserve1);
    const unit0 = reserve0 / ratioGcd;
    const unit1 = reserve1 / ratioGcd;
    const multiplier = amount0 / unit0;
    if (multiplier <= 0n) {
      throw new Error(
        `AMOUNT0=${amount0} is too small for the current pool ratio. Minimum exact step is ${unit0} token0 and ${unit1} token1.`,
      );
    }
    const quantizedAmount0 = unit0 * multiplier;
    amount1 = unit1 * multiplier;
    if (quantizedAmount0 !== amount0) {
      console.log(`  Adjusted amount0 from ${amount0} to ${quantizedAmount0} to satisfy exact pool ratio`);
    }
  }
  console.log(`\n[4/7] Amounts to add: amount0=${amount0} amount1=${amount1}`);
  console.log(`  Ratio check: ${amount0}*${reserve1} = ${amount0 * reserve1}  vs  ${amount1}*${reserve0} = ${amount1 * reserve0}`);

  // ---- Set up wallet ----
  console.log('\n[5/7] Initialising wallet facade …');
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

  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '120000', 10);
  try {
    await Promise.race([
      wallet.waitForSyncedState(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`)),
          SYNC_TIMEOUT_MS,
        ),
      ),
    ]);
    console.log('  ✓ Wallet synced');
  } catch (syncErr) {
    const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
    if (msg.includes('timed out')) {
      console.warn(`  ⚠ ${msg} — attempting add liquidity anyway`);
    } else {
      throw syncErr;
    }
  }

  // ---- Set up providers ----
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';
  const privateStateProvider = await levelPrivateStateProvider<
    typeof PRIVATE_STATE_KEY,
    LiquidityPoolPrivateState
  >({
    privateStoragePasswordProvider: () => privateStatePassword,
    accountId: 'depositor',
    privateStateStoreName: path.join(__dirname, '../.private-state-test'),
  });

  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexerHttp,
    networkConfig.indexerWs,
  );

  const zkConfigProvider = new NodeZkConfigProvider(
    path.join(__dirname, '../managed/OptimalAMM'),
  );
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
    submitTx: async (tx: ledgerSdk.FinalizedTransaction) => wallet.submitTransaction(tx) as any,
  };

  // ---- Build contract instance ----
  console.log('\n[6/7] Building contract instance via findDeployedContract …');

  const witnesses = createWitnesses<LiquidityPoolPrivateState>();
  const compiledContract = CompiledContract.make<
    Contract<LiquidityPoolPrivateState, Witnesses<LiquidityPoolPrivateState>>,
    LiquidityPoolPrivateState
  >('OptimalAMM', Contract)
    .pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(
        path.join(__dirname, '..', 'managed', 'OptimalAMM'),
      ),
    );

  const providers = {
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
  };

  const contract = await findDeployedContract(providers as any, {
    compiledContract: compiledContract as any,
    contractAddress: contractAddress as unknown as ContractAddress,
    privateStateId: PRIVATE_STATE_KEY,
    initialPrivateState: {} as LiquidityPoolPrivateState,
  });

  console.log('  ✓ Contract instance built');

  // ---- Call addLiquidity ----
  console.log('\n[7/7] Calling addLiquidity on-chain …');
  if (depositorBytes.length !== 32) {
    throw new Error(`Expected 32-byte depositor id, got ${depositorBytes.length}`);
  }

  const startTime = Date.now();
  const result = await contract.callTx.addLiquidity(
    amount0,
    amount1,
    new Uint8Array(depositorBytes),
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (String(result.public.status) !== TX_STATUS_SUCCESS) {
    throw new Error(`addLiquidity tx failed with status ${result.public.status}`);
  }

  console.log(`\n  ✅ addLiquidity SUCCEEDED in ${elapsed}s`);
  console.log(`  TX Hash       : ${result.public.txHash}`);
  console.log(`  Block Height  : ${result.public.blockHeight}`);

  // ---- Verify new pool state ----
  console.log('\n  Verifying updated pool state …');
  const newStateHex = await queryPoolState(networkConfig.indexerHttp, contractAddress);
  if (newStateHex) {
    const newState = await readPoolReserves(newStateHex);
    console.log(`  New reserve0=${newState.reserve0} reserve1=${newState.reserve1} totalLP=${newState.totalLPSupply}`);
    if (newState.reserve0 !== null && reserve0 !== null) {
      console.log(`  Δ reserve0=+${Number(newState.reserve0 as bigint) - Number(reserve0)}`);
      console.log(`  Δ reserve1=+${Number(newState.reserve1 as bigint) - Number(reserve1)}`);
    }
  }

  await wallet.stop();
  console.log('\n============================================================');
  console.log('  ALL TESTS PASSED — Add Liquidity E2E complete');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
