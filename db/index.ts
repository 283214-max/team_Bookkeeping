import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or restart the dev server after changing the binding."
    );
  }

  return env.DB;
}

export function getReceiptBucket() {
  const runtimeEnv = env as typeof env & { RECEIPTS?: R2Bucket };
  if (!runtimeEnv.RECEIPTS) {
    throw new Error(
      "Cloudflare R2 binding `RECEIPTS` is unavailable. Set the `r2` field in .openai/hosting.json to `RECEIPTS` or restart the dev server after changing the binding."
    );
  }

  return runtimeEnv.RECEIPTS;
}
