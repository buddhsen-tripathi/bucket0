/**
 * Agent Route Helpers
 * Bearer token auth for agent API routes.
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { agentKeyService, ValidatedKey } from "@/lib/agent/agent-key-service";
import { OAUTH_PRM_URL } from "@/lib/agent-discovery/site";

type AgentAuthResult =
  | (ValidatedKey & { error: null })
  | { userId: null; keyId: null; destination: null; destinationFolder: null; error: NextResponse };

const AGENT_WWW_AUTHENTICATE = `Bearer realm="AgentBucket", resource_metadata="${OAUTH_PRM_URL}"`;

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 401,
      headers: { "WWW-Authenticate": AGENT_WWW_AUTHENTICATE },
    }
  );
}

/**
 * Extract and validate Bearer token from request.
 * Returns userId + keyId + destination settings, or a 401 response.
 */
export async function requireAgentAuth(request: NextRequest): Promise<AgentAuthResult> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      userId: null,
      keyId: null,
      destination: null,
      destinationFolder: null,
      error: unauthorized("Missing or invalid Authorization header. Use: Bearer b0ak_..."),
    };
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  const validated = await agentKeyService.validateKey(token);

  if (!validated) {
    return {
      userId: null,
      keyId: null,
      destination: null,
      destinationFolder: null,
      error: unauthorized("Invalid, expired, or deactivated API key"),
    };
  }

  return { ...validated, error: null };
}
