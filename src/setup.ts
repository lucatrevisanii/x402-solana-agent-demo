import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { connection, DECIMALS, loadOrCreateKeypair, writeState } from "./config.js";

const SUPPLY = 100; // demo-USDC handed to the agent

async function ensureSol(kp: Keypair, min = 0.5): Promise<void> {
  if ((await connection.getBalance(kp.publicKey)) >= min * LAMPORTS_PER_SOL) return;

  // The public devnet faucet is rate-limited and flaky, so retry with backoff.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`airdropping 1 SOL to ${kp.publicKey.toBase58()} (try ${attempt}/5) ...`);
      const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw new Error(
    `Devnet airdrop failed. Fund ${kp.publicKey.toBase58()} manually at ` +
      `https://faucet.solana.com (network: devnet), then re-run.`,
  );
}

async function main(): Promise<void> {
  const agent = loadOrCreateKeypair("agent"); // payer + mint authority
  const server = loadOrCreateKeypair("server"); // recipient owner

  await ensureSol(agent);

  console.log("creating demo-USDC mint ...");
  const mint = await createMint(connection, agent, agent.publicKey, null, DECIMALS);

  const agentAta = await getOrCreateAssociatedTokenAccount(connection, agent, mint, agent.publicKey);
  await mintTo(connection, agent, mint, agentAta.address, agent, BigInt(SUPPLY) * 10n ** BigInt(DECIMALS));

  writeState({
    mint: mint.toBase58(),
    server: server.publicKey.toBase58(),
    agent: agent.publicKey.toBase58(),
  });

  console.log("\nready:");
  console.log(`  mint   ${mint.toBase58()}`);
  console.log(`  agent  ${agent.publicKey.toBase58()} (holds ${SUPPLY} demo-USDC)`);
  console.log(`  server ${server.publicKey.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
