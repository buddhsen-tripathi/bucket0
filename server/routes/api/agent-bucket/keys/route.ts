/**
 * Agent API Key Management
 *
 * POST   /api/agent-bucket/keys - Create a new agent API key
 * GET    /api/agent-bucket/keys - List agent API keys
 * PATCH  /api/agent-bucket/keys - Update key settings (destination, name, active)
 * DELETE /api/agent-bucket/keys?id=xxx - Delete an agent API key
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { agentKeyService, isValidDestinationFolder } from "@/lib/agent/agent-key-service";
import { agentLog } from "@/lib/shared/logger";

/**
 * POST - Create a new agent API key
 *
 * Body: { name: string, destination?: "agent" | "drive", destinationFolder?: string }
 * Returns: { key: { id, apiKey, keyPrefix, name, destination, destinationFolder, createdAt }, warning }
 *
 * Note: apiKey is only returned once on creation
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, destination, destinationFolder } = body;

    if (!isValidDestinationFolder(destinationFolder)) {
      return NextResponse.json({ error: "Invalid destination folder" }, { status: 400 });
    }

    const result = await agentKeyService.createKey(
      userId,
      name || "Untitled Key",
      destination,
      destinationFolder
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message, code: result.error?.code },
        { status: result.error?.code === "USER_NOT_FOUND" ? 404 : 403 }
      );
    }

    agentLog.info("Agent API key created");
    return NextResponse.json({
      key: {
        id: result.key!.id,
        apiKey: result.key!.apiKey,
        keyPrefix: result.key!.keyPrefix,
        name: result.key!.name,
        destination: result.key!.destination,
        destinationFolder: result.key!.destinationFolder,
        createdAt: result.key!.createdAt.toISOString(),
      },
      warning: "Store the API key securely. It will not be shown again.",
    });
  } catch (error) {
    agentLog.error({ err: error }, "Error creating agent API key");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET - List all agent API keys
 *
 * Returns: { keys: [...] }
 * Note: Secret keys are never returned, only prefixes
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await agentKeyService.listKeys(userId);

    return NextResponse.json({
      keys: keys.map((k) => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        destination: k.destination,
        destinationFolder: k.destinationFolder,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        isActive: k.isActive,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    agentLog.error({ err: error }, "Error listing agent API keys");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH - Update agent API key settings
 *
 * Body: { id: string, name?: string, destination?: "agent" | "drive", destinationFolder?: string | null, isActive?: boolean }
 */
export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
    }

    if (!isValidDestinationFolder(updates.destinationFolder)) {
      return NextResponse.json({ error: "Invalid destination folder" }, { status: 400 });
    }

    const updated = await agentKeyService.updateKey(userId, id, updates);

    if (!updated) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    agentLog.info("Agent API key updated");
    return NextResponse.json({ success: true });
  } catch (error) {
    agentLog.error({ err: error }, "Error updating agent API key");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE - Delete an agent API key
 *
 * Query: ?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyId = request.nextUrl.searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
  }

  try {
    const deleted = await agentKeyService.deleteKey(userId, keyId);

    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    agentLog.info("Agent API key deleted");
    return NextResponse.json({ success: true });
  } catch (error) {
    agentLog.error({ err: error }, "Error deleting agent API key");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
