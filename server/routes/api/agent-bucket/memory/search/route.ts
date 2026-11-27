/**
 * AgentBucket Memory Search
 *
 * POST /api/agent-bucket/memory/search - Semantic search over an agent's memory.
 * Bearer token auth. Body: { query: string, topK?: number }
 * Returns ranked, decrypted snippets with their source file.
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/shared/db";
import { users } from "@/db/schema";
import { getPlanLimits } from "@/lib/payments/plans";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";
import { searchMemory } from "@/lib/agent/memory-service";
import { isEmbeddingConfigured } from "@/lib/agent/embedding-service";
import { agentLog } from "@/lib/shared/logger";


/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    if (!isEmbeddingConfigured()) {
      return NextResponse.json({ error: "Memory search is not available" }, { status: 503 });
    }

    // Plan gate: memory is Starter and up.
    const [dbUser] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser || !getPlanLimits(dbUser.plan).memoryEnabled) {
      return NextResponse.json(
        { error: "AgentBucket memory is available on the Starter, Pro and Scale plans." },
        { status: 402 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = typeof body.topK === "number" ? body.topK : 8;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const results = await searchMemory(userId, query, topK);

    return NextResponse.json({ results });
  } catch (error) {
    agentLog.error({ err: error }, "Memory search error");
    return NextResponse.json({ error: "Failed to search memory" }, { status: 500 });
  }
}
