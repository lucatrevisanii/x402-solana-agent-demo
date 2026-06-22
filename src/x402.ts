import { ParsedTransactionWithMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// What the server tells the client it must pay. Mirrors the shape of an
// x402 `accepts` entry, trimmed to what a Solana SPL transfer needs.
export type PaymentRequirement = {
  scheme: "exact";
  network: "solana-devnet";
  asset: string; // SPL mint
  payTo: string; // recipient owner pubkey
  amount: string; // atomic units, as a string to stay exact
  decimals: number;
  nonce: string; // binds one payment to one request (anti-replay)
  resource: string;
};

// A memo instruction carrying the request nonce, so the server can match an
// on-chain transfer to the exact 402 it issued.
export function memoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
}

// Read the memo string back out of a confirmed transaction.
export function extractMemo(tx: ParsedTransactionWithMeta): string | null {
  for (const ix of tx.transaction.message.instructions as any[]) {
    if (ix.program === "spl-memo" && typeof ix.parsed === "string") return ix.parsed;
    if (ix.programId?.toString?.() === MEMO_PROGRAM_ID.toString() && typeof ix.parsed === "string") {
      return ix.parsed;
    }
  }
  // Fallback: parse it out of the program logs.
  for (const line of tx.meta?.logMessages ?? []) {
    const m = line.match(/Memo \(len \d+\): "(.*)"/);
    if (m) return m[1];
  }
  return null;
}

// Net atomic amount of `mint` credited to `owner` in this transaction.
export function creditedAmount(tx: ParsedTransactionWithMeta, owner: string, mint: string): bigint {
  const sum = (balances: NonNullable<typeof tx.meta>["postTokenBalances"]) =>
    (balances ?? [])
      .filter((b) => b.owner === owner && b.mint === mint)
      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}
