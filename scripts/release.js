#!/usr/bin/env node

/**
 * Release script for Planning Poker monorepo
 * Updates versions in all package.json files, commits, and creates git tag
 *
 * Usage:
 *   npm run release:patch  # 1.0.0 -> 1.0.1
 *   npm run release:minor  # 1.0.0 -> 1.1.0
 *   npm run release:major  # 1.0.0 -> 2.0.0
 *   npm run release -- 1.2.3  # Specific version
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_PATHS = [
  'package.json',
  'servers/node/package.json'
];

function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      stdio: 'inherit',
      encoding: 'utf8',
      ...options
    });
  } catch (error) {
    console.error(`Failed to execute: ${command}`);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.version;
}

function incrementVersion(version, type) {
  const parts = version.split('.').map(Number);

  switch (type) {
    case 'patch':
      parts[2]++;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }

  return parts.join('.');
}

function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function updatePackageVersion(filePath, newVersion) {
  const fullPath = path.join(process.cwd(), filePath);
  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Updated ${filePath} to ${newVersion}`);
}

function main() {
  const args = process.argv.slice(2);
  const versionArg = args[0];

  if (!versionArg) {
    console.error('Error: Please specify version type (patch|minor|major) or version number');
    console.error('Usage:');
    console.error('  npm run release:patch');
    console.error('  npm run release:minor');
    console.error('  npm run release:major');
    console.error('  npm run release -- 1.2.3');
    process.exit(1);
  }

  // Check for uncommitted changes
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.error('Error: You have uncommitted changes. Please commit or stash them first.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error: Failed to check git status');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);

  let newVersion;
  if (['patch', 'minor', 'major'].includes(versionArg)) {
    newVersion = incrementVersion(currentVersion, versionArg);
  } else if (isValidVersion(versionArg)) {
    newVersion = versionArg;
  } else {
    console.error(`Error: Invalid version argument: ${versionArg}`);
    console.error('Use: patch, minor, major, or a version number like 1.2.3');
    process.exit(1);
  }

  console.log(`\nReleasing version: ${newVersion}\n`);

  // Update all package.json files
  for (const pkgPath of PACKAGE_PATHS) {
    updatePackageVersion(pkgPath, newVersion);
  }

  // Git commit and tag
  console.log('\nCommitting changes...');
  execCommand(`git add ${PACKAGE_PATHS.join(' ')}`);
  execCommand(`git commit -m "chore: release v${newVersion}"`);

  console.log('Creating git tag...');
  execCommand(`git tag v${newVersion}`);

  console.log('\n✨ Release v' + newVersion + ' ready!\n');
  console.log('To publish, run:');
  console.log(`  git push origin main --tags`);
  console.log('\nOr to push to a different branch:');
  console.log(`  git push origin $(git branch --show-current) --tags`);
  console.log('\nThis will trigger GitHub Actions to build and push Docker images:');
  console.log(`  - planning-poker:${newVersion}`);
  console.log(`  - planning-poker-node-ws:${newVersion}`);
  console.log(`  - planning-poker-golang-ws:${newVersion}`);
}

main();