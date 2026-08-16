#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = 'base1520.windows-source-receipt.v1';
const RECEIPT_NAME = 'windows-source.json';
const INSTALLER_NAME = 'The-Operator-windows.exe';
const MANIFEST_NAME = 'latest.yml';
const BLOCKMAP_NAME = 'The-Operator-windows.exe.blockmap';
const REQUIRED_NAMES = [INSTALLER_NAME, MANIFEST_NAME];
const ALLOWED_NAMES = new Set([...REQUIRED_NAMES, BLOCKMAP_NAME]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(`${label} is malformed JSON.`);
  }
}

function validateCoordinates(repository, commit, tag, version) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    fail('Windows source receipt requires an owner/repository identity.');
  }
  if (!/^[0-9a-f]{40}$/.test(commit || '')) {
    fail('Windows source receipt requires an exact 40-character lowercase commit.');
  }
  if (!version || tag !== `v${version}`) {
    fail('Windows source receipt tag and version do not agree.');
  }
}

function fileDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validateAssetNames(assets) {
  const names = assets.map((asset) => asset.name);
  if (new Set(names).size !== names.length
    || REQUIRED_NAMES.some((name) => !names.includes(name))
    || names.some((name) => !ALLOWED_NAMES.has(name))) {
    fail('Windows source receipt must contain each required Windows asset exactly once.');
  }
}

const [mode, ...args] = process.argv.slice(2);

if (mode === 'write') {
  const [file, repository, commit, tag, version, ...assetFiles] = args;
  if (!file || !repository || !commit || !tag || !version || assetFiles.length < 2) {
    fail('Usage: windows-source-receipt.mjs write <file> <repository> <commit> <tag> <version> <asset>...');
  }
  validateCoordinates(repository, commit, tag, version);

  const assets = assetFiles.map((assetFile) => {
    const stat = fs.statSync(assetFile);
    if (!stat.isFile() || stat.size <= 0) {
      fail(`Windows receipt input is not a non-empty file: ${assetFile}`);
    }
    return {
      name: path.basename(assetFile),
      size: stat.size,
      sha256: fileDigest(assetFile),
    };
  }).sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  validateAssetNames(assets);

  const receipt = {
    schema: SCHEMA,
    repository,
    tag,
    version,
    commit,
    assets,
  };
  fs.writeFileSync(file, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', flag: 'w' });
  process.exit(0);
}

if (mode === 'asset-id') {
  const [inventoryFile] = args;
  if (!inventoryFile) {
    fail('Usage: windows-source-receipt.mjs asset-id <inventory-file>');
  }
  const inventory = readJson(inventoryFile, 'Windows release asset inventory');
  if (!Array.isArray(inventory)) {
    fail('Windows release asset inventory must be a JSON array.');
  }
  const receipts = inventory.filter((asset) => asset?.name === RECEIPT_NAME);
  if (receipts.length !== 1) {
    fail(`Draft release must contain exactly one ${RECEIPT_NAME} asset.`);
  }
  const [receiptAsset] = receipts;
  if (!Number.isSafeInteger(receiptAsset.id) || receiptAsset.id <= 0 || receiptAsset.state !== 'uploaded') {
    fail('Windows source receipt asset metadata is not an uploaded numeric asset.');
  }
  process.stdout.write(String(receiptAsset.id));
  process.exit(0);
}

if (mode !== 'verify') {
  fail(`Unsupported Windows source receipt mode: ${mode || '(missing)'}`);
}

const [receiptFile, inventoryFile, expectedRepository, expectedCommit, expectedTag, expectedVersion] = args;
if (!receiptFile || !inventoryFile || !expectedRepository || !expectedCommit || !expectedTag || !expectedVersion) {
  fail('Usage: windows-source-receipt.mjs verify <receipt> <inventory> <repository> <commit> <tag> <version>');
}
validateCoordinates(expectedRepository, expectedCommit, expectedTag, expectedVersion);

const receipt = readJson(receiptFile, 'Windows source receipt');
const inventory = readJson(inventoryFile, 'Windows release asset inventory');
if (!receipt || Array.isArray(receipt) || typeof receipt !== 'object') {
  fail('Windows source receipt must be a JSON object.');
}
if (!Array.isArray(inventory)) {
  fail('Windows release asset inventory must be a JSON array.');
}

const receiptKeys = Object.keys(receipt).sort().join(',');
if (receiptKeys !== 'assets,commit,repository,schema,tag,version'
  || receipt.schema !== SCHEMA
  || !Array.isArray(receipt.assets)
  || !/^[0-9a-f]{40}$/.test(receipt.commit || '')
  || typeof receipt.repository !== 'string'
  || typeof receipt.tag !== 'string'
  || typeof receipt.version !== 'string') {
  fail('Windows source receipt has an unsupported schema or shape.');
}

if (receipt.repository !== expectedRepository) {
  fail('Windows source receipt repository does not match the release repository.');
}
if (receipt.commit !== expectedCommit) {
  fail('Windows source receipt commit does not match the Mac release commit.');
}
if (receipt.tag !== expectedTag) {
  fail('Windows source receipt tag does not match the draft release tag.');
}
if (receipt.version !== expectedVersion) {
  fail('Windows source receipt version does not match the Mac release version.');
}

for (const asset of receipt.assets) {
  if (!asset || Array.isArray(asset) || typeof asset !== 'object'
    || Object.keys(asset).sort().join(',') !== 'name,sha256,size'
    || typeof asset.name !== 'string'
    || !Number.isSafeInteger(asset.size) || asset.size <= 0
    || !/^[0-9a-f]{64}$/.test(asset.sha256 || '')) {
    fail('Windows source receipt contains malformed asset evidence.');
  }
}
validateAssetNames(receipt.assets);
const receiptNames = receipt.assets.map((asset) => asset.name);
if (receiptNames.join('\n') !== [...receiptNames].sort().join('\n')) {
  fail('Windows source receipt assets are not in deterministic name order.');
}

const ownedNames = new Set([RECEIPT_NAME, INSTALLER_NAME, MANIFEST_NAME, BLOCKMAP_NAME]);
const ownedInventory = inventory.filter((asset) => ownedNames.has(asset?.name));
for (const name of ownedNames) {
  const matches = ownedInventory.filter((asset) => asset.name === name);
  const requiredCount = name === BLOCKMAP_NAME
    ? (receiptNames.includes(BLOCKMAP_NAME) ? 1 : 0)
    : 1;
  if (matches.length !== requiredCount) {
    fail(`Windows release asset inventory has the wrong count for ${name}.`);
  }
}

const labels = {
  [INSTALLER_NAME]: 'Windows installer',
  [MANIFEST_NAME]: 'Windows updater manifest',
  [BLOCKMAP_NAME]: 'Windows updater blockmap',
};
for (const expected of receipt.assets) {
  const actual = ownedInventory.find((asset) => asset.name === expected.name);
  if (actual.state !== 'uploaded') {
    fail(`${labels[expected.name]} is not fully uploaded.`);
  }
  if (actual.size !== expected.size) {
    fail(`${labels[expected.name]} size does not match its source receipt.`);
  }
  if (actual.digest !== `sha256:${expected.sha256}`) {
    fail(`${labels[expected.name]} digest does not match its source receipt.`);
  }
}
