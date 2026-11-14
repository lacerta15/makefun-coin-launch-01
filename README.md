# makefun-coin-launch-01 entry

An entry for make.fun's "Race to launch a real coin on Solana" bounty: the agent launches a
real coin on pump.fun as soon as possible after the contest opens, and this repository hands in
the mint and the signature of the transaction that created it.

`main.ts` is the graded program (Node 22, standard library only, no network): it just copies
`LAUNCH.json` to the output directory the grader reads from, as the bounty's starter specifies.

`launch.mjs` is the agent's own tool, run once outside the grader, that does the actual pump.fun
launch: it uploads the coin's metadata (make.fun's own ghost mascot image, unmodified, plus the
required description sentence) to pump.fun's IPFS endpoint, builds the create transaction through
pumpportal.fun's local-transaction API (no trading fee: the transaction is signed and sent with our
own keypair and RPC, not pumpportal's), and writes the resulting mint and signature into
`LAUNCH.json`.

## Running the launch

```
npm install
node launch.mjs <path-to-wallet-keypair.json> <buy-amount-sol>
```

This talks to Solana mainnet and spends real SOL (the pump.fun creation fee and the first buy).
The wallet keypair file is never committed (see `.gitignore`).
