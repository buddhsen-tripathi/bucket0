import { Webhook } from "svix";
import { headers } from "@/server/compat/headers";
import { WebhookEvent } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { webhookLog } from "@/lib/shared/logger";
import { purgeUserData } from "@/lib/shared/user-deletion";

export async function POST(req: Request) {
  // Get the webhook secret from environment variables
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    webhookLog.error("Missing CLERK_WEBHOOK_SECRET environment variable");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (verifyError) {
    webhookLog.error({ err: verifyError }, "Error verifying webhook");
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // Handle the webhook event
  const eventType = evt.type;

  if (eventType === "user.created") {
    const { id, email_addresses } = evt.data;
    const primaryEmail = email_addresses.find((e) => e.id === evt.data.primary_email_address_id);
    const email = primaryEmail?.email_address || email_addresses[0]?.email_address || "";

    try {
      // Check if user already exists (shouldn't happen, but be safe)
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existingUser) {
        // Create the user in the database
        await db.insert(users).values({
          id,
          email,
          plan: "free",
          storageUsage: 0,
          fileCount: 0,
        });

        webhookLog.info("User created from webhook");
      }
    } catch (error) {
      webhookLog.error({ err: error }, "Error creating user from webhook");
      // Don't return error - Clerk will retry and user can still be created on-demand
    }
  }

  if (eventType === "user.updated") {
    const { id, email_addresses } = evt.data;
    const primaryEmail = email_addresses.find((e) => e.id === evt.data.primary_email_address_id);
    const email = primaryEmail?.email_address || email_addresses[0]?.email_address;

    if (email) {
      try {
        await db
          .update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, id));

        webhookLog.info("User updated from webhook");
      } catch (error) {
        webhookLog.error({ err: error }, "Error updating user from webhook");
      }
    }
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;

    if (id) {
      try {
        // Permanently purge all of the user's data (R2 objects + every
        // user-owned table). Idempotent, so it is safe even when the user
        // already deleted their data via DELETE /api/user before Clerk fired
        // this event.
        await purgeUserData(id);
        webhookLog.info("User data purged from webhook");
      } catch (error) {
        webhookLog.error({ err: error }, "Error handling user deletion");
      }
    }
  }

  return new Response("Webhook processed", { status: 200 });
}
