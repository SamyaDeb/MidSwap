/**
 * Automated MidSwap Contract Deployment Script
 * 
 * Deploy the LiquidityPool contract to Midnight Preprod using seed phrase
 * 
 * Prerequisites:
 * 1. Proof server running: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
 * 2. Contract compiled: pnpm --filter @midswap/contracts build
 * 3. DEPLOYER_SEED_PHRASE environment variable set
 * 
 * Usage:
 *   DEPLOYER_SEED_PHRASE="your seed phrase" pnpm --filter @midswap/contracts deploy:auto
 * 
 * Security:
 *   - Seed phrase is read from environment variable only
 *   - Never hardcode seed phrases in code or commit them to git
 *   - Add .env.deployment to .gitignore
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

// Enable WebSocket for GraphQL subscriptions in Node.js
(globalThis as any).WebSocket = WebSocket;

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { validateSeedPhrase, toHexString, checkSecurityWarnings } from './wallet-utils.js';
import { Contract, type Witnesses } from '../managed/OptimalAMM/contract/index.js';
import { createWitnesses } from '../src/witnesses.js';
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
import { UnshieldedWallet, createKeystore, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';

// Network configuration
const NETWORKS = {
  preprod: {
    networkId: 'preprod' as NetworkId,
    indexerHttp: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeRpc: 'wss://rpc.preprod.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
    faucetUrl: 'https://faucet.preprod.midnight.network'
  },
  mainnet: {
    networkId: 'mainnet' as NetworkId,
    indexerHttp: 'https://indexer.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.midnight.network/api/v4/graphql',
    nodeRpc: 'wss://rpc.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL || 'http://localhost:6300',
    faucetUrl: undefined
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

type AddressLike = {
  toString?: () => string;
  asString?: () => string;
  hexString?: string;
};

function formatAddress(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = value as AddressLike;
    if (typeof candidate.asString === 'function') {
      return candidate.asString();
    }
    if (typeof candidate.hexString === 'string') {
      return candidate.hexString;
    }
    if (typeof candidate.toString === 'function') {
      const str = candidate.toString();
      if (str && str !== '[object Object]') {
        return str;
      }
    }
  }

  return String(value);
}

interface DeploymentConfig {
  network: 'preprod' | 'mainnet';
  feeBps: number;
  token0Symbol: string;
  token1Symbol: string;
  deployerSeed: string;
}

// Type for our contract's private state (empty for now)
type LiquidityPoolPrivateState = Record<string, never>;

const PRIVATE_STATE_KEY = 'liquidityPoolPrivateState';
const TX_STATUS_SUCCESS = 'SucceedEntirely';

/**
 * Derive a role key from account key, with retry logic for failed derivations
 */
function deriveRoleKey(accountKey: AccountKey, role: Role, addressIndex: number = 0): Buffer {
  const result = accountKey.selectRole(role).deriveKeyAt(addressIndex);
  if (result.type === 'keyDerived') {
    return Buffer.from(result.key);
  }
  // Small possibility of derivation failing, retry with next index
  return deriveRoleKey(accountKey, role, addressIndex + 1);
}

/**
 * Derive all wallet keys from seed
 */
function deriveAllKeys(seed: Uint8Array) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to derive keys from seed');
  }

  const account = hdWallet.hdWallet.selectAccount(0);
  const shieldedSeed = deriveRoleKey(account, Roles.Zswap);
  const dustSeed = deriveRoleKey(account, Roles.Dust);
  const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);

  hdWallet.hdWallet.clear(); // Clear HDWallet to avoid holding private key in memory

  return {
    shielded: { seed: shieldedSeed, keys: ledger.ZswapSecretKeys.fromSeed(shieldedSeed) },
    dust: { seed: dustSeed, key: ledger.DustSecretKey.fromSeed(dustSeed) },
    unshielded: unshieldedKey,
  };
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
 * Check if contract artifacts exist
 */
function checkContractArtifacts(contractName: string): boolean {
  const managedPath = path.join(__dirname, '../managed', contractName);
  const contractDir = path.join(managedPath, 'contract');
  const compilerDir = path.join(managedPath, 'compiler');
  
  if (!fs.existsSync(contractDir) || !fs.existsSync(compilerDir)) {
    return false;
  }
  
  const contractJsPath = path.join(contractDir, 'index.js');
  const contractInfoPath = path.join(compilerDir, 'contract-info.json');
  
  return fs.existsSync(contractJsPath) && fs.existsSync(contractInfoPath);
}

/**
 * Get compiled contract metadata
 */
function getCompiledContract() {
  const contractInfoPath = path.join(__dirname, '../managed/OptimalAMM/compiler/contract-info.json');
  const contractInfo = JSON.parse(fs.readFileSync(contractInfoPath, 'utf-8'));
  
  return {
    packageName: contractInfo.packageName || '@midswap/contracts',
    contractName: contractInfo.contractName || 'LiquidityPool',
    version: contractInfo.version || '0.1.0',
  };
}

/**
 * Main deployment function
 */
async function deploy(config: DeploymentConfig): Promise<DeploymentResult> {
  const networkConfig = NETWORKS[config.network];

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        MidSwap Automated Contract Deployment               ║');
  console.log('║        Privacy-Preserving DEX on Midnight                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  Network:      ${config.network}`);
  console.log(`  Node RPC:     ${networkConfig.nodeRpc}`);
  console.log(`  Indexer HTTP: ${networkConfig.indexerHttp}`);
  console.log(`  Indexer WS:   ${networkConfig.indexerWs}`);
  console.log(`  Proof Server: ${networkConfig.proofServer}`);
  console.log(`  Fee:          ${config.feeBps / 100}% (${config.feeBps} bps)`);
  console.log(`  Token Pair:   ${config.token0Symbol} / ${config.token1Symbol}`);
  console.log('');

  // Security warnings
  const warnings = checkSecurityWarnings();
  if (warnings.length > 0) {
    console.log('⚠️  Security Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
    console.log('');
  }

  // Step 1: Set network ID (REQUIRED before any operations)
  console.log('[1/10] Setting network ID...');
  setNetworkId(networkConfig.networkId);
  console.log(`  ✓ Network set to: ${networkConfig.networkId}\n`);

  // Step 2: Validate seed phrase
  console.log('[2/10] Validating seed phrase...');
  if (!validateSeedPhrase(config.deployerSeed)) {
    throw new Error('Invalid seed phrase');
  }
  console.log('  ✓ Seed phrase validated\n');

  // Step 3: Check proof server
  console.log('[3/10] Checking proof server...');
  const proofServerOk = await checkProofServer(networkConfig.proofServer);
  if (!proofServerOk) {
    throw new Error(
      'Proof server not running!\n\n' +
      'Start it with:\n' +
      '  docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3\n\n' +
      'Or specify a different URL:\n' +
      '  PROOF_SERVER_URL=http://your-server:6300 pnpm deploy:auto'
    );
  }
  console.log('  ✓ Proof server is healthy\n');

  // Step 4: Check compiled contract
  console.log('[4/10] Checking compiled contract...');
  if (!checkContractArtifacts('OptimalAMM')) {
    throw new Error(
      'Contract not compiled!\n\n' +
      'Run the following command to compile:\n' +
      '  pnpm --filter @midswap/contracts build\n'
    );
  }
  const compiledContract = getCompiledContract();
  console.log(`  ✓ Contract artifacts found: ${compiledContract.contractName} v${compiledContract.version}\n`);

  // Step 5: Derive keys from seed phrase
  console.log('[5/10] Deriving wallet keys...');
  const seedBytes = mnemonicToSeedSync(config.deployerSeed, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  console.log(`  ✓ Night key: ${toHexString(derivedKeys.unshielded).slice(0, 16)}...`);
  console.log(`  ✓ Dust key:  ${toHexString(derivedKeys.dust.seed).slice(0, 16)}...`);
  console.log(`  ✓ Zswap key: ${toHexString(derivedKeys.shielded.seed).slice(0, 16)}...\n`);

  // Step 6: Initialize wallet
  console.log('[6/10] Initializing wallet...');

  const walletConfig: DefaultConfiguration = {
    networkId: networkConfig.networkId,
    costParameters: {
      feeBlocksMargin: 5,
    },
    relayURL: new URL(networkConfig.nodeRpc),
    provingServerUrl: new URL(networkConfig.proofServer),
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexerHttp,
      indexerWsUrl: networkConfig.indexerWs,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const unshieldedKeystore = createKeystore(
    derivedKeys.unshielded,
    networkConfig.networkId
  );

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) =>
      ShieldedWallet(cfg).startWithSecretKeys(derivedKeys.shielded.keys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore)
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        derivedKeys.dust.key,
        ledger.LedgerParameters.initialParameters().dust
      ),
  });

  await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);
  console.log('  ✓ Wallet initialized and started\n');

  // Step 7: Wait for wallet sync (with timeout)
  console.log('[7/10] Syncing wallet state...');
  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '120000', 10);
  try {
    const syncedState = await Promise.race([
      wallet.waitForSyncedState(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Wallet sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`)), SYNC_TIMEOUT_MS)
      ),
    ]);
    console.log(`  ✓ Wallet fully synced`);
    console.log(`  ✓ Unshielded balance: ${(syncedState as any).unshielded?.balances} tDUST`);
    console.log(`  ✓ DUST balance: ${(syncedState as any).dust?.totalCoins}\n`);
  } catch (syncErr) {
    const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
    if (msg.includes('timed out')) {
      console.warn(`  ⚠ ${msg}`);
      console.warn('  Attempting deployment anyway (may fail if wallet has no dust UTxOs).');
      console.warn('  If this fails, ensure your wallet is funded from the faucet and try again.\n');
    } else {
      throw syncErr;
    }
  }

  // Step 8: Configure providers for contract deployment
  console.log('[8/10] Configuring providers for deployment...');
  
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';

  const privateStateProvider = await levelPrivateStateProvider<
    typeof PRIVATE_STATE_KEY,
    LiquidityPoolPrivateState
  >({
    privateStoragePasswordProvider: () => privateStatePassword,
    accountId: 'deployer',
    privateStateStoreName: path.join(__dirname, '../.private-state')
  });
  
  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexerHttp,
    networkConfig.indexerWs
  );
  
  const zkConfigProvider = new NodeZkConfigProvider(
    path.join(__dirname, '../managed/OptimalAMM')
  );
  
  const proofProvider = httpClientProofProvider(
    networkConfig.proofServer,
    zkConfigProvider
  );

  // Create wallet provider adapter
  const walletProvider = {
    // NOTE: balanceTx receives an UnboundTransaction (proven but not yet finalized) from
    // proofProvider.proveTx(). We use balanceUnboundTransaction with tokenKindsToBalance: ['dust']
    // to add only dust fee payments (our contract does no unshielded token transfers).
    // Using balanceFinalizedTransaction was WRONG — it tries to merge a FinalizedTransaction
    // with a dust payment tx which throws "Both transactions need to be of the same type".
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
        }
      );
      return wallet.finalizeRecipe(recipe);
    },
    getCoinPublicKey: () => derivedKeys.shielded.keys.coinPublicKey,
    getEncryptionPublicKey: () => derivedKeys.shielded.keys.encryptionPublicKey,
  };

  // Create midnight provider adapter
  const midnightProvider = {
    submitTx: async (tx: ledger.FinalizedTransaction) => {
      const txId = await wallet.submitTransaction(tx);
      // Return as TransactionId type
      return txId as any;
    },
  };

  console.log('  ✓ Providers configured\n');

  // Step 9: Deploy contract
  console.log('[9/10] Deploying contract to network...');
  console.log('  This may take several minutes while ZK proofs are generated...');
  
  let deployTxHash: string;
  let contractAddress: ContractAddress;
  let blockHeight: number = 0;
  
  try {
    // For new contract deployment, use empty initial private state
    // Note: We don't try to access privateStateProvider.get() here because
    // the contract address isn't set yet (we're deploying a new contract)
    const initialPrivateState: LiquidityPoolPrivateState = {};
    
    // Create witnesses for the contract
    const witnesses = createWitnesses<LiquidityPoolPrivateState>();
    
    // Path to compiled contract assets (relative to where the script runs from)
    const compiledAssetsPath = path.join(__dirname, '..', 'managed', 'OptimalAMM');
    
    // Create a CompiledContract using the compact-js API
    // The CompiledContract.make function expects the contract tag and constructor
    const compiledContract = CompiledContract.make<Contract<LiquidityPoolPrivateState>, LiquidityPoolPrivateState>(
      'OptimalAMM',
      Contract
    ).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(compiledAssetsPath)
    );
    
    // Combine all providers
    const providers = {
      privateStateProvider,
      publicDataProvider,
      proofProvider,
      zkConfigProvider,
      walletProvider,
      midnightProvider,
    };

    // Deploy using midnight-js-contracts API
    // Our contract's initialState() takes no arguments, so args should be []
    const deployedContract = await deployContract(providers as any, {
      compiledContract: compiledContract as any,
      privateStateId: PRIVATE_STATE_KEY,
      initialPrivateState,
      args: [] as const,
    });
    
    if (deployedContract.deployTxData.public.status !== TX_STATUS_SUCCESS) {
      throw new Error(
        `Deployment transaction finalized with non-success status: ${deployedContract.deployTxData.public.status}`
      );
    }

    deployTxHash = deployedContract.deployTxData.public.txHash;
    contractAddress = deployedContract.deployTxData.public.contractAddress;
    blockHeight = deployedContract.deployTxData.public.blockHeight || 0;
    
    console.log(`  ✓ Deployment transaction submitted: ${deployTxHash}`);
    console.log(`  ✓ Contract Address: ${contractAddress}`);
    console.log(`  ✓ Block Height: ${blockHeight}\n`);
  } catch (error) {
    if (error instanceof Error) {
      console.error('  ✗ Deployment failed:', error.message);
      
      // Check for common issues
      if (error.message.includes('insufficient funds') || error.message.includes('balance')) {
        console.error('\n  💡 Hint: Your wallet may need tDUST tokens from the faucet:');
        if (networkConfig.faucetUrl) {
          console.error(`      ${networkConfig.faucetUrl}`);
        }
      }
    }
    await wallet.stop();
    throw error;
  }

  // Step 10: Save deployment result
  console.log('[10/10] Saving deployment information...');
  
  // Get deployer address from wallet
  const deployerAddress = await wallet.unshielded.getAddress();

  // Create deployment result
  const result: DeploymentResult = {
    network: config.network,
    contractName: 'OptimalAMM',
    contractAddress,
    deployedAt: new Date().toISOString(),
    txHash: deployTxHash,
    deployer: formatAddress(deployerAddress),
    blockHeight,
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

  const deploymentFile = path.join(deploymentsDir, `${config.network}-automated.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
  console.log(`  ✓ Saved to: ${deploymentFile}\n`);

  // Stop wallet
  await wallet.stop();

  // Print summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              Automated Deployment Complete!                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`TX Hash:          ${deployTxHash}`);
  console.log(`Block Height:     ${blockHeight || 'pending'}`);
  console.log(`Network:          ${config.network}`);
  console.log(`Deployer Address: ${result.deployer}`);
  console.log(`Saved to:         ${deploymentFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('1. Update .env.local with the pool address:');
  console.log(`   echo "VITE_POOL_TNIGHT_MUSDC=${contractAddress}" >> ../../.env.local`);
  console.log('');
  console.log('2. Initialize the pool with liquidity (after contract is deployed):');
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
  
  const deployerSeed = process.env.DEPLOYER_SEED_PHRASE;
  if (!deployerSeed) {
    console.error('❌ Error: DEPLOYER_SEED_PHRASE environment variable not set!\n');
    console.error('Usage:');
    console.error('  DEPLOYER_SEED_PHRASE="your 24 word seed phrase" pnpm --filter @midswap/contracts deploy:auto\n');
    console.error('Security:');
    console.error('  - Use .env.deployment file (add to .gitignore)');
    console.error('  - Never commit seed phrases to git');
    console.error('  - Use a dedicated deployment wallet on mainnet\n');
    process.exit(1);
  }
  
  return {
    network: (args.find(a => a.startsWith('--network='))?.split('=')[1] || 
              process.env.NETWORK || 
              'preprod') as 'preprod' | 'mainnet',
    feeBps: parseInt(args.find(a => a.startsWith('--fee='))?.split('=')[1] || '30'),
    token0Symbol: args.find(a => a.startsWith('--token0='))?.split('=')[1] || 'tNight',
    token1Symbol: args.find(a => a.startsWith('--token1='))?.split('=')[1] || 'mUSDC',
    deployerSeed
  };
}

// Main execution
const config = parseArgs();

deploy(config)
  .then((result) => {
    console.log('✅ Automated deployment successful!');
    console.log(`   Address: ${result.contractAddress}`);
    console.log(`   TX Hash: ${result.txHash}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\nTroubleshooting:');
    console.error('');
    console.error('1. Ensure proof server is running:');
    console.error('   docker ps | grep proof-server');
    console.error('   docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3');
    console.error('');
    console.error('2. Ensure contract is compiled:');
    console.error('   pnpm --filter @midswap/contracts build');
    console.error('');
    console.error('3. Ensure seed phrase is valid (24 words):');
    console.error('   echo $DEPLOYER_SEED_PHRASE | wc -w');
    console.error('');
    console.error('4. Ensure you have tDUST tokens from the faucet:');
    console.error('   https://faucet.preprod.midnight.network');
    console.error('');
    process.exit(1);
  });
