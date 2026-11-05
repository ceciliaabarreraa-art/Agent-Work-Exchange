#!/usr/bin/env node
/**
 * Generates local NEAR Ed25519 credentials for buyer, seller and verifier.
 * It does NOT publish keys or create funded accounts automatically.
 * Requires a parent testnet account controlled by the operator.
 */
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { KeyPair } from 'near-api-js';

const parent = process.argv[2];
if (!parent || !parent.endsWith('.testnet')) {
  console.error('Usage: node scripts/generate-agents.mjs <funded-parent.testnet>');
  process.exit(1);
}
const roles = ['buyer', 'seller', 'verifier'];
const manifest = { network: 'testnet', parent_account: parent, generated_at: new Date().toISOString(), accounts: {} };
for (const role of roles) {
  const accountId = `${role}.${parent}`;
  const keyPair = KeyPair.fromRandom('ed25519');
  manifest.accounts[role] = {
    account_id: accountId,
    public_key: keyPair.getPublicKey().toString(),
    secret_key: keyPair.toString(),
  };
}
await mkdir('.secrets', { recursive: true });
const path = '.secrets/agent-accounts.testnet.json';
await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' }).catch(async (error) => {
  if (error.code !== 'EEXIST') throw error;
  throw new Error(`${path} already exists. Move it securely before generating another set.`);
});
await chmod(path, 0o600);
console.log(`Credentials generated at ${path}. KEEP THIS FILE OFF GIT AND OUT OF THE WORKER.`);
console.log('\nCreate each account using the exact public key generated above (NEAR CLI-RS):');
for (const role of roles) {
  const a = manifest.accounts[role];
  console.log(`\nnear account create-account fund-myself ${a.account_id} '0.1 NEAR' \\
  use-manually-provided-public-key ${a.public_key} \\
  sign-as ${parent} network-config testnet sign-with-keychain send`);
}
console.log('\nThe parent account must have enough testnet NEAR and be available in your OS keychain.');
console.log('The script does not execute these transactions: inspect and run them yourself.');
console.log('Never upload .secrets/agent-accounts.testnet.json to GitHub or put its private keys in Cloudflare.');
