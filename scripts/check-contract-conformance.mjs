#!/usr/bin/env node
// Diffs a branch against its base and fails if it touched any file not
// assigned to the given owner in the contract's ownership.json. This is a
// mechanical backstop — it runs whether or not the settings.local.json deny
// rules actually held, which is the point.
//
// Usage:
//   node scripts/check-contract-conformance.mjs <ownership.json> <owner> <base-ref> <branch-ref>

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , ownershipPath, owner, baseRef, branchRef] = process.argv;

if (!ownershipPath || !owner || !baseRef || !branchRef) {
  console.error(
    'Usage: node check-contract-conformance.mjs <ownership.json> <owner> <base-ref> <branch-ref>'
  );
  process.exit(2);
}

const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
const allowedFiles = new Set(
  Object.entries(ownership)
    .filter(([, fileOwner]) => fileOwner === owner)
    .map(([file]) => file)
);

const diffOutput = execSync(`git diff --name-only ${baseRef}...${branchRef}`, {
  encoding: 'utf8',
});
const changedFiles = diffOutput.split('\n').filter(Boolean);

const violations = changedFiles.filter((file) => !allowedFiles.has(file));

if (violations.length > 0) {
  console.error(`Contract violation: ${owner} touched files it doesn't own:`);
  violations.forEach((file) => console.error(`  - ${file}`));
  console.error(
    `\n${owner} is only permitted to touch:\n${[...allowedFiles]
      .map((f) => `  - ${f}`)
      .join('\n')}`
  );
  process.exit(1);
}

console.log(`✓ ${owner}'s branch (${branchRef}) touches only owned files.`);
process.exit(0);
