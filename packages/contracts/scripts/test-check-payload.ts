/**
 * Minimal test: verify createCheckPayload works with .bzkir vs .zkir
 * and the proof server accepts the payload.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createCheckPayload, parseCheckResult, createProvingPayload } from '@midnight-ntwrk/ledger-v8';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROOF_SERVER = process.env.PROOF_SERVER_URL || 'http://localhost:6300';

async function main() {
  const bzkir = new Uint8Array(fs.readFileSync(path.join(__dirname, '../managed/OptimalAMM/zkir/addLiquidity.bzkir')));
  const zkir = new Uint8Array(fs.readFileSync(path.join(__dirname, '../managed/OptimalAMM/zkir/addLiquidity.zkir')));
  console.log(`bzkir size: ${bzkir.length} bytes`);
  console.log(`zkir  size: ${zkir.length} bytes`);

  const dummyPreimage = new Uint8Array(32); // Not a real preimage, just testing payload format

  // Test 1: .bzkir format
  console.log('\n--- Test 1: createCheckPayload with .bzkir ---');
  try {
    const payload = createCheckPayload(dummyPreimage, bzkir);
    console.log(`✓ Payload created, size: ${payload.length} bytes`);
    
    const resp = await fetch(`${PROOF_SERVER}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    console.log(`  Proof server response: ${resp.status} ${resp.statusText}`);
    if (resp.ok) {
      const result = new Uint8Array(await resp.arrayBuffer());
      console.log(`  Result size: ${result.length} bytes`);
      try {
        const parsed = parseCheckResult(result);
        console.log(`  Parsed check result: ${JSON.stringify(parsed.map(v => v?.toString()))}`);
      } catch (e: any) {
        console.log(`  Parse error (expected with dummy preimage): ${e.message?.slice(0, 100)}`);
      }
    } else {
      const body = await resp.text();
      console.log(`  Error body: ${body.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`✗ Failed: ${e.message}`);
  }

  // Test 2: .zkir (text) format — expected to fail
  console.log('\n--- Test 2: createCheckPayload with .zkir (text) ---');
  try {
    const payload = createCheckPayload(dummyPreimage, zkir);
    console.log(`✓ Payload created, size: ${payload.length} bytes`);
    
    const resp = await fetch(`${PROOF_SERVER}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    console.log(`  Proof server response: ${resp.status} ${resp.statusText}`);
    if (!resp.ok) {
      const body = await resp.text();
      console.log(`  Error body: ${body.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`✗ Failed: ${e.message}`);
  }

  // Test 3: No IR at all
  console.log('\n--- Test 3: createCheckPayload with no IR ---');
  try {
    const payload = createCheckPayload(dummyPreimage, undefined);
    console.log(`✓ Payload created, size: ${payload.length} bytes`);
    
    const resp = await fetch(`${PROOF_SERVER}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    console.log(`  Proof server response: ${resp.status} ${resp.statusText}`);
  } catch (e: any) {
    console.log(`✗ Failed: ${e.message}`);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
