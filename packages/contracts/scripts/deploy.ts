/**
 * MidSwap Contract Deployment Script
 * 
 * Deploy the LiquidityPool contract to Midnight Preprod
 * 
 * Prerequisites:
 * 1. Proof server running: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
 * 2. Contract compiled: pnpm --filter @midswap/contracts build
 * 3. Lace wallet connected with tDUST tokens
 * 
 * Usage: pnpm --filter @midswap/contracts deploy
 */

import * as fs from 'fs';
import * as path from 'path';

// Network configuration
const NETWORKS = {
  preprod: {
    networkId: 'preprod',
    nodeRpc: 'wss://rpc.preprod.midnight.network',
    indexerGraphQL: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300'
  },
  mainnet: {
    networkId: 'mainnet',
    nodeRpc: 'wss://rpc.midnight.network',
    indexerGraphQL: 'https://indexer.midnight.network/api/v4/graphql',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300'
  }
} as const;

interface DeploymentResult {
  network: string;
  contractName: string;
  contractAddress: string;
  deployedAt: string;
  txHash: string;
  deployer: string;
  blockHeight: number;
  initialConfig: {
    feeBps: number;
    token0: string;
    token1: string;
  };
}

interface DeploymentConfig {
  network: 'preprod' | 'mainnet';
  feeBps: number;
  token0Symbol: string;
  token1Symbol: string;
  deployerSeed?: string;
}

interface ContractArtifacts {
  circuit: Uint8Array;
  initialState: Record<string, unknown>;
  verificationKey: Uint8Array;
}

/**
 * Check if proof server is healthy
 */
async function checkProofServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return false;
    const data = await response.json() as { status?: string };
    return data.status === 'ok' || response.ok;
  } catch (error) {
    console.error('  Proof server check failed:', error);
    return false;
  }
}

/**
 * Load compiled contract artifacts
 */
async function loadContractArtifacts(contractName: string): Promise<ContractArtifacts> {
  const managedPath = path.join(__dirname, '../managed', contractName);
  
  // Check if contract is compiled
  if (!fs.existsSync(managedPath)) {
    throw new Error(
      `Contract not compiled!\n\n` +
      `Run the following command to compile:\n` +
      `  pnpm --filter @midswap/contracts build\n\n` +
      `Or with npx:\n` +
      `  npx @midnight-ntwrk/compact-js-command compile src/LiquidityPool.compact -o managed/\n\n` +
      `Expected path: ${managedPath}`
    );
  }

  // Load compiled artifacts (compact 0.30 output format)
  const contractDir = path.join(managedPath, 'contract');
  const compilerDir = path.join(managedPath, 'compiler');
  const contractInfoPath = path.join(compilerDir, 'contract-info.json');
  const contractJsPath = path.join(contractDir, 'index.js');

  const files = fs.readdirSync(managedPath);
  if (files.length === 0 || (files.length === 1 && files[0] === '.gitkeep')) {
    throw new Error(
      `No compiled artifacts found in ${managedPath}\n\n` +
      `Run: pnpm --filter @midswap/contracts build`
    );
  }

  console.log(`  Found artifacts: ${files.join(', ')}`);

  if (!fs.existsSync(contractInfoPath) || !fs.existsSync(contractJsPath)) {
    throw new Error(
      `Missing compiled contract artifacts in ${managedPath}\n\n` +
      `Expected:\n` +
      `  - contract/index.js\n` +
      `  - compiler/contract-info.json\n\n` +
      `Run: pnpm --filter @midswap/contracts build`
    );
  }

  // Load artifacts. We use contract JS as deploy payload placeholder in this script.
  let circuit: Uint8Array;
  let verificationKey: Uint8Array;
  let initialState: Record<string, unknown>;

  circuit = fs.readFileSync(contractJsPath);
  verificationKey = new Uint8Array(0); // Placeholder, generated/managed by proving flow

  const contractInfo = JSON.parse(fs.readFileSync(contractInfoPath, 'utf-8')) as {
    languageVersion?: string;
    compilerVersion?: string;
    circuits?: unknown;
  };

  initialState = {
    reserve0: '0',
    reserve1: '0',
    totalLPSupply: '0',
    kLast: '0',
    initialized: false,
    feeBps: '30',
    contractInfo
  };

  return { circuit, verificationKey, initialState };
}

/**
 * Connect to Midnight network via RPC
 */
async function connectToNetwork(config: typeof NETWORKS.preprod): Promise<{
  rpc: WebSocket;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    console.log(`  Connecting to ${config.nodeRpc}...`);
    
    const ws = new WebSocket(config.nodeRpc);
    
    ws.onopen = () => {
      console.log('  ✓ Connected to Midnight node');
      resolve({
        rpc: ws,
        close: () => ws.close()
      });
    };
    
    ws.onerror = (error) => {
      reject(new Error(`Failed to connect to Midnight node: ${error}`));
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error('Connection timeout'));
      }
    }, 10000);
  });
}

/**
 * Generate ZK proof for contract deployment
 */
async function generateDeploymentProof(
  proofServerUrl: string,
  artifacts: ContractArtifacts,
  deployerAddress: string
): Promise<{ proof: Uint8Array; publicInputs: unknown }> {
  console.log('  Generating ZK proof via proof server...');
  const startTime = Date.now();

  const response = await fetch(`${proofServerUrl}/prove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      circuit: Buffer.from(artifacts.circuit).toString('base64'),
      privateInputs: {
        deployer: deployerAddress,
        initialState: artifacts.initialState
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proof generation failed: ${errorText}`);
  }

  const result = await response.json() as {
    proof: string;
    publicInputs: unknown;
  };

  const elapsed = Date.now() - startTime;
  console.log(`  ✓ Proof generated in ${elapsed}ms`);

  return {
    proof: Buffer.from(result.proof, 'base64'),
    publicInputs: result.publicInputs
  };
}

/**
 * Submit deployment transaction to the network
 */
async function submitDeployment(
  indexerUrl: string,
  proof: Uint8Array,
  publicInputs: unknown,
  deployerAddress: string
): Promise<{ txHash: string; contractAddress: string; blockHeight: number }> {
  console.log('  Submitting deployment transaction...');

  // Submit via GraphQL mutation
  const response = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation DeployContract($input: DeployContractInput!) {
          deployContract(input: $input) {
            txHash
            contractAddress
            blockHeight
            status
          }
        }
      `,
      variables: {
        input: {
          proof: Buffer.from(proof).toString('base64'),
          publicInputs,
          deployer: deployerAddress
        }
      }
    })
  });

  const result = await response.json() as {
    data?: {
      deployContract?: {
        txHash: string;
        contractAddress: string;
        blockHeight: number;
        status: string;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors) {
    throw new Error(`Deployment failed: ${result.errors[0].message}`);
  }

  if (!result.data?.deployContract) {
    throw new Error('No deployment result returned');
  }

  const { txHash, contractAddress, blockHeight } = result.data.deployContract;
  console.log(`  ✓ Transaction submitted: ${txHash}`);
  
  return { txHash, contractAddress, blockHeight };
}

/**
 * Wait for transaction confirmation
 */
async function waitForConfirmation(
  indexerUrl: string,
  txHash: string,
  maxWaitMs: number = 120000
): Promise<{ confirmed: boolean; blockHeight: number }> {
  console.log('  Waiting for confirmation...');
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetTransaction($hash: String!) {
            transaction(hash: $hash) {
              status
              blockHeight
            }
          }
        `,
        variables: { hash: txHash }
      })
    });

    const result = await response.json() as {
      data?: {
        transaction?: {
          status: string;
          blockHeight: number;
        };
      };
    };

    const tx = result.data?.transaction;
    if (tx?.status === 'confirmed') {
      console.log(`  ✓ Confirmed at block ${tx.blockHeight}`);
      return { confirmed: true, blockHeight: tx.blockHeight };
    }

    if (tx?.status === 'failed') {
      throw new Error('Transaction failed on-chain');
    }

    // Wait 3 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 3000));
    process.stdout.write('.');
  }

  console.log('\n  ⚠ Confirmation timeout - transaction may still be pending');
  return { confirmed: false, blockHeight: 0 };
}

/**
 * Main deployment function
 */
async function deploy(config: DeploymentConfig): Promise<DeploymentResult> {
  const networkConfig = NETWORKS[config.network];

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           MidSwap Contract Deployment                       ║');
  console.log('║           Privacy-Preserving DEX on Midnight                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  Network:      ${config.network}`);
  console.log(`  Node RPC:     ${networkConfig.nodeRpc}`);
  console.log(`  Indexer:      ${networkConfig.indexerGraphQL}`);
  console.log(`  Proof Server: ${networkConfig.proofServer}`);
  console.log(`  Fee:          ${config.feeBps / 100}% (${config.feeBps} bps)`);
  console.log(`  Token Pair:   ${config.token0Symbol} / ${config.token1Symbol}`);
  console.log('');

  // Step 1: Check proof server
  console.log('[1/6] Checking proof server...');
  const proofServerOk = await checkProofServer(networkConfig.proofServer);
  if (!proofServerOk) {
    throw new Error(
      'Proof server not running!\n\n' +
      'Start it with:\n' +
      '  docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3\n\n' +
      'Or specify a different URL:\n' +
      '  PROOF_SERVER_URL=http://your-server:6300 pnpm deploy'
    );
  }
  console.log('  ✓ Proof server is healthy\n');

  // Step 2: Load compiled contract
  console.log('[2/6] Loading compiled contract...');
  const artifacts = await loadContractArtifacts('LiquidityPool');
  console.log('  ✓ Contract artifacts loaded\n');

  // Step 3: Get deployer address
  console.log('[3/6] Setting up deployer...');
  const deployerAddress = process.env.DEPLOYER_ADDRESS;
  if (!deployerAddress) {
    throw new Error(
      'DEPLOYER_ADDRESS environment variable not set!\n\n' +
      'Set your Midnight wallet address:\n' +
      '  export DEPLOYER_ADDRESS=mn_addr_preprod1...'
    );
  }
  console.log(`  ✓ Deployer: ${deployerAddress.slice(0, 30)}...\n`);

  // Step 4: Generate deployment proof
  console.log('[4/6] Generating deployment proof...');
  const { proof, publicInputs } = await generateDeploymentProof(
    networkConfig.proofServer,
    artifacts,
    deployerAddress
  );
  console.log('');

  // Step 5: Submit deployment transaction
  console.log('[5/6] Submitting deployment transaction...');
  const { txHash, contractAddress, blockHeight: initialBlock } = await submitDeployment(
    networkConfig.indexerGraphQL,
    proof,
    publicInputs,
    deployerAddress
  );
  console.log(`  Contract Address: ${contractAddress}\n`);

  // Step 6: Wait for confirmation
  console.log('[6/6] Waiting for confirmation...');
  const { confirmed, blockHeight } = await waitForConfirmation(
    networkConfig.indexerGraphQL,
    txHash
  );
  console.log('');

  // Save deployment result
  const result: DeploymentResult = {
    network: config.network,
    contractName: 'LiquidityPool',
    contractAddress,
    deployedAt: new Date().toISOString(),
    txHash,
    deployer: deployerAddress,
    blockHeight: confirmed ? blockHeight : initialBlock,
    initialConfig: {
      feeBps: config.feeBps,
      token0: config.token0Symbol,
      token1: config.token1Symbol
    }
  };

  // Save to deployments directory
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${config.network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));

  // Print summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Deployment Complete!                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`TX Hash:          ${txHash}`);
  console.log(`Block Height:     ${blockHeight}`);
  console.log(`Network:          ${config.network}`);
  console.log(`Saved to:         ${deploymentFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('1. Create .env.local with the pool address:');
  console.log(`   echo "VITE_POOL_TNIGHT_MUSDC=${contractAddress}" >> .env.local`);
  console.log('');
  console.log('2. Initialize the pool with liquidity:');
  console.log('   pnpm --filter @midswap/contracts run init-pool');
  console.log('');
  console.log('3. Start the frontend:');
  console.log('   pnpm --filter @midswap/web dev');
  console.log('');

  return result;
}

// Parse command line arguments
function parseArgs(): DeploymentConfig {
  const args = process.argv.slice(2);
  
  return {
    network: (args.find(a => a.startsWith('--network='))?.split('=')[1] || 
              process.env.NETWORK || 
              'preprod') as 'preprod' | 'mainnet',
    feeBps: parseInt(args.find(a => a.startsWith('--fee='))?.split('=')[1] || '30'),
    token0Symbol: args.find(a => a.startsWith('--token0='))?.split('=')[1] || 'tNight',
    token1Symbol: args.find(a => a.startsWith('--token1='))?.split('=')[1] || 'mUSDC'
  };
}

// Main execution
const config = parseArgs();

deploy(config)
  .then((result) => {
    console.log('✓ Deployment successful!');
    console.log(`  Address: ${result.contractAddress}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('');
    console.error('1. Ensure proof server is running:');
    console.error('   docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3');
    console.error('');
    console.error('2. Ensure contract is compiled:');
    console.error('   pnpm --filter @midswap/contracts build');
    console.error('');
    console.error('3. Set your deployer address:');
    console.error('   export DEPLOYER_ADDRESS=mn_addr_preprod1...');
    console.error('');
    console.error('4. Ensure you have tDUST tokens from the faucet:');
    console.error('   https://faucet.preprod.midnight.network');
    console.error('');
    process.exit(1);
  });
