import * as ledgerSdk from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

const { Intent, Transaction } = ledgerSdk;
const ttl = new Date(Date.now() + 10 * 60 * 1000);

// Simulate rapid-fire calls like the retry loop would do
const results: number[] = [];
for (let i = 0; i < 30; i++) {
  const intent = Intent.new(ttl);
  const tx = Transaction.fromPartsRandomized('preprod', undefined, undefined, intent);
  for (const [k] of (tx.intents as any).entries()) {
    results.push(k);
  }
}
console.log('30 rapid-fire segment_ids:', results.join(', '));

// Check uniqueness
const unique = new Set(results);
console.log(`Unique segments: ${unique.size} / 30`);

// Simulate what happens during retry - same intent object reused
const fixedIntent = Intent.new(ttl);
fixedIntent.dustActions = {} as any; // minimal setup
const reusedResults: number[] = [];
for (let i = 0; i < 10; i++) {
  const intent2 = Intent.new(ttl);
  const tx2 = Transaction.fromPartsRandomized('preprod', undefined, undefined, intent2);
  for (const [k] of (tx2.intents as any).entries()) {
    reusedResults.push(k);
  }
}
console.log('10 retry-sim segment_ids:', reusedResults.join(', '));
