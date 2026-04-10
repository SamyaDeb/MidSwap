/**
 * test-pool-flow.ts
 *
 * Full end-to-end pool lifecycle test for MidSwap on Midnight Preprod.
 * Tests: deploy (optional) → initialize → addLiquidity → swap →
 *        swap reverse → removeLiquidity → verify final state
 *
 * Usage (existing pool — skip deploy):
 *   DEPLOYER_SEED_PHRASE="word1 word2 ..." \
 *   POOL_ADDRESS=57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b \
 *   SKIP_INIT=1 \
 *   SYNC_TIMEOUT_MS=600000 \
 *   ../../node_modules/.pnpm/node_modules/.bin/tsx scripts/test-pool-flow.ts
 *
 * Usage (fresh deploy + full lifecycle):
 *   DEPLOYER_SEED_PHRASE="word1 word2 ..." \
 *   SYNC_TIMEOUT_MS=600000 \
 *   ../../node_modules/.pnpm/node_modules/.bin/tsx scripts/test-pool-flow.ts
 *
 * Optional env vars:
 *   POOL_ADDRESS          existing pool to skip deploy (default: deploy fresh)
 *   SKIP_INIT             '1' to skip initialize even if pool shows uninitialized (default: 0)
 *   INIT_AMOUNT0          raw units for initialize side0 (default: 10000)
 *   INIT_AMOUNT1          raw units for initialize side1 (default: 10000)
 *   LP_AMOUNT0            raw units for addLiquidity side0 (default: 1000)
 *   LP_AMOUNT1            raw units for addLiquidity side1 — auto-computed proportionally if omitted
 *   SWAP_AMOUNT_IN        raw units for swap token0→token1 (default: 500)
 *   FEE_BPS               fee in basis points for init (default: 30)
 *   NETWORK               preprod | mainnet (default: preprod)
 *   PROOF_SERVER_URL      (default: http://localhost:6300)
 *   PRIVATE_STATE_PASSWORD (default: MidSwap#Preprod2026)
 *   SYNC_TIMEOUT_MS       ms to wait for wallet sync (default: 600000 — 300s is NOT enough)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

// Midnight SDK proof/tx data can contain BigInt values that JSON.stringify would reject.
// This polyfill makes BigInt serializable as a numeric string.
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

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
import { findDeployedContract, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, type Witnesses } from '../managed/OptimalAMM/contract/index.js';
import { createWitnesses } from '../src/witnesses.js';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';

// ─────────────────────────────────────────────
// Network config
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function banner(text: string) {
  const line = '═'.repeat(55);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function step(n: number, total: number, text: string) {
  console.log(`\n[${n}/${total}] ${text}`);
}

function fmt(label: string, value: string | bigint | number | boolean) {
  console.log(`    ${label.padEnd(30)} ${value}`);
}

function pass(label: string) { console.log(`  ✅ ${label}`); }

function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ❌ ${label}: ${msg}`);
}

/** Constant-product getAmountOut: fee = feeBps / 10000 */
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  const fee = 10000n - feeBps;
  const amountWithFee = amountIn * fee;
  const numerator = amountWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountWithFee;
  return numerator / denominator;
}

// ─────────────────────────────────────────────
// Pool state
// ─────────────────────────────────────────────
interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  totalLPSupply: bigint;
  feeBps: bigint;
  initialized: boolean;
}

async function queryPoolState(indexerHttp: string, contractAddress: string): Promise<PoolState> {
  const resp = await fetch(indexerHttp, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ contractAction(address: "${contractAddress}") { state } }`,
    }),
  });
  if (!resp.ok) throw new Error(`Indexer HTTP error: ${resp.status}`);
  const json = (await resp.json()) as any;
  if (json.errors?.length) throw new Error(`Indexer error: ${json.errors[0].message}`);
  const stateHex: string = json.data.contractAction.state;
  const stateBytes = Buffer.from(stateHex, 'hex');

  const cs = compactRuntime.ContractState.deserialize(stateBytes);
  const chargedState = cs.data;

  const context = {
    currentQueryContext: new (compactRuntime as any).QueryContext(
      chargedState,
      (compactRuntime as any).dummyContractAddress()
    ),
    costModel: (compactRuntime as any).CostModel.initialCostModel(),
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: [],
  };

  const u64 = new (compactRuntime as any).CompactTypeUnsignedInteger(18446744073709551615n, 8);
  const bool = (compactRuntime as any).CompactTypeBoolean;
  const u16 = new (compactRuntime as any).CompactTypeUnsignedInteger(65535n, 2);
  const u8 = new (compactRuntime as any).CompactTypeUnsignedInteger(255n, 1);

  function readSlot(slotIdx: number, descriptor: any): any {
    return descriptor.fromValue(
      (compactRuntime as any).queryLedgerState(context, partialProofData, [
        { dup: { n: 0 } },
        {
          idx: {
            cached: false,
            pushPath: false,
            path: [{
              tag: 'value',
              value: { value: u8.toValue(BigInt(slotIdx)), alignment: u8.alignment() },
            }],
          },
        },
        { popeq: { cached: false, result: undefined } },
      ]).value
    );
  }

  return {
    reserve0:      readSlot(0, u64),
    reserve1:      readSlot(1, u64),
    totalLPSupply: readSlot(2, u64),
    initialized:   readSlot(4, bool),
    feeBps:        readSlot(5, u16),
  };
}

// ─────────────────────────────────────────────
// Key derivation (mirrors test-transactions.ts)
// ─────────────────────────────────────────────
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
  const dustSeed     = deriveRoleKey(account, Roles.Dust);
  const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);
  hdWallet.hdWallet.clear();
  return {
    shielded:   { seed: shieldedSeed, keys: ledgerSdk.ZswapSecretKeys.fromSeed(shieldedSeed) },
    dust:       { seed: dustSeed, key: ledgerSdk.DustSecretKey.fromSeed(dustSeed) },
    unshielded: unshieldedKey,
  };
}

// ─────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────
let passed = 0;
let failed_ = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  console.log(`\n[TEST] ${name}`);
  try {
    await fn();
    pass(name);
    passed++;
    return true;
  } catch (err) {
    fail(name, err);
    if (err instanceof Error && err.stack) {
      console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n         ')}`);
    }
    failed_++;
    return false;
  }
}

// ─────────────────────────────────────────────
// formatAddress helper (mirrors deploy-automated.ts)
// ─────────────────────────────────────────────
function formatAddress(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as any;
    if (typeof v.asString === 'function') return v.asString();
    if (typeof v.hexString === 'string') return v.hexString;
    const s = v.toString?.();
    if (s && s !== '[object Object]') return s;
  }
  return String(value);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  // ── Parse environment ──────────────────────────────────────────────
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) throw new Error('DEPLOYER_SEED_PHRASE env var is required');
  if (!validateSeedPhrase(seedPhrase)) throw new Error('Invalid seed phrase (use BIP39 12/24 words)');

  const network = (process.env.NETWORK || 'preprod') as 'preprod' | 'mainnet';
  const networkConfig = NETWORKS[network];

  const existingPoolAddress = process.env.POOL_ADDRESS || null;
  const skipInit            = process.env.SKIP_INIT === '1';
  const SYNC_TIMEOUT_MS     = parseInt(process.env.SYNC_TIMEOUT_MS || '600000', 10);
  const initAmount0         = BigInt(process.env.INIT_AMOUNT0 || '10000');
  const initAmount1         = BigInt(process.env.INIT_AMOUNT1 || '10000');
  const lpAmount0           = BigInt(process.env.LP_AMOUNT0   || '1000');
  const feeBps              = BigInt(process.env.FEE_BPS      || '30');
  const swapAmountIn        = BigInt(process.env.SWAP_AMOUNT_IN || '500');

  // ── Network ID must be set before any SDK calls ────────────────────
  setNetworkId(networkConfig.networkId);

  banner('MidSwap Pool Flow E2E Test');
  fmt('Network:', network);
  fmt('Existing pool:', existingPoolAddress ?? '(will deploy fresh)');
  fmt('Skip init:', String(skipInit));
  fmt('INIT amounts:', `${initAmount0} / ${initAmount1}`);
  fmt('LP amounts:', `${lpAmount0} / (auto-proportional)`);
  fmt('Swap amount in:', swapAmountIn.toString());
  fmt('feeBps:', feeBps.toString());
  fmt('Sync timeout:', `${SYNC_TIMEOUT_MS / 1000}s`);

  // ── Derive keys ────────────────────────────────────────────────────
  const seedBytes   = mnemonicToSeedSync(seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  const unshieldedKeystore = createKeystore(derivedKeys.unshielded, networkConfig.networkId);
  const depositorHex = unshieldedKeystore.getAddress();
  const depositorBytes = new Uint8Array(Buffer.from(depositorHex, 'hex'));
  if (depositorBytes.length !== 32) throw new Error(`Expected 32-byte depositor, got ${depositorBytes.length}`);

  fmt('Deployer address:', depositorHex);
  fmt('Night key (8 bytes):', toHexString(derivedKeys.unshielded).slice(0, 16) + '...');

  // ── Wallet setup ────────────────────────────────────────────────────
  step(1, 8, 'Initializing wallet...');
  const walletConfig: DefaultConfiguration = {
    networkId: networkConfig.networkId,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL(networkConfig.nodeRpc),
    provingServerUrl: new URL(networkConfig.proofServer),
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexerHttp,
      indexerWsUrl:  networkConfig.indexerWs,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded:    (cfg) => ShieldedWallet(cfg).startWithSecretKeys(derivedKeys.shielded.keys),
    unshielded:  (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust:        (cfg) => DustWallet(cfg).startWithSecretKey(
      derivedKeys.dust.key,
      ledgerSdk.LedgerParameters.initialParameters().dust
    ),
  });

  await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);
  console.log('  ✓ Wallet started');

  try {
    // ── Wallet sync ─────────────────────────────────────────────────
    step(2, 8, `Syncing wallet state (timeout ${SYNC_TIMEOUT_MS / 1000}s)...`);
    console.log('  NOTE: On Preprod, full sync takes 5-10 minutes. Using SYNC_TIMEOUT_MS=' + SYNC_TIMEOUT_MS);
    try {
      const synced = await Promise.race([
        wallet.waitForSyncedState(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Wallet sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`)),
            SYNC_TIMEOUT_MS
          )
        ),
      ]);
      console.log(`  ✓ Wallet fully synced`);
      console.log(`    Dust coins: ${(synced as any).dust?.totalCoins ?? 'unknown'}`);
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      if (msg.includes('timed out')) {
        console.warn(`  ⚠ ${msg}`);
        console.warn('  Continuing anyway — transactions may fail with error 170 (stale coin) if UTxOs are not ready.');
        console.warn('  Tip: set SYNC_TIMEOUT_MS=600000 (10 min) to ensure full sync before submitting.');
      } else {
        throw syncErr;
      }
    }

    // ── Providers ───────────────────────────────────────────────────
    step(3, 8, 'Setting up providers...');
    const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';
    const privateStateProvider = await levelPrivateStateProvider<
      typeof PRIVATE_STATE_KEY,
      LiquidityPoolPrivateState
    >({
      privateStoragePasswordProvider: () => privateStatePassword,
      accountId: 'pool-flow-test',
      privateStateStoreName: path.join(__dirname, '../.private-state-pool-flow'),
    });

    const publicDataProvider  = indexerPublicDataProvider(networkConfig.indexerHttp, networkConfig.indexerWs);
    const zkConfigProvider    = new NodeZkConfigProvider(path.join(__dirname, '../managed/OptimalAMM'));
    const proofProvider       = httpClientProofProvider(networkConfig.proofServer, zkConfigProvider);

    // balanceTx with 10-retry for segment_id collision (random 1/65535 per attempt)
    const walletProvider = {
      balanceTx: async (tx: any, ttl?: Date) => {
        const deadline = ttl || new Date(Date.now() + 10 * 60 * 1000);
        for (let attempt = 1; attempt <= 10; attempt++) {
          try {
            const recipe = await wallet.balanceUnboundTransaction(
              tx,
              { shieldedSecretKeys: derivedKeys.shielded.keys, dustSecretKey: derivedKeys.dust.key },
              { ttl: deadline, tokenKindsToBalance: ['dust'] }
            );
            return wallet.finalizeRecipe(recipe);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`  ⚠ balanceTx attempt ${attempt} error: ${msg.slice(0, 200)}`);
            const isCollision =
              (msg.includes('segment_id') && msg.includes('collision')) ||
              msg.includes('unreachable') ||
              msg.includes('Wallet.Other: unreachable');
            if (isCollision && attempt < 10) {
              console.warn(`    → segment_id/unreachable collision, retrying...`);
              continue;
            }
            throw err;
          }
        }
        throw new Error('balanceTx: exceeded 10 retries (segment_id collision)');
      },
      getCoinPublicKey:       () => derivedKeys.shielded.keys.coinPublicKey,
      getEncryptionPublicKey: () => derivedKeys.shielded.keys.encryptionPublicKey,
    };

    const midnightProvider = {
      submitTx: async (tx: ledgerSdk.FinalizedTransaction) => wallet.submitTransaction(tx) as any,
    };

    console.log('  ✓ Providers ready');

    // ── CompiledContract (shared for deploy + find) ─────────────────
    const witnesses = createWitnesses<LiquidityPoolPrivateState>();
    const compiledContract = CompiledContract.make<
      Contract<LiquidityPoolPrivateState, Witnesses<LiquidityPoolPrivateState>>,
      LiquidityPoolPrivateState
    >('OptimalAMM', Contract).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(path.join(__dirname, '..', 'managed', 'OptimalAMM'))
    );

    const providers = {
      privateStateProvider, publicDataProvider, proofProvider, zkConfigProvider,
      walletProvider, midnightProvider,
    };

    // ── Deploy (optional) ────────────────────────────────────────────
    let poolAddress: string;

    if (existingPoolAddress) {
      poolAddress = existingPoolAddress;
      step(4, 8, `Using existing pool: ${poolAddress}`);
    } else {
      step(4, 8, 'Deploying fresh OptimalAMM pool...');
      console.log('  (This generates a ZK proof — may take 3-5 minutes)');

      const deployed = await deployContract(providers as any, {
        compiledContract: compiledContract as any,
        privateStateId: PRIVATE_STATE_KEY,
        initialPrivateState: {} as LiquidityPoolPrivateState,
        args: [] as const,
      });

      if (String(deployed.deployTxData.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`Deploy tx failed: ${deployed.deployTxData.public.status}`);
      }

      poolAddress = formatAddress(deployed.deployTxData.public.contractAddress);
      const deployTxHash = deployed.deployTxData.public.txHash;
      const blockHeight  = deployed.deployTxData.public.blockHeight;

      fmt('Deployed address:', poolAddress);
      fmt('Deploy TX hash:',   deployTxHash);
      fmt('Block height:',     String(blockHeight));

      // Persist for reference
      const deploymentFile = path.join(__dirname, '../deployments/pool-flow-test.json');
      fs.writeFileSync(deploymentFile, JSON.stringify({
        contractName: 'OptimalAMM',
        contractAddress: poolAddress,
        network,
        deployedAt: new Date().toISOString(),
        txHash: deployTxHash,
        deployer: depositorHex,
        blockHeight,
      }, null, 2));
      console.log(`  ✓ Saved to ${deploymentFile}`);
    }

    // ── Contract handle ──────────────────────────────────────────────
    step(5, 8, 'Finding deployed contract handle...');
    const contract = await findDeployedContract(providers as any, {
      compiledContract: compiledContract as any,
      contractAddress: poolAddress as unknown as ContractAddress,
      privateStateId: PRIVATE_STATE_KEY,
      initialPrivateState: {} as LiquidityPoolPrivateState,
    });
    console.log('  ✓ Contract handle ready');

    // ─────────────────────────────────────────────────────────────────
    // TEST 1: Initialize pool
    // ─────────────────────────────────────────────────────────────────
    step(6, 8, 'Running pool tests...');

    let reserve0 = 0n, reserve1 = 0n, totalLPSupply = 0n, currentFeeBps = feeBps;

    await runTest('initialize — seed pool with initial liquidity', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      fmt('Current initialized:', String(pool.initialized));

      if (pool.initialized) {
        reserve0      = pool.reserve0;
        reserve1      = pool.reserve1;
        totalLPSupply = pool.totalLPSupply;
        currentFeeBps = pool.feeBps;
        fmt('reserve0 (raw):', reserve0.toString());
        fmt('reserve1 (raw):', reserve1.toString());
        fmt('totalLPSupply:', totalLPSupply.toString());
        fmt('feeBps:', currentFeeBps.toString());
        console.log('  (pool already initialized — skipping initialize tx)');
        return;
      }

      if (skipInit) {
        console.log('  SKIP_INIT=1 — skipping initialize tx');
        return;
      }

      const result = await contract.callTx.initialize(
        initAmount0,
        initAmount1,
        depositorBytes,
        feeBps
      );

      if (String(result.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`initialize tx failed: ${result.public.status}`);
      }

      fmt('TX hash:',      result.public.txHash);
      fmt('Block height:', String(result.public.blockHeight));

      // Re-read state
      const after = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      reserve0      = after.reserve0;
      reserve1      = after.reserve1;
      totalLPSupply = after.totalLPSupply;
      currentFeeBps = after.feeBps;

      if (!after.initialized) throw new Error('Pool still shows uninitialized after initialize tx');
      fmt('reserve0 after:', reserve0.toString());
      fmt('reserve1 after:', reserve1.toString());
    });

    // Ensure we have current reserves for following tests
    if (reserve0 === 0n || reserve1 === 0n) {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      reserve0      = pool.reserve0;
      reserve1      = pool.reserve1;
      totalLPSupply = pool.totalLPSupply;
      currentFeeBps = pool.feeBps;
    }

    // ─────────────────────────────────────────────────────────────────
    // TEST 2: Add liquidity from both balances
    // ─────────────────────────────────────────────────────────────────
    // Snapshot pool state before add — used for LP token estimation in removeLiquidity
    const preAddReserve0     = reserve0;
    const preAddReserve1     = reserve1;
    const preAddLPSupply     = totalLPSupply;

    // Compute proportional lpAmount1 to maintain price ratio
    // LP_AMOUNT1 from env overrides, otherwise compute from ratio
    let actualLpAmount0 = lpAmount0;
    let actualLpAmount1 = process.env.LP_AMOUNT1
      ? BigInt(process.env.LP_AMOUNT1)
      : reserve0 > 0n ? (lpAmount0 * reserve1) / reserve0 || 1n : lpAmount0;

    await runTest('addLiquidity — deposit tokens from both reserves', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      const r0 = pool.reserve0;
      const r1 = pool.reserve1;
      const ts = pool.totalLPSupply;

      fmt('Current reserve0:', r0.toString());
      fmt('Current reserve1:', r1.toString());
      fmt('Current totalLP:', ts.toString());

      // Recompute proportional amount1 from fresh state
      if (!process.env.LP_AMOUNT1) {
        actualLpAmount1 = r0 > 0n ? (actualLpAmount0 * r1) / r0 || 1n : actualLpAmount0;
      }

      fmt('Adding lpAmount0:', actualLpAmount0.toString());
      fmt('Adding lpAmount1 (proportional):', actualLpAmount1.toString());

      if (actualLpAmount0 === 0n || actualLpAmount1 === 0n) {
        throw new Error('LP amounts must be >0. Try increasing LP_AMOUNT0.');
      }

      const result = await contract.callTx.addLiquidity(
        actualLpAmount0,
        actualLpAmount1,
        depositorBytes
      );

      if (String(result.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`addLiquidity tx failed: ${result.public.status}`);
      }

      fmt('TX hash:',      result.public.txHash);
      fmt('Block height:', String(result.public.blockHeight));

      // Estimate LP tokens minted
      const lp0 = ts > 0n && r0 > 0n ? (actualLpAmount0 * ts) / r0 : actualLpAmount0;
      const lp1 = ts > 0n && r1 > 0n ? (actualLpAmount1 * ts) / r1 : actualLpAmount1;
      const lpMintEstimate = lp0 < lp1 ? lp0 : lp1;
      fmt('Estimated LP tokens minted:', lpMintEstimate.toString());

      // Verify reserves increased
      const after = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      if (after.reserve0 <= r0) throw new Error(`reserve0 did not increase (before=${r0}, after=${after.reserve0})`);
      if (after.reserve1 <= r1) throw new Error(`reserve1 did not increase (before=${r1}, after=${after.reserve1})`);

      reserve0      = after.reserve0;
      reserve1      = after.reserve1;
      totalLPSupply = after.totalLPSupply;

      fmt('reserve0 after add:', reserve0.toString());
      fmt('reserve1 after add:', reserve1.toString());
    });

    // ─────────────────────────────────────────────────────────────────
    // TEST 3: Swap token0 → token1 (zeroForOne = true)
    // ─────────────────────────────────────────────────────────────────
    await runTest('swap token0→token1 (zeroForOne=true)', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      const r0 = pool.reserve0;
      const r1 = pool.reserve1;
      const fBps = pool.feeBps;

      if (swapAmountIn >= r0) {
        throw new Error(`swapAmountIn (${swapAmountIn}) must be < reserve0 (${r0}). Set a smaller SWAP_AMOUNT_IN.`);
      }

      const expectedOut = getAmountOut(swapAmountIn, r0, r1, fBps);
      const amountOutMin = (expectedOut * 99n) / 100n; // 1% slippage tolerance

      fmt('reserve0:', r0.toString());
      fmt('reserve1:', r1.toString());
      fmt('swapAmountIn:', swapAmountIn.toString());
      fmt('expectedOut (AMM formula):', expectedOut.toString());
      fmt('amountOutMin (1% slippage):', amountOutMin.toString());

      if (expectedOut === 0n) throw new Error('AMM formula returned 0 output — amounts too small relative to reserves');

      const result = await contract.callTx.swap(swapAmountIn, amountOutMin, true);

      if (String(result.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`swap tx failed: ${result.public.status}`);
      }

      fmt('TX hash:',      result.public.txHash);
      fmt('Block height:', String(result.public.blockHeight));

      // Verify reserves changed
      const after = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      if (after.reserve0 <= r0) throw new Error(`reserve0 did not increase after swap0→1 (before=${r0}, after=${after.reserve0})`);
      if (after.reserve1 >= r1) throw new Error(`reserve1 did not decrease after swap0→1 (before=${r1}, after=${after.reserve1})`);

      reserve0 = after.reserve0;
      reserve1 = after.reserve1;

      fmt('reserve0 after swap:', reserve0.toString());
      fmt('reserve1 after swap:', reserve1.toString());
    });

    // ─────────────────────────────────────────────────────────────────
    // TEST 4: Swap token1 → token0 (zeroForOne = false)
    // ─────────────────────────────────────────────────────────────────
    await runTest('swap token1→token0 (zeroForOne=false)', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      const r0 = pool.reserve0;
      const r1 = pool.reserve1;
      const fBps = pool.feeBps;

      // Use same default swap amount but for token1 side
      const swapAmountIn1 = BigInt(process.env.SWAP_AMOUNT_IN_1 || process.env.SWAP_AMOUNT_IN || '500');

      if (swapAmountIn1 >= r1) {
        throw new Error(`swapAmountIn1 (${swapAmountIn1}) must be < reserve1 (${r1}). Set a smaller SWAP_AMOUNT_IN.`);
      }

      const expectedOut = getAmountOut(swapAmountIn1, r1, r0, fBps);
      const amountOutMin = (expectedOut * 99n) / 100n;

      fmt('reserve0:', r0.toString());
      fmt('reserve1:', r1.toString());
      fmt('swapAmountIn1:', swapAmountIn1.toString());
      fmt('expectedOut (AMM formula):', expectedOut.toString());
      fmt('amountOutMin (1% slippage):', amountOutMin.toString());

      if (expectedOut === 0n) throw new Error('AMM formula returned 0 output — amounts too small relative to reserves');

      const result = await contract.callTx.swap(swapAmountIn1, amountOutMin, false);

      if (String(result.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`swap1→0 tx failed: ${result.public.status}`);
      }

      fmt('TX hash:',      result.public.txHash);
      fmt('Block height:', String(result.public.blockHeight));

      const after = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      reserve0 = after.reserve0;
      reserve1 = after.reserve1;

      fmt('reserve0 after swap:', reserve0.toString());
      fmt('reserve1 after swap:', reserve1.toString());
    });

    // ─────────────────────────────────────────────────────────────────
    // TEST 5: Remove liquidity
    // ─────────────────────────────────────────────────────────────────
    await runTest('removeLiquidity — withdraw LP tokens', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      const r0 = pool.reserve0;
      const r1 = pool.reserve1;
      const ts = pool.totalLPSupply;

      fmt('reserve0:', r0.toString());
      fmt('reserve1:', r1.toString());
      fmt('totalLPSupply:', ts.toString());

      // Estimate LP tokens we hold from the addLiquidity step.
      // Uses the pre-addLiquidity state snapshot to compute proportion.
      let lpMinted = 1n;
      if (preAddLPSupply > 0n && preAddReserve0 > 0n && preAddReserve1 > 0n) {
        const lp0 = (actualLpAmount0 * preAddLPSupply) / preAddReserve0;
        const lp1 = (actualLpAmount1 * preAddLPSupply) / preAddReserve1;
        lpMinted = lp0 < lp1 ? lp0 : lp1;
      } else {
        // First LP deposit (empty pool) — LP tokens = sqrt(amount0 * amount1) approx
        // Just use a conservative 1 unit to ensure tx goes through
        lpMinted = 1n;
      }
      // Guard against zero
      if (lpMinted <= 0n) lpMinted = 1n;
      // Never try to remove more LP than exists
      if (lpMinted > ts) lpMinted = ts / 2n || 1n;

      // Cap at half total supply to be safe (leaves pool with liquidity)
      const maxRemove = ts / 2n || 1n;
      if (lpMinted > maxRemove) lpMinted = maxRemove;

      fmt('LP tokens to remove (estimate):', lpMinted.toString());
      fmt('(capped at 50% of totalLPSupply)', maxRemove.toString());

      const result = await contract.callTx.removeLiquidity(lpMinted, depositorBytes);

      if (String(result.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`removeLiquidity tx failed: ${result.public.status}`);
      }

      fmt('TX hash:',      result.public.txHash);
      fmt('Block height:', String(result.public.blockHeight));

      // Verify total supply decreased
      const after = await queryPoolState(networkConfig.indexerHttp, poolAddress);
      if (after.totalLPSupply >= ts) {
        throw new Error(`totalLPSupply did not decrease (before=${ts}, after=${after.totalLPSupply})`);
      }

      fmt('totalLPSupply after remove:', after.totalLPSupply.toString());
    });

    // ─────────────────────────────────────────────────────────────────
    // TEST 6: Verify final state
    // ─────────────────────────────────────────────────────────────────
    await runTest('verify final pool state', async () => {
      const pool = await queryPoolState(networkConfig.indexerHttp, poolAddress);

      fmt('initialized:', String(pool.initialized));
      fmt('reserve0 (final):', pool.reserve0.toString());
      fmt('reserve1 (final):', pool.reserve1.toString());
      fmt('totalLPSupply (final):', pool.totalLPSupply.toString());
      fmt('feeBps:', pool.feeBps.toString());

      if (!pool.initialized) throw new Error('Pool is no longer initialized!');
      if (pool.reserve0 === 0n) throw new Error('reserve0 dropped to zero — pool was fully drained');
      if (pool.reserve1 === 0n) throw new Error('reserve1 dropped to zero — pool was fully drained');
    });

  } finally {
    try { await wallet.stop(); } catch { /* ignore stop errors */ }
  }

  // ── Summary ────────────────────────────────────────────────────────
  step(7, 8, 'Done.');
  banner(`Results: ${passed} passed, ${failed_} failed`);
  if (failed_ > 0) {
    console.log('\n  Tip: re-run individual tests by setting POOL_ADDRESS and SKIP_INIT=1');
    console.log('  Tip: if you see error 170, your wallet sync timed out — use SYNC_TIMEOUT_MS=600000\n');
    process.exit(1);
  }
  console.log('\n  All tests passed! Pool lifecycle is working end-to-end.\n');
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
