#!/usr/bin/env node
/**
 * Check if Compact compiler is available
 */

const { execSync } = require('child_process');

console.log('Checking Compact compiler installation...\n');

try {
  const version = execSync('compact --version', { encoding: 'utf-8' }).trim();
  console.log(`✓ Compact compiler found: ${version}`);
  process.exit(0);
} catch {
  console.log('✗ Compact compiler (compact) not found\n');
  console.log('To install the Compact compiler:');
  console.log('');
  console.log('  Option 1: Install compact toolchain');
  console.log('    curl --proto "=https" --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh');
  console.log('');
  console.log('  Option 2: Compile directly with compact');
  console.log('    compact compile src/LiquidityPool.compact managed/LiquidityPool');
  console.log('');
  console.log('  Option 3: Midnight docs');
  console.log('    https://docs.midnight.network/compact');
  console.log('');
  process.exit(1);
}
