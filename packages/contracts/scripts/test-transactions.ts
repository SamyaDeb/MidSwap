/**
 * test-transactions.ts
 *
 * End-to-end on-chain test script for the MidSwap LiquidityPool contract.
 * Tests: getPool, getQuote, swap, addLiquidity, removeLiquidity
 *
 * Usage:
 *   DEPLOYER_SEED_PHRASE="word1 word2 ..." \
 *   CONTRACT_ADDRESS=57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b \
 *   npx tsx packages/contracts/scripts/test-transactions.ts
 *
 * Optional env vars:
 *   NETWORK              preprod | mainnet       (default: preprod)
 *   PROOF_SERVER_URL                             (default: http://localhost:6300)
 *   PRIVATE_STATE_PASSWORD                       (default: MidSwap#Preprod2026)
 *   SWAP_AMOUNT_IN       bigint raw units        (default: 100000 = 10% of reserve0)
 *   LP_AMOUNT0           bigint raw units        (default: 1000)
 *   LP_AMOUNT1           bigint raw units        (default: 1000, must be proportional)
 *   SYNC_TIMEOUT_MS      ms to wait for sync     (default: 30000)
 *   SKIP_TX_TESTS        1 to skip tests 3-5     (default: 0)
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

// Midnight SDK internals JSON.stringify proof/tx data that may contain BigInt values.
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
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, type Witnesses } from '../managed/OptimalAMM/contract/index.js';
import { createWitnesses } from '../src/witnesses.js';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';

// ─────────────────────────────────────────────
// Constants
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
function fmt(label: string, value: string | bigint | number | boolean) {
  console.log(`    ${label.padEnd(28)} ${value}`);
}

function pass(label: string) {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ❌ ${label}: ${msg}`);
}

function formatRaw(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const frac = str.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Constant-product getAmountOut (fee = feeBps / 10000) */
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  const fee = 10000n - feeBps;
  const amountWithFee = amountIn * fee;
  const numerator = amountWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountWithFee;
  return numerator / denominator;
}

interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  totalLPSupply: bigint;
  feeBps: bigint;
  initialized: boolean;
}

/**
 * Read pool state directly from an on-chain ContractState object.
 * The compiled ledger() function returns {} (no fields generated by the Compact compiler),
 * so we read slots manually using queryLedgerState.
 *
 * State layout (from compiled contract slot indices):
 *   slot 0 = reserve0      (uint64)
 *   slot 1 = reserve1      (uint64)
 *   slot 2 = totalLPSupply (uint64)
 *   slot 4 = initialized   (bool)
 *   slot 5 = feeBps        (uint16)
 */
function readPoolState(contractState: any): PoolState {
  const rawBytes = contractState.serialize();
  const cs = compactRuntime.ContractState.deserialize(rawBytes);
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

  const u64  = new (compactRuntime as any).CompactTypeUnsignedInteger(18446744073709551615n, 8);
  const bool = (compactRuntime as any).CompactTypeBoolean;
  const u16  = new (compactRuntime as any).CompactTypeUnsignedInteger(65535n, 2);
  const u8   = new (compactRuntime as any).CompactTypeUnsignedInteger(255n, 1);

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

/** Read pool state directly from the indexer via HTTP. */
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

  const u64  = new (compactRuntime as any).CompactTypeUnsignedInteger(18446744073709551615n, 8);
  const bool = (compactRuntime as any).CompactTypeBoolean;
  const u16  = new (compactRuntime as any).CompactTypeUnsignedInteger(65535n, 2);
  const u8   = new (compactRuntime as any).CompactTypeUnsignedInteger(255n, 1);

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

// ─────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  console.log(`\n[TEST] ${name}`);
  try {
    await fn();
    pass(name);
    passed++;
  } catch (err) {
    fail(name, err);
    failed++;
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  const contractAddress = process.env.CONTRACT_ADDRESS || '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b';
  const network = (process.env.NETWORK || 'preprod') as 'preprod' | 'mainnet';
  const networkConfig = NETWORKS[network];

  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '30000', 10);
  const SKIP_TX_TESTS   = process.env.SKIP_TX_TESTS === '1';

  // Seed phrase only required for on-chain tx tests (tests 3-5)
  if (!SKIP_TX_TESTS) {
    if (!seedPhrase) throw new Error('DEPLOYER_SEED_PHRASE env var is required for on-chain tests');
    if (!validateSeedPhrase(seedPhrase)) throw new Error('Invalid seed phrase');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  MidSwap On-Chain Transaction Tests');
  console.log('═══════════════════════════════════════════════════════');
  fmt('Network:', network);
  fmt('Contract:', contractAddress);
  fmt('Skip TX tests:', String(SKIP_TX_TESTS));

  setNetworkId(networkConfig.networkId);

  const seedBytes = seedPhrase ? mnemonicToSeedSync(seedPhrase, '') : null;
  const derivedKeys = seedBytes ? deriveAllKeys(seedBytes) : null;
  if (derivedKeys) {
    fmt('Night key (first 8 bytes):', toHexString(derivedKeys.unshielded).slice(0, 16) + '...');
  }

  // ─────────────────────────────────────────────────
  // TEST 1: getPool — read state directly from indexer HTTP (no wallet sync needed)
  // ─────────────────────────────────────────────────
  let reserve0 = 0n, reserve1 = 0n, feeBps = 0n, initialized = false, totalLPSupply = 0n;

  await runTest('getPool — read contract state from indexer', async () => {
    const pool = await queryPoolState(networkConfig.indexerHttp, contractAddress);

    reserve0      = pool.reserve0;
    reserve1      = pool.reserve1;
    feeBps        = pool.feeBps;
    initialized   = pool.initialized;
    totalLPSupply = pool.totalLPSupply;

    fmt('initialized:', String(initialized));
    fmt('reserve0 (raw):', reserve0.toString());
    fmt('reserve1 (raw):', reserve1.toString());
    fmt('totalLPSupply:', totalLPSupply.toString());
    fmt('feeBps:', feeBps.toString());

    if (!initialized) throw new Error('Pool is not initialized — run init-pool.ts first');
    if (reserve0 === 0n || reserve1 === 0n) throw new Error('Pool reserves are zero');
  });

  // ─────────────────────────────────────────────────
  // TEST 2: getSwapQuote — off-chain AMM math (no wallet sync needed)
  // ─────────────────────────────────────────────────

  // Derive amounts dynamically from actual pool state:
  //   swapAmountIn  = env override OR 10% of reserve0
  //   lpAmount0     = env override OR 0.1% of reserve0
  //   lpAmount1     = env override OR proportional to reserve1
  const swapAmountIn = BigInt(process.env.SWAP_AMOUNT_IN || String(reserve0 / 10n || 1n));
  const lpAmount0    = BigInt(process.env.LP_AMOUNT0   || String(reserve0 / 1000n || 1n));
  const lpAmount1    = BigInt(process.env.LP_AMOUNT1   || String(reserve1 / 1000n || 1n));

  fmt('swapAmountIn (raw):', swapAmountIn.toString());
  fmt('lpAmount0 (raw):   ', lpAmount0.toString());
  fmt('lpAmount1 (raw):   ', lpAmount1.toString());

  let expectedAmountOut = 0n;

  await runTest('getSwapQuote — compute expected output', async () => {
    if (!initialized) throw new Error('Pool not initialized, skipping quote test');
    if (swapAmountIn >= reserve0) throw new Error(`swapAmountIn (${swapAmountIn}) must be < reserve0 (${reserve0})`);

    expectedAmountOut = getAmountOut(swapAmountIn, reserve0, reserve1, feeBps);

    fmt('amountIn (raw):', swapAmountIn.toString());
    fmt('amountOut (raw):', expectedAmountOut.toString());
    fmt('fee (bps):', feeBps.toString());

    if (expectedAmountOut <= 0n) throw new Error('Computed amountOut is zero — pool may have no liquidity');
  });

  if (SKIP_TX_TESTS) {
    console.log('\n  ⚠ SKIP_TX_TESTS=1 — skipping on-chain transaction tests 3-5');
    // Test 6 still runs (read-only)
  } else {
    // ── Set up wallet for on-chain tests ──────────────────────────────────
    if (!derivedKeys) throw new Error('derivedKeys is null — DEPLOYER_SEED_PHRASE was not provided');
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
      unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
      dust: (cfg) => DustWallet(cfg).startWithSecretKey(
        derivedKeys.dust.key,
        ledgerSdk.LedgerParameters.initialParameters().dust
      ),
    });

    // CRITICAL: wallet.start() must be called after init() to begin chain sync.
    // WalletFacade.init() only constructs the wallet; start() kicks off
    // the indexer/RPC subscriptions that populate UTxO state.
    await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);
    console.log('  ✓ Wallet started');

    try {
      // ── Sync wallet with timeout ──────────────────────────────────────
      // We race against a timeout but DO NOT throw on timeout — we continue
      // and let the on-chain calls fail naturally if UTxOs aren't ready.
      // This mirrors how deploy-automated.ts handles sync.
      console.log(`\n  Syncing wallet (timeout ${SYNC_TIMEOUT_MS / 1000}s)...`);
      try {
        await Promise.race([
          wallet.waitForSyncedState(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Wallet sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`)),
              SYNC_TIMEOUT_MS
            )
          ),
        ]);
        console.log('  ✓ Wallet fully synced');
      } catch (syncErr) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        if (msg.includes('timed out')) {
          console.warn(`  ⚠ ${msg}`);
          console.warn('  Continuing — transactions may fail if wallet has no dust UTxOs.');
        } else {
          throw syncErr;
        }
      }

      // ── Set up providers ─────────────────────────────────────────────
      const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';
      const privateStateProvider = await levelPrivateStateProvider<
        typeof PRIVATE_STATE_KEY,
        LiquidityPoolPrivateState
      >({
        privateStoragePasswordProvider: () => privateStatePassword,
        accountId: 'test-runner',
        privateStateStoreName: path.join(__dirname, '../.private-state-test'),
      });

      const publicDataProvider = indexerPublicDataProvider(
        networkConfig.indexerHttp,
        networkConfig.indexerWs
      );
      const zkConfigProvider = new NodeZkConfigProvider(path.join(__dirname, '../managed/OptimalAMM'));
      const proofProvider = httpClientProofProvider(networkConfig.proofServer, zkConfigProvider);

      const walletProvider = {
        // NOTE: balanceTx receives an UnboundTransaction (proven but not yet finalized).
        // Use balanceUnboundTransaction with tokenKindsToBalance: ['dust'] to add only
        // dust fee payments (contract does no unshielded token transfers).
        //
        // We retry up to 10 times on segment_id collision — the collision is purely random
        // (segment IDs are 16-bit random values) so retrying will succeed with overwhelming
        // probability on the next attempt (p_success ≥ 1 - 1/65535 per retry).
        balanceTx: async (tx: any, ttl?: Date) => {
          const deadline = ttl || new Date(Date.now() + 10 * 60 * 1000);
          for (let attempt = 1; attempt <= 10; attempt++) {
            try {
              const recipe = await wallet.balanceUnboundTransaction(
                tx,
                { shieldedSecretKeys: derivedKeys.shielded.keys, dustSecretKey: derivedKeys.dust.key },
                {
                  ttl: deadline,
                  tokenKindsToBalance: ['dust'],
                }
              );
              return wallet.finalizeRecipe(recipe);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`  ⚠ balanceTx attempt ${attempt} error: ${msg.slice(0, 200)}`);
              const isCollision = (msg.includes('segment_id') && msg.includes('collision')) ||
                msg.includes('unreachable') || msg.includes('Wallet.Other: unreachable');
              if (isCollision && attempt < 10) {
                console.warn(`    → retrying (segment_id/unreachable collision)...`);
                continue;
              }
              throw err;
            }
          }
          throw new Error('balanceTx: exceeded 10 retries due to segment_id collision');
        },
        getCoinPublicKey: () => derivedKeys.shielded.keys.coinPublicKey,
        getEncryptionPublicKey: () => derivedKeys.shielded.keys.encryptionPublicKey,
      };
      const midnightProvider = {
        submitTx: async (tx: ledgerSdk.FinalizedTransaction) => wallet.submitTransaction(tx) as any,
      };

      // ── Build contract handle ─────────────────────────────────────────
      const witnesses = createWitnesses<LiquidityPoolPrivateState>();
      const compiledContract = CompiledContract.make<
        Contract<LiquidityPoolPrivateState, Witnesses<LiquidityPoolPrivateState>>,
        LiquidityPoolPrivateState
      >('OptimalAMM', Contract).pipe(
        CompiledContract.withWitnesses(witnesses),
        CompiledContract.withCompiledFileAssets(path.join(__dirname, '..', 'managed', 'OptimalAMM'))
      );

      const providers = { privateStateProvider, publicDataProvider, proofProvider, zkConfigProvider, walletProvider, midnightProvider };

      const contract = await findDeployedContract(providers as any, {
        compiledContract: compiledContract as any,
        contractAddress: contractAddress as unknown as ContractAddress,
        privateStateId: PRIVATE_STATE_KEY,
        initialPrivateState: {} as LiquidityPoolPrivateState,
      });

      const depositorHex = unshieldedKeystore.getAddress();
      const depositorBytes = new Uint8Array(Buffer.from(depositorHex, 'hex'));
      if (depositorBytes.length !== 32) throw new Error(`Expected 32-byte depositor, got ${depositorBytes.length}`);
      fmt('Depositor address:', depositorHex);

      // ───────────────────────────────────────────────────────────────────
      // TEST 3: swap (on-chain)
      // ───────────────────────────────────────────────────────────────────
      let swapSucceeded = false;

      await runTest('swap — execute on-chain', async () => {
        if (!initialized) throw new Error('Pool not initialized, skipping swap');
        if (swapAmountIn >= reserve0) throw new Error(`swapAmountIn (${swapAmountIn}) must be < reserve0 (${reserve0})`);

        // amountOutMin = expectedAmountOut * (1 - 1% slippage)
        const amountOutMin = (expectedAmountOut * 9900n) / 10000n;
        fmt('swapAmountIn (raw):', swapAmountIn.toString());
        fmt('amountOutMin (raw):', amountOutMin.toString());

        const result = await contract.callTx.swap(
          swapAmountIn,
          amountOutMin,
          true // zeroForOne: token0 → token1
        );

        if (String(result.public.status) !== TX_STATUS_SUCCESS) {
          throw new Error(`Swap tx failed: ${result.public.status}`);
        }

        swapSucceeded = true;
        fmt('TX Hash:', result.public.txHash);
        fmt('Block height:', String(result.public.blockHeight));
      });

      // ───────────────────────────────────────────────────────────────────
      // TEST 4: addLiquidity (on-chain)
      // ───────────────────────────────────────────────────────────────────
      // After a swap, reserves changed — re-read and compute proportional amounts.
      let addLiqSucceeded = false;
      let actualLpAmount0 = lpAmount0;
      let actualLpAmount1 = lpAmount1;

      await runTest('addLiquidity — deposit tokens on-chain', async () => {
        if (!initialized) throw new Error('Pool not initialized, skipping addLiquidity');

        // Re-read pool state (swap may have changed reserves)
        const currentPool = await queryPoolState(networkConfig.indexerHttp, contractAddress);
        const r0 = currentPool.reserve0;
        const r1 = currentPool.reserve1;
        const ts = currentPool.totalLPSupply;

        fmt('Current reserve0:', r0.toString());
        fmt('Current reserve1:', r1.toString());

        // Compute proportional amount1 for given amount0 to maintain ratio
        // ratio: amount1 = amount0 * r1 / r0
        if (process.env.LP_AMOUNT0 && !process.env.LP_AMOUNT1) {
          actualLpAmount0 = BigInt(process.env.LP_AMOUNT0);
          actualLpAmount1 = (actualLpAmount0 * r1) / r0 || 1n;
        } else if (!process.env.LP_AMOUNT0 && !process.env.LP_AMOUNT1) {
          // Use 0.1% of each reserve, ensure both are >= 1
          actualLpAmount0 = r0 / 1000n || 1n;
          actualLpAmount1 = (actualLpAmount0 * r1) / r0 || 1n;
        }
        // If both explicitly set, use them as-is (user's responsibility to keep proportional)

        fmt('lpAmount0 to add:', actualLpAmount0.toString());
        fmt('lpAmount1 to add:', actualLpAmount1.toString());

        if (actualLpAmount0 === 0n || actualLpAmount1 === 0n) {
          throw new Error('LP amounts must be > 0');
        }

        const result = await contract.callTx.addLiquidity(
          actualLpAmount0,
          actualLpAmount1,
          depositorBytes
        );

        if (String(result.public.status) !== TX_STATUS_SUCCESS) {
          throw new Error(`addLiquidity tx failed: ${result.public.status}`);
        }

        addLiqSucceeded = true;
        fmt('TX Hash:', result.public.txHash);
        fmt('Block height:', String(result.public.blockHeight));
      });

      // ───────────────────────────────────────────────────────────────────
      // TEST 5: removeLiquidity (on-chain)
      // ───────────────────────────────────────────────────────────────────
      await runTest('removeLiquidity — withdraw LP tokens on-chain', async () => {
        if (!initialized) throw new Error('Pool not initialized, skipping removeLiquidity');
        if (!addLiqSucceeded) throw new Error('addLiquidity did not succeed — skipping removeLiquidity');

        // Re-read updated state after addLiquidity
        const pool = await queryPoolState(networkConfig.indexerHttp, contractAddress);
        const r0 = pool.reserve0;
        const r1 = pool.reserve1;
        const ts = pool.totalLPSupply;

        // Calculate LP tokens we received (min of proportional contributions)
        const lp0 = r0 > 0n ? (actualLpAmount0 * ts) / r0 : 0n;
        const lp1 = r1 > 0n ? (actualLpAmount1 * ts) / r1 : 0n;
        const lpEstimate = lp0 < lp1 ? lp0 : lp1;

        fmt('totalLPSupply:', ts.toString());
        fmt('lpEstimate to remove:', lpEstimate.toString());

        if (lpEstimate <= 0n) throw new Error('LP estimate is zero — amounts too small or addLiquidity not reflected yet');

        const result = await contract.callTx.removeLiquidity(
          lpEstimate,
          depositorBytes
        );

        if (String(result.public.status) !== TX_STATUS_SUCCESS) {
          throw new Error(`removeLiquidity tx failed: ${result.public.status}`);
        }

        fmt('TX Hash:', result.public.txHash);
        fmt('Block height:', String(result.public.blockHeight));
      });

    } finally {
      try { await wallet.stop(); } catch { /* ignore stop errors */ }
    }
  }

  // ─────────────────────────────────────────────────
  // TEST 6: read final pool state (read-only, no wallet)
  // ─────────────────────────────────────────────────
  await runTest('getPool (post-tx) — verify final state', async () => {
    const pool = await queryPoolState(networkConfig.indexerHttp, contractAddress);

    fmt('reserve0 (raw):', pool.reserve0.toString());
    fmt('reserve1 (raw):', pool.reserve1.toString());
    fmt('totalLPSupply:', pool.totalLPSupply.toString());
    fmt('feeBps:', pool.feeBps.toString());
    fmt('initialized:', String(pool.initialized));

    if (!pool.initialized) throw new Error('Pool no longer initialized after tests');
  });

  // ─────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
