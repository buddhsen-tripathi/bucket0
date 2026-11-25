import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

/**
 * Lazily constructed Drizzle client.
 *
 * On Cloudflare Workers the module graph is evaluated during deploy-time
 * validation (before secrets exist) and at isolate startup, so nothing here
 * may read DATABASE_URL until the first query.
 */
let instance: NeonHttpDatabase | undefined;

function getDb(): NeonHttpDatabase {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not defined");
    }
    instance = drizzle(neon(url));
  }
  return instance;
}

export const db: NeonHttpDatabase = new Proxy({} as NeonHttpDatabase, {
  get(_target, prop, _receiver) {
    const target = getDb();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
