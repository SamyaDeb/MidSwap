import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

const { Intent, Transaction } = ledgerSdk;
const ttl = new Date(Date.now() + 10 * 60 * 1000);

for (let i = 0; i < 5; i++) {
  const intent = Intent.new(ttl);
  const tx = Transaction.fromPartsRandomized('preprod', undefined, undefined, intent);
  console.log(`attempt ${i+1}: intents map size: ${tx.intents?.size}`);
  if (tx.intents) {
    for (const [k, v] of (tx.intents as any).entries()) {
      console.log(`  segment_id: ${k}`);
    }
  }
  // Also try eraseProofs
  const erased = tx.eraseProofs();
  if (erased.intents) {
    for (const [k, v] of (erased.intents as any).entries()) {
      console.log(`  after eraseProofs segment_id: ${k}`);
    }
  }
}
