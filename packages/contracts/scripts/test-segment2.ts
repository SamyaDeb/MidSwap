import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

const { Intent, Transaction } = ledgerSdk;
const ttl = new Date(Date.now() + 10 * 60 * 1000);

// Simulate what dryRunFee does - create 20 transactions and check their segment_ids
const segmentIds: number[] = [];
for (let i = 0; i < 20; i++) {
  const intent = Intent.new(ttl);
  const tx = Transaction.fromPartsRandomized('preprod', undefined, undefined, intent);
  const erased = tx.eraseProofs();
  for (const [k] of (erased.intents as any).entries()) {
    segmentIds.push(k);
  }
}
console.log('fromPartsRandomized segment_ids:', segmentIds.join(', '));
console.log('Any duplicates?', segmentIds.length !== new Set(segmentIds).size);
console.log('Does 56056 appear?', segmentIds.includes(56056));

// What about fromParts (non-randomized)?
const intent2 = Intent.new(ttl);
const tx2 = Transaction.fromParts('preprod', undefined, undefined, intent2);
const erased2 = tx2.eraseProofs();
for (const [k] of (erased2.intents as any).entries()) {
  console.log('fromParts (non-randomized) segment_id after eraseProofs:', k);
}
