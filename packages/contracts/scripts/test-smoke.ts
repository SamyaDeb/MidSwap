/**
 * test-smoke.ts
 *
 * Read-only smoke test for MidSwap on Midnight Preprod.
 * No seed phrase required, no transactions submitted.
 * Tests: indexer connectivity, pool state reading, AMM math verification,
 *        proof server health check.
 *
 * Usage:
 *   pnpm --filter @midswap/contracts test:smoke
 *
 * Or directly:
 *   npx tsx scripts/test-smoke.ts
 *
 * Optional env vars:
 *   POOL_ADDRESS       pool to query (default: deployed preprod pool)
 *   NETWORK            preprod | mainnet (default: preprod)
 *   PROOF_SERVER_URL   (default: http://localhost:6300)
 */

import { Buffer } from 'node:buffer';
import * as compactRuntime from '@midnight-ntwrk/compact-runtime';

// ─────────────────────────────────────────────
// Network config
// ─────────────────────────────────────────────
const NETWORKS = {
  preprod: {
    indexerHttp: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    nodeRpc: 'wss://rpc.preprod.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  },
  mainnet: {
    indexerHttp: 'https://indexer.midnight.network/api/v4/graphql',
    nodeRpc: 'wss://rpc.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  },
} as const;

const DEFAULT_POOL = '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function banner(text: string) {
  const line = '='.repeat(55);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function fmt(label: string, value: string | bigint | number | boolean) {
  console.log(`    ${label.padEnd(30)} ${value}`);
}

function pass(label: string) { console.log(`  [PASS] ${label}`); }

function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  [FAIL] ${label}: ${msg}`);
}

/** Constant-product getAmountOut */
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  const fee = 10000n - feeBps;
  const amountWithFee = amountIn * fee;
  const numerator = amountWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountWithFee;
  return numerator / denominator;
}

// ─────────────────────────────────────────────
// Pool state reader (same pattern as test-pool-flow.ts)
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

  const stateHex: string | undefined = json.data?.contractAction?.state;
  if (!stateHex) throw new Error('No contract state returned by indexer (pool may not exist)');

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
// Test runner
// ─────────────────────────────────────────────
let passed_ = 0;
let failed_ = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    pass(name);
    passed_++;
    return true;
  } catch (err) {
    fail(name, err);
    failed_++;
    return false;
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const network = (process.env.NETWORK || 'preprod') as 'preprod' | 'mainnet';
  const networkConfig = NETWORKS[network];
  const poolAddress = process.env.POOL_ADDRESS || DEFAULT_POOL;

  banner('MidSwap Smoke Test (read-only)');
  fmt('Network:', network);
  fmt('Pool address:', poolAddress);
  fmt('Indexer:', networkConfig.indexerHttp);
  fmt('Proof server:', networkConfig.proofServer);

  // ── TEST 1: Indexer connectivity ──────────────────────────────────
  await runTest('Indexer is reachable', async () => {
    const resp = await fetch(networkConfig.indexerHttp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as any;
    if (json.errors?.length) throw new Error(json.errors[0].message);
    fmt('Response:', JSON.stringify(json.data));
  });

  // ── TEST 2: Pool state reading ────────────────────────────────────
  let poolState: PoolState | null = null;

  await runTest('Pool state is readable', async () => {
    poolState = await queryPoolState(networkConfig.indexerHttp, poolAddress);
    fmt('initialized:', String(poolState.initialized));
    fmt('reserve0:', poolState.reserve0.toString());
    fmt('reserve1:', poolState.reserve1.toString());
    fmt('totalLPSupply:', poolState.totalLPSupply.toString());
    fmt('feeBps:', poolState.feeBps.toString());
  });

  // ── TEST 3: Pool is initialized ───────────────────────────────────
  await runTest('Pool is initialized with liquidity', async () => {
    if (!poolState) throw new Error('Pool state not available (previous test failed)');
    if (!poolState.initialized) throw new Error('Pool is NOT initialized');
    if (poolState.reserve0 === 0n) throw new Error('reserve0 is zero');
    if (poolState.reserve1 === 0n) throw new Error('reserve1 is zero');
    if (poolState.totalLPSupply === 0n) throw new Error('totalLPSupply is zero');
  });

  // ── TEST 4: AMM math verification ─────────────────────────────────
  await runTest('AMM getAmountOut math is correct', async () => {
    if (!poolState) throw new Error('Pool state not available');

    // Test with a small swap: 100 units of token0
    const amountIn = 100n;
    const out = getAmountOut(amountIn, poolState.reserve0, poolState.reserve1, poolState.feeBps);
    fmt('Input:', `${amountIn} token0`);
    fmt('Output:', `${out} token1`);

    // Output must be > 0 and < reserve1
    if (out <= 0n) throw new Error(`Expected positive output, got ${out}`);
    if (out >= poolState.reserve1) throw new Error(`Output ${out} >= reserve1 ${poolState.reserve1}`);

    // Verify constant product invariant (k should increase due to fees)
    const k_before = poolState.reserve0 * poolState.reserve1;
    const newR0 = poolState.reserve0 + amountIn;
    const newR1 = poolState.reserve1 - out;
    const k_after = newR0 * newR1;
    fmt('K before:', k_before.toString());
    fmt('K after:', k_after.toString());
    if (k_after < k_before) throw new Error(`K decreased: ${k_before} -> ${k_after}`);

    // Reverse swap: same amount of token1 -> token0
    const reverseOut = getAmountOut(amountIn, poolState.reserve1, poolState.reserve0, poolState.feeBps);
    fmt('Reverse output:', `${reverseOut} token0`);
    if (reverseOut <= 0n) throw new Error(`Expected positive reverse output, got ${reverseOut}`);
  });

  // ── TEST 5: Fee configuration ─────────────────────────────────────
  await runTest('Fee configuration is valid', async () => {
    if (!poolState) throw new Error('Pool state not available');
    const bps = Number(poolState.feeBps);
    fmt('Fee BPS:', bps.toString());
    fmt('Fee %:', `${(bps / 100).toFixed(2)}%`);
    if (bps < 1 || bps > 10000) throw new Error(`Fee BPS out of valid range: ${bps}`);
  });

  // ── TEST 6: Price sanity check ────────────────────────────────────
  await runTest('Price ratio is non-zero and reasonable', async () => {
    if (!poolState) throw new Error('Pool state not available');
    if (poolState.reserve0 === 0n) throw new Error('reserve0 is zero');
    const price = Number(poolState.reserve1) / Number(poolState.reserve0);
    fmt('Price (token1/token0):', price.toFixed(8));
    fmt('Price (token0/token1):', (1 / price).toFixed(8));
    if (!isFinite(price) || price <= 0) throw new Error(`Invalid price: ${price}`);
  });

  // ── TEST 7: Proof server health ───────────────────────────────────
  await runTest('Proof server is healthy', async () => {
    try {
      const resp = await fetch(`${networkConfig.proofServer}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as any;
      fmt('Status:', json.status || 'unknown');
      if (json.status !== 'ok') throw new Error(`Proof server status: ${json.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('timeout')) {
        throw new Error(
          `Proof server not reachable at ${networkConfig.proofServer}. ` +
          'Start it with: docker-compose up -d'
        );
      }
      throw err;
    }
  });

  // ── TEST 8: Large swap price impact ───────────────────────────────
  await runTest('Large swap shows expected price impact', async () => {
    if (!poolState) throw new Error('Pool state not available');

    // Swap 10% of reserve0
    const largeAmount = poolState.reserve0 / 10n;
    if (largeAmount === 0n) throw new Error('Pool too small for price impact test');

    const outLarge = getAmountOut(largeAmount, poolState.reserve0, poolState.reserve1, poolState.feeBps);
    const outSmall = getAmountOut(1n, poolState.reserve0, poolState.reserve1, poolState.feeBps);

    // Effective price per unit for large vs small trade
    const priceLarge = Number(outLarge) / Number(largeAmount);
    const priceSmall = Number(outSmall); // per 1 unit

    fmt('Small trade price:', priceSmall.toFixed(8));
    fmt('Large trade price:', priceLarge.toFixed(8));

    if (priceSmall > 0 && priceLarge >= priceSmall) {
      throw new Error('Large trade should have worse price than small trade due to price impact');
    }

    const impactBps = priceSmall > 0 ? Math.round(((priceSmall - priceLarge) / priceSmall) * 10000) : 0;
    fmt('Price impact (bps):', impactBps.toString());
    fmt('Price impact (%):', `${(impactBps / 100).toFixed(2)}%`);
  });

  // ── Summary ────────────────────────────────────────────────────────
  banner(`Smoke Test Results: ${passed_} passed, ${failed_} failed`);
  if (failed_ > 0) {
    console.log('\n  Some tests failed. Check output above for details.\n');
    process.exit(1);
  }
  console.log('\n  All smoke tests passed! Pool is healthy and readable.\n');
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
