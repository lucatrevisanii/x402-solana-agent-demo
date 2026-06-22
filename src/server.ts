import { randomUUID } from "node:crypto";
import express from "express";
import {
  connection,
  DECIMALS,
  loadOrCreateKeypair,
  PORT,
  PRICE_ATOMIC,
  readState,
  RESOURCE_PATH,
} from "./config.js";
import { creditedAmount, extractMemo, PaymentRequirement } from "./x402.js";

const state = readState();
const server = loadOrCreateKeypair("server");
const PAY_TO = server.publicKey.toBase58();
const ASSET = state.mint;

const pending = new Map<string, PaymentRequirement>(); // nonce -> requirement
const redeemed = new Set<string>(); // signatures already spent

function makeRequirement(): PaymentRequirement {
  const req: PaymentRequirement = {
    scheme: "exact",
    network: "solana-devnet",
    asset: ASSET,
    payTo: PAY_TO,
    amount: PRICE_ATOMIC.toString(),
    decimals: DECIMALS,
    nonce: randomUUID(),
    resource: RESOURCE_PATH,
  };
  pending.set(req.nonce, req);
  return req;
}

const app = express();

app.get(RESOURCE_PATH, async (req, res) => {
  const sig = req.header("X-PAYMENT");

  // No proof yet -> answer 402 with what to pay.
  if (!sig) {
    return res.status(402).json({ error: "payment required", accepts: [makeRequirement()] });
  }

  if (redeemed.has(sig)) {
    return res.status(409).json({ error: "payment already redeemed" });
  }

  // Verify the payment on-chain. A malformed signature makes the RPC throw,
  // so treat any lookup failure as an unverifiable payment.
  let tx;
  try {
    tx = await connection.getParsedTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch {
    return res.status(400).json({ error: "malformed payment signature" });
  }
  if (!tx || tx.meta?.err) {
    return res.status(402).json({ error: "payment not found or failed" });
  }

  const nonce = extractMemo(tx);
  const requirement = nonce ? pending.get(nonce) : undefined;
  if (!requirement) {
    return res.status(402).json({ error: "payment not bound to a known request" });
  }

  const credited = creditedAmount(tx, requirement.payTo, requirement.asset);
  if (credited < BigInt(requirement.amount)) {
    return res.status(402).json({ error: "insufficient payment", need: requirement.amount, got: credited.toString() });
  }

  // Good payment: burn the nonce + signature, deliver the resource.
  redeemed.add(sig);
  pending.delete(requirement.nonce);
  return res.status(200).json({
    report: {
      title: "Premium market report",
      generatedAt: new Date().toISOString(),
      signal: "BTC dominance trending up; rotate into majors.",
    },
    paidWith: sig,
  });
});

app.listen(PORT, () => {
  console.log(`x402 server on http://localhost:${PORT}${RESOURCE_PATH}`);
  console.log(`payTo ${PAY_TO} | asset ${ASSET} | price ${PRICE_ATOMIC} atomic`);
});
