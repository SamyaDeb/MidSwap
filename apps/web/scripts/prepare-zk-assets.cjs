#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(__dirname, '../../../packages/contracts/managed/OptimalAMM');
const targetRoot = path.resolve(__dirname, '../public/zk/OptimalAMM');

const sourceKeysDir = path.join(sourceRoot, 'keys');
const sourceZkirDir = path.join(sourceRoot, 'zkir');
const targetKeysDir = path.join(targetRoot, 'keys');
const targetZkirDir = path.join(targetRoot, 'zkir');

const requiredKeyExtensions = ['.prover', '.verifier'];
const requiredZkirExtension = '.bzkir';

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDirectory(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDirectory(dir);
}

function copyFiles(sourceDir, targetDir, predicate) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !predicate(entry.name)) {
      continue;
    }

    fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    copied += 1;
  }

  return copied;
}

function countFiles(dir, predicate) {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  return fs.readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && predicate(entry.name)
  ).length;
}

const hasSourceKeys = fs.existsSync(sourceKeysDir);
const hasSourceZkir = fs.existsSync(sourceZkirDir);

if (!hasSourceKeys || !hasSourceZkir) {
  const committedKeyCount = countFiles(targetKeysDir, (name) => requiredKeyExtensions.some((ext) => name.endsWith(ext)));
  const committedZkirCount = countFiles(targetZkirDir, (name) => name.endsWith(requiredZkirExtension));

  if (committedKeyCount > 0 && committedZkirCount > 0) {
    console.log(
      `[prepare-zk-assets] source artifacts unavailable, using committed public zk assets (${committedKeyCount} key files, ${committedZkirCount} .bzkir files)`
    );
    process.exit(0);
  }

  throw new Error(
    `Missing source ZK assets in ${sourceRoot} and no committed fallback assets in ${targetRoot}. Commit apps/web/public/zk/OptimalAMM before deploying.`
  );
}

ensureDirectory(targetRoot);
resetDirectory(targetKeysDir);
resetDirectory(targetZkirDir);

const copiedKeys = copyFiles(sourceKeysDir, targetKeysDir, (name) => name.endsWith('.prover') || name.endsWith('.verifier'));
const copiedZkir = copyFiles(sourceZkirDir, targetZkirDir, (name) => name.endsWith('.bzkir'));

if (copiedKeys === 0) {
  throw new Error(
    `No proving keys were copied from ${sourceKeysDir}. Commit packages/contracts/managed/OptimalAMM/keys before deploying.`
  );
}

if (copiedZkir === 0) {
  throw new Error(`No .bzkir files were copied from ${sourceZkirDir}.`);
}

console.log(`[prepare-zk-assets] copied ${copiedKeys} key files and ${copiedZkir} .bzkir files`);
