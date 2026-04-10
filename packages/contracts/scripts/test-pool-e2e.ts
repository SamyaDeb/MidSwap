/**
 * E2E Test Script: Pool State Decode + Liquidity Flow Validation
 *
 * Tests:
 *  1. Indexer connectivity — fetch pool contract state
 *  2. Ledger state decode — compact-runtime WASM pipeline
 *  3. AMM math — swap quote, price impact, optimal liquidity
 *  4. Add liquidity parameter validation
 *  5. Remove liquidity parameter validation
 *
 * Run:
 *   cd /Users/samya/Downloads/MidSwap
 *   npx tsx packages/contracts/scripts/test-pool-e2e.ts
 */

const INDEXER_URL = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const POOL_ADDRESS = '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b';
const MUSDC_ADDRESS = 'c85172925beae8334c01135cfbd364cf2f6858e173be8c13bb82197890f645f4';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function ok(msg: string) {
  passed++;
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function fail(msg: string, detail?: string) {
  failed++;
  console.log(`  ${RED}✗${RESET} ${msg}`);
  if (detail) console.log(`    ${RED}${detail}${RESET}`);
}

function section(title: string) {
  console.log(`\n${BOLD}${CYAN}═══ ${title} ═══${RESET}`);
}

// ============================================
// Test 1: Indexer Connectivity
// ============================================

async function testIndexerConnectivity(): Promise<string | null> {
  section('Test 1: Indexer Connectivity');

  try {
    const resp = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { contractAction(address: "${POOL_ADDRESS}") { state address transaction { hash block { height } } } }`,
      }),
    });

    if (!resp.ok) {
      fail(`Indexer returned HTTP ${resp.status}`);
      return null;
    }
    ok(`Indexer responded HTTP ${resp.status}`);

    const json = await resp.json() as any;

    if (json.errors?.length) {
      fail(`GraphQL error: ${json.errors[0].message}`);
      return null;
    }

    const ca = json.data?.contractAction;
    if (!ca) {
      fail('No contractAction in response');
      return null;
    }

    ok(`Contract address: ${ca.address?.slice(0, 16)}…`);
    ok(`State hex length: ${ca.state.length} chars`);
    ok(`Last tx: ${ca.transaction?.hash?.slice(0, 16)}… (block ${ca.transaction?.block?.height})`);

    return ca.state as string;
  } catch (err: any) {
    fail(`Network error: ${err.message}`);
    return null;
  }
}

// ============================================
// Test 2: Ledger State Decode
// ============================================

interface DecodedState {
  reserve0: bigint;
  reserve1: bigint;
  totalLPSupply: bigint;
  initialized: boolean;
  feeBps: bigint;
}

async function testLedgerStateDecode(stateHex: string): Promise<DecodedState | null> {
  section('Test 2: Ledger State Decode (compact-runtime WASM)');

  try {
    const cr = await import('@midnight-ntwrk/compact-runtime');
    ok('compact-runtime loaded');

    // Check required exports
    const requiredExports = ['ContractState', 'QueryContext', 'CostModel', 'queryLedgerState', 'dummyContractAddress'];
    for (const name of requiredExports) {
      if (typeof (cr as any)[name] === 'undefined') {
        fail(`Missing export: ${name}`);
        return null;
      }
    }
    ok(`All required exports present: ${requiredExports.join(', ')}`);

    // Parse hex → bytes
    const bytes = Uint8Array.from(
      stateHex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)),
    );
    ok(`State bytes: ${bytes.length} bytes`);

    // Deserialize
    const cs = (cr.ContractState as any).deserialize(bytes);
    const chargedState = cs.data;
    ok('ContractState.deserialize() succeeded');

    // Build query context
    const context = {
      currentQueryContext: new (cr.QueryContext as any)(chargedState, (cr.dummyContractAddress as any)()),
      costModel: (cr.CostModel as any).initialCostModel(),
    };
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: [],
    };

    const u64 = new (cr as any).CompactTypeUnsignedInteger(18446744073709551615n, 8);
    const bool = (cr as any).CompactTypeBoolean;
    const u16 = new (cr as any).CompactTypeUnsignedInteger(65535n, 2);
    const u8 = new (cr as any).CompactTypeUnsignedInteger(255n, 1);

    const readSlot = (slotIdx: number, descriptor: any): any =>
      descriptor.fromValue(
        (cr.queryLedgerState as any)(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                { tag: 'value', value: { value: u8.toValue(BigInt(slotIdx)), alignment: u8.alignment() } },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );

    const reserve0 = readSlot(0, u64) as bigint;
    const reserve1 = readSlot(1, u64) as bigint;
    const totalLPSupply = readSlot(2, u64) as bigint;
    const initialized = readSlot(4, bool) as boolean;
    const feeBps = readSlot(5, u16) as bigint;

    ok(`reserve0      = ${reserve0} (${(Number(reserve0) / 1e6).toFixed(6)} tNight)`);
    ok(`reserve1      = ${reserve1} (${(Number(reserve1) / 1e6).toFixed(6)} mUSDC)`);
    ok(`totalLPSupply = ${totalLPSupply}`);
    ok(`initialized   = ${initialized}`);
    ok(`feeBps        = ${feeBps} (${Number(feeBps) / 100}%)`);

    if (!initialized) {
      fail('Pool is not initialized!');
      return null;
    }

    if (reserve0 <= 0n || reserve1 <= 0n) {
      fail('Reserves are zero — pool has no liquidity');
      return null;
    }

    return { reserve0, reserve1, totalLPSupply, initialized, feeBps };
  } catch (err: any) {
    fail(`Decode failed: ${err.message}`, err.stack);
    return null;
  }
}

// ============================================
// Test 3: AMM Math
// ============================================

function testAMMMath(state: DecodedState) {
  section('Test 3: AMM Math Calculations');

  const { reserve0, reserve1, feeBps, totalLPSupply } = state;

  // Price calculation
  const price = (Number(reserve1) / 1e6) / (Number(reserve0) / 1e6);
  ok(`Price: 1 tNight = ${price.toFixed(6)} mUSDC`);

  // Swap quote: 0.001 tNight → mUSDC
  const amountIn = 1000n; // 0.001 tNight = 1000 raw (6 decimals)
  const feeMultiplier = 10000n - feeBps;
  const amountInWithFee = amountIn * feeMultiplier;
  const numerator = amountInWithFee * reserve1;
  const denominator = reserve0 * 10000n + amountInWithFee;
  const amountOut = numerator / denominator;

  ok(`Swap 0.001 tNight → ${(Number(amountOut) / 1e6).toFixed(6)} mUSDC (${amountOut} raw)`);

  // Fee
  const fee = (amountIn * feeBps) / 10000n;
  ok(`Fee: ${fee} raw = ${(Number(fee) / 1e6).toFixed(6)} tNight`);

  // Price impact
  const idealOut = (amountIn * reserve1) / reserve0;
  const priceImpactBps = idealOut > amountOut
    ? Number(((idealOut - amountOut) * 10000n) / idealOut)
    : 0;
  ok(`Price impact: ${priceImpactBps} bps (${(priceImpactBps / 100).toFixed(2)}%)`);

  // Reverse swap: mUSDC → tNight
  const amountIn2 = 1000n; // 0.001 mUSDC
  const amountOut2 = (amountIn2 * feeMultiplier * reserve0) / (reserve1 * 10000n + amountIn2 * feeMultiplier);
  ok(`Swap 0.001 mUSDC → ${(Number(amountOut2) / 1e6).toFixed(6)} tNight`);

  // Slippage check
  const slippageBps = 50n; // 0.5%
  const minReceived = (amountOut * (10000n - slippageBps)) / 10000n;
  ok(`Min received (0.5% slippage): ${minReceived} raw`);

  if (amountOut <= 0n) {
    fail('Swap output is 0 — something is wrong with reserves');
  }
}

// ============================================
// Test 4: Add Liquidity Parameters
// ============================================

function testAddLiquidity(state: DecodedState) {
  section('Test 4: Add Liquidity Parameter Validation');

  const { reserve0, reserve1, totalLPSupply } = state;

  // User wants to add 0.001 tNight
  const amount0Desired = 1000n; // 0.001 tNight (6 decimals)
  const amount1Desired = (amount0Desired * reserve1) / reserve0; // proportional mUSDC

  ok(`Desired: ${(Number(amount0Desired) / 1e6).toFixed(6)} tNight + ${(Number(amount1Desired) / 1e6).toFixed(6)} mUSDC`);

  // Optimal amounts (get the better ratio)
  let amount0: bigint, amount1: bigint;
  const amount1Optimal = (amount0Desired * reserve1) / reserve0;
  if (amount1Optimal <= amount1Desired) {
    amount0 = amount0Desired;
    amount1 = amount1Optimal;
  } else {
    const amount0Optimal = (amount1Desired * reserve0) / reserve1;
    amount0 = amount0Optimal;
    amount1 = amount1Desired;
  }

  ok(`Optimal: ${(Number(amount0) / 1e6).toFixed(6)} tNight + ${(Number(amount1) / 1e6).toFixed(6)} mUSDC`);

  // LP tokens estimate
  let lpTokens: bigint;
  if (totalLPSupply === 0n) {
    // Initial liquidity
    const product = amount0 * amount1;
    let x = product;
    let y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (product / y + y) / 2n; }
    lpTokens = x;
    ok(`Initial liquidity — LP = sqrt(${amount0} * ${amount1}) = ${lpTokens}`);
  } else {
    const lp0 = (amount0 * totalLPSupply) / reserve0;
    const lp1 = (amount1 * totalLPSupply) / reserve1;
    lpTokens = lp0 < lp1 ? lp0 : lp1;
    ok(`LP tokens to mint: min(${lp0}, ${lp1}) = ${lpTokens}`);
  }

  // Pool share
  const newTotalSupply = totalLPSupply + lpTokens;
  const poolShare = Number(lpTokens) / Number(newTotalSupply);
  ok(`Pool share after add: ${(poolShare * 100).toFixed(6)}%`);

  // Slippage bounds (0.5%)
  const slippageMultiplier = 9950n; // 99.5%
  const amount0Min = (amount0 * slippageMultiplier) / 10000n;
  const amount1Min = (amount1 * slippageMultiplier) / 10000n;
  ok(`Min amounts (0.5% slippage): ${amount0Min} tNight, ${amount1Min} mUSDC`);

  // Deadline
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  ok(`Deadline: ${new Date(deadline * 1000).toISOString()} (20 min from now)`);

  // Validation: ensure reserves > 0
  if (reserve0 === 0n || reserve1 === 0n) {
    fail('Cannot add liquidity — reserves are zero');
  } else {
    ok('Reserves are non-zero — add liquidity is valid');
  }

  if (lpTokens === 0n) {
    fail('LP tokens would be 0 — amounts too small');
  } else {
    ok(`LP tokens > 0: ${lpTokens} ✓`);
  }
}

// ============================================
// Test 5: Remove Liquidity Parameters
// ============================================

function testRemoveLiquidity(state: DecodedState) {
  section('Test 5: Remove Liquidity Parameter Validation');

  const { reserve0, reserve1, totalLPSupply } = state;

  if (totalLPSupply === 0n) {
    fail('No LP supply — cannot test remove');
    return;
  }

  // Simulate removing 50% of an LP position of 500 tokens
  const userLPBalance = 500n; // example
  const percentage = 50n;
  const lpToRemove = (userLPBalance * percentage) / 100n;

  ok(`User LP balance: ${userLPBalance}`);
  ok(`Removing ${percentage}% = ${lpToRemove} LP tokens`);

  // Expected token returns
  const token0Return = (lpToRemove * reserve0) / totalLPSupply;
  const token1Return = (lpToRemove * reserve1) / totalLPSupply;
  ok(`Expected return: ${(Number(token0Return) / 1e6).toFixed(6)} tNight + ${(Number(token1Return) / 1e6).toFixed(6)} mUSDC`);

  // Slippage
  const slippageMultiplier = 9950n;
  const token0Min = (token0Return * slippageMultiplier) / 10000n;
  const token1Min = (token1Return * slippageMultiplier) / 10000n;
  ok(`Min returns (0.5% slippage): ${token0Min} tNight, ${token1Min} mUSDC`);

  if (token0Return === 0n && token1Return === 0n) {
    fail('Return amounts are both 0 — LP position too small');
  } else {
    ok('Return amounts > 0 ✓');
  }
}

// ============================================
// Test 6: Frontend Proxy Simulation
// ============================================

async function testProxyConnectivity(): Promise<boolean> {
  section('Test 6: Vite Proxy Connectivity (localhost:3004)');

  try {
    const resp = await fetch('http://localhost:3004/api/indexer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { contractAction(address: "${POOL_ADDRESS}") { state } }`,
      }),
    });

    if (!resp.ok) {
      fail(`Vite proxy returned HTTP ${resp.status}`);
      return false;
    }

    const json = await resp.json() as any;
    const stateLen = json.data?.contractAction?.state?.length ?? 0;

    if (stateLen === 0) {
      fail('Proxy returned empty state');
      return false;
    }

    ok(`Vite proxy → indexer: OK (state ${stateLen} chars)`);
    return true;
  } catch (err: any) {
    fail(`Proxy error: ${err.message}`, 'Is the dev server running on port 3004?');
    return false;
  }
}

// ============================================
// Test 7: Frontend Module Import Simulation
// ============================================

async function testModuleImports() {
  section('Test 7: Module Import Validation');

  try {
    const cr = await import('@midnight-ntwrk/compact-runtime');

    // Test that object-inspect is loaded implicitly via error.js
    const { CompactError, assert: compactAssert } = cr as any;

    if (typeof CompactError === 'function') {
      ok('CompactError class imported (uses object-inspect internally)');
      try {
        new CompactError('test error');
        ok('CompactError instantiation works');
      } catch (e: any) {
        fail(`CompactError instantiation failed: ${e.message}`);
      }
    } else {
      fail('CompactError not found in compact-runtime exports');
    }

    // Validate queryLedgerState is a function
    if (typeof cr.queryLedgerState === 'function') {
      ok('queryLedgerState is a function ✓');
    } else {
      fail('queryLedgerState is not a function');
    }

    // Validate ContractState has deserialize
    if (typeof (cr.ContractState as any)?.deserialize === 'function') {
      ok('ContractState.deserialize is a function ✓');
    } else {
      fail('ContractState.deserialize missing');
    }
  } catch (err: any) {
    fail(`Module import failed: ${err.message}`, err.stack);
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log(`\n${BOLD}${YELLOW}╔════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${YELLOW}║   MidSwap Pool E2E Test Suite              ║${RESET}`);
  console.log(`${BOLD}${YELLOW}╚════════════════════════════════════════════╝${RESET}`);
  console.log(`Pool: ${POOL_ADDRESS.slice(0, 16)}…`);
  console.log(`Indexer: ${INDEXER_URL}`);

  // Test 1: Indexer
  const stateHex = await testIndexerConnectivity();
  if (!stateHex) {
    console.log(`\n${RED}FATAL: Cannot proceed without indexer state${RESET}`);
    process.exit(1);
  }

  // Test 2: Decode
  const decoded = await testLedgerStateDecode(stateHex);
  if (!decoded) {
    console.log(`\n${RED}FATAL: Cannot proceed without decoded state${RESET}`);
    process.exit(1);
  }

  // Test 3: AMM Math
  testAMMMath(decoded);

  // Test 4: Add Liquidity
  testAddLiquidity(decoded);

  // Test 5: Remove Liquidity
  testRemoveLiquidity(decoded);

  // Test 6: Proxy
  await testProxyConnectivity();

  // Test 7: Module imports
  await testModuleImports();

  // Summary
  console.log(`\n${BOLD}${CYAN}═══ Summary ═══${RESET}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${RESET}`);
  }
  console.log(`  Total: ${passed + failed}`);

  if (failed > 0) {
    console.log(`\n${RED}${BOLD}SOME TESTS FAILED${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}ALL TESTS PASSED ✓${RESET}`);
    console.log(`\n${YELLOW}Frontend E2E flow ready:${RESET}`);
    console.log(`  1. Open ${CYAN}http://localhost:3004/pools${RESET}`);
    console.log(`  2. Connect Lace wallet (Midnight Testnet)`);
    console.log(`  3. Click pool row → "Add Liquidity"`);
    console.log(`  4. Enter 0.001 tNight (mUSDC auto-fills proportionally)`);
    console.log(`  5. Click "Add Liquidity" → approve in Lace`);
    console.log(`  6. Wait for ZK proof generation (~30-120s)`);
    console.log(`  7. Pool page refreshes with updated reserves`);
    console.log(`  8. Click "Remove Liquidity" → select % → confirm`);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Unhandled error:${RESET}`, err);
  process.exit(1);
});
