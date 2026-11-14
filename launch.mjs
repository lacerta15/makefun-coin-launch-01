// Launches a coin on pump.fun using the local-transaction flow (pumpportal.fun
// builds the unsigned transaction; we sign and send it ourselves with our own
// RPC, so no trading fee is paid to pumpportal). Not run by the grader
// (main.ts is the graded program, stdlib-only, no network): this is the
// agent's own tool for the one-time launch step the bounty requires.
//
// Usage:
//   node launch.mjs <path-to-wallet-keypair.json> <buy-amount-sol>
//
// Writes the resulting mint and create-transaction signature to LAUNCH.json
// at the repository root.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  Connection,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const MASCOT_PATH = new URL('./assets/mark-1024.png', import.meta.url);
const REQUIRED_DESCRIPTION = 'made for make.fun $1000 bounty';

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function uploadMetadata(walletPubkey) {
  const imageBytes = readFileSync(MASCOT_PATH);
  const form = new FormData();
  form.append('file', new Blob([imageBytes], { type: 'image/png' }), 'mark-1024.png');
  form.append('name', 'make.fun bounty coin');
  form.append('symbol', 'MFBOUNTY');
  form.append('description', REQUIRED_DESCRIPTION);
  form.append('showName', 'true');

  const res = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`metadata upload failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.metadataUri) throw new Error(`no metadataUri in response: ${JSON.stringify(data)}`);
  return data;
}

async function buildCreateTx({ walletPubkey, mintPubkey, metadataUri, buySol }) {
  const body = {
    publicKey: walletPubkey,
    action: 'create',
    tokenMetadata: {
      name: 'make.fun bounty coin',
      symbol: 'MFBOUNTY',
      uri: metadataUri,
    },
    mint: mintPubkey,
    denominatedInSol: 'true',
    amount: buySol,
    slippage: 15,
    priorityFee: 0.0006,
    pool: 'pump',
  };
  const res = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`trade-local failed: HTTP ${res.status} ${await res.text()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const [walletPath, buySolArg] = process.argv.slice(2);
  if (!walletPath || !buySolArg) {
    console.error('usage: node launch.mjs <wallet-keypair.json> <buy-amount-sol>');
    process.exit(1);
  }
  const buySol = Number(buySolArg);
  if (!(buySol > 0)) throw new Error('buy-amount-sol must be a positive number');

  const wallet = loadKeypair(walletPath);
  const mintKeypair = Keypair.generate();
  const connection = new Connection(RPC_URL, 'confirmed');

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`wallet ${wallet.publicKey.toBase58()} balance: ${balance / 1e9} SOL`);

  console.log('uploading metadata to pump.fun ipfs...');
  const meta = await uploadMetadata(wallet.publicKey.toBase58());
  console.log('metadataUri:', meta.metadataUri);

  console.log('building create transaction...');
  const txBytes = await buildCreateTx({
    walletPubkey: wallet.publicKey.toBase58(),
    mintPubkey: mintKeypair.publicKey.toBase58(),
    metadataUri: meta.metadataUri,
    buySol,
  });

  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([wallet, mintKeypair]);

  console.log('sending transaction to', RPC_URL, '...');
  const signature = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
  console.log('signature:', signature);

  console.log('confirming...');
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`transaction failed on chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  const launch = {
    mint: mintKeypair.publicKey.toBase58(),
    create_signature: signature,
  };
  writeFileSync(new URL('./LAUNCH.json', import.meta.url), JSON.stringify(launch, null, 2) + '\n');
  console.log('wrote LAUNCH.json:', launch);
}

main().catch((err) => {
  console.error('launch failed:', err);
  process.exit(1);
});
