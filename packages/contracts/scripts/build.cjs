#!/usr/bin/env node
/**
 * Smart build script for Midnight Compact contracts
 * Handles missing compactc compiler gracefully
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MANAGED_DIR = path.join(__dirname, '..', 'managed');
const CONTRACT_SOURCE = path.join(__dirname, '..', 'src', 'LiquidityPool.compact');
const CONTRACT_TARGET = path.join(MANAGED_DIR, 'LiquidityPool');

// Ensure managed directory exists
if (!fs.existsSync(MANAGED_DIR)) {
  fs.mkdirSync(MANAGED_DIR, { recursive: true });
}

// Check if compactc is available
function checkCompiler() {
  const result = spawnSync('compact', ['--version'], {
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  return result.status === 0;
}

// Check if pre-compiled artifacts exist
function hasPrecompiledArtifacts() {
  const requiredFiles = [
    path.join('LiquidityPool', 'contract', 'index.js'),
    path.join('LiquidityPool', 'contract', 'index.d.ts'),
    path.join('LiquidityPool', 'compiler', 'contract-info.json')
  ];

  return requiredFiles.every(file => 
    fs.existsSync(path.join(MANAGED_DIR, file))
  );
}

async function main() {
  console.log('MidSwap Contract Build');
  console.log('======================\n');

  const hasCompiler = checkCompiler();
  const hasArtifacts = hasPrecompiledArtifacts();

  if (hasCompiler) {
    console.log('Found compact compiler, compiling contract...');
    try {
      if (!fs.existsSync(CONTRACT_TARGET)) {
        fs.mkdirSync(CONTRACT_TARGET, { recursive: true });
      }

      execSync(`compact compile "${CONTRACT_SOURCE}" "${CONTRACT_TARGET}"`, {
        stdio: 'inherit'
      });
      console.log('\nContract compiled successfully!');
      return 0;
    } catch (error) {
      console.error('\nCompilation failed:', error.message);
      return 1;
    }
  }

  if (hasArtifacts) {
    console.log('compact compiler not found, but pre-compiled artifacts exist.');
    console.log('Using existing artifacts in managed/ directory.');
    console.log('\nTo recompile, install the Midnight SDK:');
    console.log('  https://docs.midnight.network/develop/getting-started');
    return 0;
  }

  // No compiler and no artifacts
  console.log('WARNING: compact compiler not found and no pre-compiled artifacts.');
  console.log('\nThe contract cannot be deployed without compiled artifacts.');
  console.log('Please either:');
  console.log('  1. Install compact toolchain:');
  console.log('     curl --proto "=https" --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh');
  console.log('');
  console.log('  2. Or install the Midnight SDK (includes Compact tooling):');
  console.log('     https://docs.midnight.network/develop/getting-started');
  console.log('\n  3. Or copy pre-compiled artifacts to packages/contracts/managed/LiquidityPool/');
  console.log('     Required: contract/index.js, contract/index.d.ts, compiler/contract-info.json');
  console.log('\nSkipping contract compilation for now...');
  
  // Create a placeholder to indicate build was attempted
  fs.writeFileSync(
    path.join(MANAGED_DIR, '.build-skipped'),
    `Build skipped at ${new Date().toISOString()}\nReason: compact compiler not installed\n`
  );

  // Return 0 to not fail the overall build
  return 0;
}

main().then(code => process.exit(code));
