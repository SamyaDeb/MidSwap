import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, type Witnesses, ledger as decodeLedger } from '../managed/OptimalAMM/contract/index.js';
import { createWitnesses } from '../src/witnesses.js';
import { validateSeedPhrase, toHexString } from './wallet-utils.js';

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

type CliConfig = {
  network: 'preprod' | 'mainnet';
  contractAddress: string;
  amount0: bigint;
  amount1: bigint;
  feeBps: bigint;
  seedPhrase: string;
};

function deriveRoleKey(accountKey: AccountKey, role: Role, addressIndex: number = 0): Buffer {
  const result = accountKey.selectRole(role).deriveKeyAt(addressIndex);
  if (result.type === 'keyDerived') {
    return Buffer.from(result.key);
  }
  return deriveRoleKey(accountKey, role, addressIndex + 1);
}

function deriveAllKeys(seed: Uint8Array) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to derive keys from seed');
  }

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

function parseConfig(): CliConfig {
  const args = process.argv.slice(2);
  const seedPhrase = process.env.DEPLOYER_SEED_PHRASE;
  if (!seedPhrase) {
    throw new Error('DEPLOYER_SEED_PHRASE environment variable is required');
  }

  const contractAddress =
    args.find((a) => a.startsWith('--contract='))?.split('=')[1] ||
    process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS is required (set --contract=... or CONTRACT_ADDRESS env var)');
  }

  const amount0Raw =
    args.find((a) => a.startsWith('--amount0='))?.split('=')[1] ||
    process.env.INIT_AMOUNT0 ||
    '1000000';
  const amount1Raw =
    args.find((a) => a.startsWith('--amount1='))?.split('=')[1] ||
    process.env.INIT_AMOUNT1 ||
    '1000000';
  const feeRaw =
    args.find((a) => a.startsWith('--fee='))?.split('=')[1] ||
    process.env.INIT_FEE_BPS ||
    '30';

  const network =
    (args.find((a) => a.startsWith('--network='))?.split('=')[1] ||
      process.env.NETWORK ||
      'preprod') as 'preprod' | 'mainnet';

  return {
    network,
    contractAddress,
    amount0: BigInt(amount0Raw),
    amount1: BigInt(amount1Raw),
    feeBps: BigInt(feeRaw),
    seedPhrase,
  };
}

async function main(): Promise<void> {
  const config = parseConfig();
  const networkConfig = NETWORKS[config.network];

  if (!validateSeedPhrase(config.seedPhrase)) {
    throw new Error('Invalid seed phrase');
  }

  setNetworkId(networkConfig.networkId);

  console.log('Initializing pool on-chain...');
  console.log(`  Network: ${config.network}`);
  console.log(`  Contract: ${config.contractAddress}`);
  console.log(`  amount0: ${config.amount0}`);
  console.log(`  amount1: ${config.amount1}`);
  console.log(`  feeBps: ${config.feeBps}`);

  const seedBytes = mnemonicToSeedSync(config.seedPhrase, '');
  const derivedKeys = deriveAllKeys(seedBytes);
  console.log(`  Derived Night key: ${toHexString(derivedKeys.unshielded).slice(0, 16)}...`);

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
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        derivedKeys.dust.key,
        ledgerSdk.LedgerParameters.initialParameters().dust
      ),
  });

  await wallet.start(derivedKeys.shielded.keys, derivedKeys.dust.key);

  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '120000', 10);
  try {
    try {
      const synced = await Promise.race([
        wallet.waitForSyncedState(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`)), SYNC_TIMEOUT_MS)
        ),
      ]);
      console.log(`  Wallet synced. Unshielded: ${(synced as any).unshielded?.balances}`);
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      if (msg.includes('timed out')) {
        console.warn(`  ⚠ ${msg} — attempting init anyway`);
      } else {
        throw syncErr;
      }
    }

    const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD || 'MidSwap#Preprod2026';

    const privateStateProvider = await levelPrivateStateProvider<
      typeof PRIVATE_STATE_KEY,
      LiquidityPoolPrivateState
    >({
      privateStoragePasswordProvider: () => privateStatePassword,
      accountId: 'deployer',
      privateStateStoreName: path.join(__dirname, '../.private-state'),
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

    const midnightProvider = {
      submitTx: async (tx: ledgerSdk.FinalizedTransaction) => wallet.submitTransaction(tx) as any,
    };

    const witnesses = createWitnesses<LiquidityPoolPrivateState>();
    const compiledContract = CompiledContract.make<
      Contract<LiquidityPoolPrivateState, Witnesses<LiquidityPoolPrivateState>>,
      LiquidityPoolPrivateState
    >('OptimalAMM', Contract).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(path.join(__dirname, '..', 'managed', 'OptimalAMM'))
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
      contractAddress: config.contractAddress as unknown as ContractAddress,
      privateStateId: PRIVATE_STATE_KEY,
    });

    const depositorHex = unshieldedKeystore.getAddress();
    const depositorBytes = Buffer.from(depositorHex, 'hex');
    if (depositorBytes.length !== 32) {
      throw new Error(`Expected 32-byte depositor id, got ${depositorBytes.length}`);
    }

    try {
      const initResult = await contract.callTx.initialize(
        config.amount0,
        config.amount1,
        new Uint8Array(depositorBytes),
        config.feeBps
      );

      if (String(initResult.public.status) !== TX_STATUS_SUCCESS) {
        throw new Error(`Initialize tx failed with status ${initResult.public.status}`);
      }

      console.log('  Pool initialized successfully.');
      console.log(`  Initialize TX Hash: ${initResult.public.txHash}`);
      console.log(`  Initialize Block Height: ${initResult.public.blockHeight}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Pool already initialized')) {
        console.log('  Pool is already initialized on-chain.');
      } else {
        throw error;
      }
    }

    const contractState = await publicDataProvider.queryContractState(
      config.contractAddress as unknown as ContractAddress
    );
    if (contractState) {
      console.log('  Contract state query succeeded after initialization.');
    } else {
      console.log('  Contract state query returned null.');
    }
  } finally {
    await wallet.stop();
  }
}

main().catch((error) => {
  console.error('Failed to initialize pool:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
