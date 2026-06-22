import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const PORT = Number(process.env.PORT ?? 4021);

export const DECIMALS = 6; // USDC has 6 decimals
export const PRICE = "0.10"; // demo-USDC, human units
export const PRICE_ATOMIC = BigInt(Math.round(Number(PRICE) * 10 ** DECIMALS));
export const RESOURCE_PATH = "/report";

export const connection = new Connection(RPC_URL, "confirmed");

const KEYS_DIR = ".keys";
const STATE_FILE = ".demo.json";

// Keypairs live on disk so the same agent/server persist across runs.
export function loadOrCreateKeypair(name: string): Keypair {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR);
  const path = `${KEYS_DIR}/${name}.json`;
  if (existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export type DemoState = { mint: string; server: string; agent: string };

export function readState(): DemoState {
  if (!existsSync(STATE_FILE)) throw new Error("No .demo.json — run `npm run setup` first.");
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function writeState(s: DemoState): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
