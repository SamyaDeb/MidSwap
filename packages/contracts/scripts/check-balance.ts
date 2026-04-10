/**
 * Check deployer wallet balance
 */
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type Role, type AccountKey } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_PHRASE = process.env.DEPLOYER_SEED_PHRASE!;
if (!SEED_PHRASE) throw new Error('DEPLOYER_SEED_PHRASE required');

setNetworkId('preprod');

function deriveRoleKey(accountKey: AccountKey, role: Role, idx = 0): Buffer {
  const r = accountKey.selectRole(role).deriveKeyAt(idx);
  if (r.type === 'keyDerived') return Buffer.from(r.key);
  return deriveRoleKey(accountKey, role, idx + 1);
}

async function main() {
  const seedBytes = mnemonicToSeedSync(SEED_PHRASE, '');
  const hdWallet = HDWallet.fromSeed(seedBytes);
  if (hdWallet.type !== 'seedOk') throw new Error('Bad seed');
  const account = hdWallet.hdWallet.selectAccount(0);
  const shieldedSeed = deriveRoleKey(account, Roles.Zswap);
  const dustSeed = deriveRoleKey(account, Roles.Dust);
  const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);
  hdWallet.hdWallet.clear();

  const shieldedKeys = ledgerSdk.ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustKey = ledgerSdk.DustSecretKey.fromSeed(dustSeed);

  const walletConfig: DefaultConfiguration = {
    networkId: 'preprod',
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL('wss://rpc.preprod.midnight.network'),
    provingServerUrl: new URL('http://localhost:6300'),
    indexerClientConnection: {
      indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
      indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const unshieldedKeystore = createKeystore(unshieldedKey, 'preprod');

  console.log('Initializing wallet...');
  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustKey, ledgerSdk.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedKeys, dustKey);

  const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS || '300000', 10);
  console.log(`Syncing wallet (timeout ${SYNC_TIMEOUT_MS / 1000}s)...`);

  try {
    const state = await Promise.race([
      wallet.waitForSyncedState(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Sync timed out`)), SYNC_TIMEOUT_MS)
      ),
    ]);

    console.log('\n=== WALLET STATE ===');
    console.log('Dust wallet:');
    const dustState = (state as any).dust;
    console.log('  Total coins:', dustState?.totalCoins?.toString());
    console.log('  Available coins:', dustState?.availableCoins?.toString());
    console.log('  Pending coins:', dustState?.pendingCoins?.toString());
    const now = new Date();
    const balance = dustState?.balance(now);
    console.log('  Balance:', JSON.stringify(balance, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    console.log('\nUnshielded wallet:');
    const unshieldedState = (state as any).unshielded;
    console.log('  Address:', unshieldedKeystore.getAddress());
    console.log('  State:', JSON.stringify(unshieldedState, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)?.slice(0, 500));

  } catch (e) {
    console.error('Sync failed:', e instanceof Error ? e.message : String(e));
  } finally {
    await wallet.stop();
  }
}

main().catch(e => {
  console.error('Failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
