import { PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { connection, loadOrCreateKeypair, PORT, readState, RESOURCE_PATH } from "./config.js";
import { memoInstruction, PaymentRequirement } from "./x402.js";

const BASE = `http://localhost:${PORT}`;

async function main(): Promise<void> {
  const state = readState();
  const agent = loadOrCreateKeypair("agent");
  const mint = new PublicKey(state.mint);

  // 1. Ask for the resource — expect 402 Payment Required.
  const first = await fetch(`${BASE}${RESOURCE_PATH}`);
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`);
  const { accepts } = (await first.json()) as { accepts: PaymentRequirement[] };
  const req = accepts[0];
  console.log(`402 -> pay ${req.amount} atomic of ${req.asset} to ${req.payTo}`);

  // 2. Pay: ensure the server's token account, tag the transfer with the nonce.
  const payTo = new PublicKey(req.payTo);
  const agentAta = getAssociatedTokenAddressSync(mint, agent.publicKey);
  const serverAta = getAssociatedTokenAddressSync(mint, payTo);

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(agent.publicKey, serverAta, payTo, mint),
    memoInstruction(req.nonce, agent.publicKey),
    createTransferCheckedInstruction(agentAta, mint, serverAta, agent.publicKey, BigInt(req.amount), req.decimals),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [agent], { commitment: "confirmed" });
  console.log(`paid: ${sig}`);

  // 3. Retry with the signature as proof of payment.
  const paid = await fetch(`${BASE}${RESOURCE_PATH}`, { headers: { "X-PAYMENT": sig } });
  if (!paid.ok) throw new Error(`payment rejected: ${paid.status} ${await paid.text()}`);

  console.log("\nresource unlocked:");
  console.log(JSON.stringify(await paid.json(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
