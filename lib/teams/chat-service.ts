/**
 * Chat Service
 * Handles team messaging and file comments
 */

import { db } from "@/lib/shared/db";
import { teamMessages } from "@/db/schema";
import { eq, desc, and, sql, isNull } from "drizzle-orm";

export type MessageType = "text" | "file_comment" | "system";

export interface SendMessageParams {
  teamId: string;
  userId: string;
  content: string;
  type?: MessageType;
  fileId?: string;
  parentId?: string;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  userId: string;
  content: string;
  type: string;
  fileId: string | null;
  parentId: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export class ChatService {
  /**
   * Send a new message
   */
  async sendMessage(params: SendMessageParams): Promise<ChatMessage> {
    const [message] = await db
      .insert(teamMessages)
      .values({
        teamId: params.teamId,
        userId: params.userId,
        content: params.content,
        type: params.type || "text",
        fileId: params.fileId,
        parentId: params.parentId,
      })
      .returning();

    return message;
  }

  /**
   * Get messages for a team (paginated)
   */
  async getTeamMessages(
    teamId: string,
    options: {
      limit?: number;
      offset?: number;
      fileId?: string; // Filter by file for file comments
    } = {}
  ): Promise<ChatMessage[]> {
    const { limit = 50, offset = 0, fileId } = options;

    const conditions = [
      eq(teamMessages.teamId, teamId),
      isNull(teamMessages.deletedAt),
    ];

    if (fileId) {
      conditions.push(eq(teamMessages.fileId, fileId));
    }

    const messages = await db
      .select()
      .from(teamMessages)
      .where(and(...conditions))
      .orderBy(desc(teamMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return messages;
  }

  /**
   * Get recent messages for real-time updates
   */
  async getRecentMessages(
    teamId: string,
    sinceSeconds: number = 5
  ): Promise<ChatMessage[]> {
    const since = new Date(Date.now() - sinceSeconds * 1000);

    const messages = await db
      .select()
      .from(teamMessages)
      .where(
        and(
          eq(teamMessages.teamId, teamId),
          sql`${teamMessages.createdAt} > ${since}`,
          isNull(teamMessages.deletedAt)
        )
      )
      .orderBy(desc(teamMessages.createdAt));

    return messages;
  }

  /**
   * Get file comments
   */
  async getFileComments(
    teamId: string,
    fileId: string,
    limit: number = 50
  ): Promise<ChatMessage[]> {
    return this.getTeamMessages(teamId, { fileId, limit });
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(
    teamId: string,
    parentId: string,
    limit: number = 50
  ): Promise<ChatMessage[]> {
    const messages = await db
      .select()
      .from(teamMessages)
      .where(
        and(
          eq(teamMessages.teamId, teamId),
          eq(teamMessages.parentId, parentId),
          isNull(teamMessages.deletedAt)
        )
      )
      .orderBy(teamMessages.createdAt)
      .limit(limit);

    return messages;
  }

  /**
   * Edit a message
   */
  async editMessage(
    messageId: string,
    userId: string,
    newContent: string
  ): Promise<ChatMessage | null> {
    const [message] = await db
      .update(teamMessages)
      .set({
        content: newContent,
        isEdited: true,
        editedAt: new Date(),
      })
      .where(
        and(
          eq(teamMessages.id, messageId),
          eq(teamMessages.userId, userId), // Only author can edit
          isNull(teamMessages.deletedAt)
        )
      )
      .returning();

    return message || null;
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(
    messageId: string,
    userId: string,
    isOwner: boolean = false
  ): Promise<boolean> {
    // Owner can delete any message, others can only delete their own
    const conditions = [
      eq(teamMessages.id, messageId),
      isNull(teamMessages.deletedAt),
    ];

    if (!isOwner) {
      conditions.push(eq(teamMessages.userId, userId));
    }

    const result = await db
      .update(teamMessages)
      .set({
        deletedAt: new Date(),
        content: "[Message deleted]",
      })
      .where(and(...conditions))
      .returning();

    return result.length > 0;
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId: string): Promise<ChatMessage | null> {
    const [message] = await db
      .select()
      .from(teamMessages)
      .where(eq(teamMessages.id, messageId))
      .limit(1);

    return message || null;
  }

  /**
   * Get message count for a team
   */
  async getMessageCount(teamId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(teamMessages)
      .where(
        and(
          eq(teamMessages.teamId, teamId),
          isNull(teamMessages.deletedAt)
        )
      );

    return result[0]?.count ?? 0;
  }

  /**
   * Send a system message (e.g., "User joined the team")
   */
  async sendSystemMessage(
    teamId: string,
    content: string
  ): Promise<ChatMessage> {
    return this.sendMessage({
      teamId,
      userId: "system",
      content,
      type: "system",
    });
  }
}

export const chatService = new ChatService();
