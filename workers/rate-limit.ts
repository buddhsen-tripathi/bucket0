import { DurableObject } from "cloudflare:workers";
import type { RateLimitResult } from "@/lib/payments/rate-limit";

/** One durable counter per hashed actor/action, shared across isolates and locations. */
export class RateLimitCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, reset_time INTEGER NOT NULL)");
  }

  async consume(maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error("Invalid rate limit configuration");
    }
    const now = Date.now();
    const previous = this.ctx.storage.sql.exec<{ count: number; reset_time: number }>("SELECT count, reset_time FROM counter WHERE id=1").toArray()[0];
    const fresh = !previous || now >= previous.reset_time;
    const count = fresh ? 0 : previous.count;
    const reset = fresh ? now + windowMs : previous.reset_time;
    const success = count < maxRequests;
    if (success) {
      this.ctx.storage.sql.exec("INSERT INTO counter(id,count,reset_time) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,reset_time=excluded.reset_time", count + 1, reset);
    }
    if (fresh) await this.ctx.storage.setAlarm(reset);
    return { success, limit: maxRequests, remaining: Math.max(0, maxRequests - count - (success ? 1 : 0)), reset };
  }

  async alarm() {
    this.ctx.storage.sql.exec("DELETE FROM counter WHERE reset_time <= ?", Date.now());
  }
}
