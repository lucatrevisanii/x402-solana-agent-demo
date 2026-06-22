# x402 on Solana — agent pays for an API

A minimal, runnable demo of the [x402](https://x402.org) payment pattern on Solana
devnet: an agent hits a gated endpoint, gets `402 Payment Required`, pays in USDC
on-chain, and retries with the transaction as proof. No accounts, no API keys, no
human in the loop — machine-to-machine payment over plain HTTP.

```
agent                         server (/report)                solana devnet
  │  GET /report                  │                                │
  │ ────────────────────────────▶ │                                │
  │  402  { accepts: [req] }       │                                │
  │ ◀──────────────────────────── │                                │
  │                                                                 │
  │  transfer USDC, memo = nonce                                    │
  │ ──────────────────────────────────────────────────────────────▶│
  │                                │                                │
  │  GET /report   X-PAYMENT: sig  │                                │
  │ ────────────────────────────▶ │  getParsedTransaction(sig)     │
  │                                │ ──────────────────────────────▶│
  │                                │  check amount + payTo + nonce  │
  │  200  { report }               │ ◀──────────────────────────────│
  │ ◀──────────────────────────── │                                │
```

## Run it

```bash
npm install
npm run demo
```

`npm run demo` creates a demo USDC mint on devnet, funds the agent, starts the
server, and runs one full pay-and-fetch round. First run airdrops devnet SOL, so
give it a few seconds.

Run the pieces yourself instead:

```bash
npm run setup     # mint demo-USDC on devnet, fund the agent
npm run server    # start the gated API on :4021
npm run agent     # pay and fetch (in another terminal)
```

## How it works

1. **402 with terms.** The server answers an unpaid request with `402` and a
   `PaymentRequirement`: which mint, how much (atomic units), who to pay, and a
   one-time `nonce`.
2. **Pay, bound to the request.** The agent sends an SPL transfer to the server's
   token account and attaches the `nonce` as a Solana memo, so the payment is tied
   to that exact 402 — not reusable for another.
3. **Verify on-chain.** The agent retries with `X-PAYMENT: <signature>`. The server
   fetches the transaction, confirms it succeeded, that the memo matches a pending
   nonce, and that the credited amount covers the price. Then it burns the nonce and
   the signature (replay protection) and returns the resource.

Settlement is the transfer itself — final the moment it confirms. There's no
escrow and no trusted facilitator in the loop.

## Real USDC instead of the demo mint

`setup` creates a throwaway mint so the demo runs with zero faucet friction. To
charge in real devnet USDC, skip `setup` and point the server at Circle's devnet
mint:

```
asset = 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Fund the agent from the [Circle faucet](https://faucet.circle.com), set that mint
in `.demo.json`, and the same flow works unchanged.

## Layout

| File            | Role                                                        |
| --------------- | ----------------------------------------------------------- |
| `src/x402.ts`   | Payment requirement type, memo helpers, on-chain verifier   |
| `src/server.ts` | Gated API: issues 402s, verifies payments                   |
| `src/agent.ts`  | Client: reads terms, pays, retries with proof               |
| `src/setup.ts`  | Mints demo-USDC on devnet and funds the agent               |

## Scope

Devnet only, in-memory state, single resource — a teaching demo of the pattern,
not a production payment gateway. For mainnet you'd persist nonces, add request
expiry, and verify through a hosted facilitator. The verification and anti-replay
logic here is the real shape of it.

MIT.
