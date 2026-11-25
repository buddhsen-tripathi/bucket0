import { Resend } from "resend";
import { emailLog } from "@/lib/shared/logger";

// Lazy-initialized Resend client
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Email sender address (must be verified in Resend dashboard)
const fromEmail = () => process.env.RESEND_FROM_EMAIL || "no-reply@bucket0.com";

export interface SendInvitationEmailParams {
  to: string;
  teamName: string;
  inviterName: string;
  acceptUrl: string;
  expiresAt: Date;
}

export async function sendInvitationEmail({
  to,
  teamName,
  inviterName,
  acceptUrl,
  expiresAt,
}: SendInvitationEmailParams) {
  // Skip email sending in local development - just log the invite URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (baseUrl.includes("localhost")) {
    console.log("\n" + "=".repeat(60));
    console.log("[DEV] Skipping email send - localhost detected");
    console.log(`[DEV] Invite for: ${to}`);
    console.log(`[DEV] Team: ${teamName}`);
    console.log(`[DEV] Invited by: ${inviterName}`);
    console.log(`[DEV] Accept URL: ${acceptUrl}`);
    console.log(`[DEV] Expires: ${expiresAt.toISOString()}`);
    console.log("=".repeat(60) + "\n");
    return { success: true, skipped: true };
  }

  const resend = getResend();
  if (!resend) {
    emailLog.warn("RESEND_API_KEY not set, skipping email send");
    return { success: false, error: "Email not configured" };
  }

  const expiresInDays = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  try {
    const { data, error } = await resend.emails.send({
      from: `Bucket0 <${fromEmail()}>`,
      to: [to],
      subject: `You've been invited to join ${teamName} on Bucket0`,
      html: getInvitationEmailHtml({
        teamName,
        inviterName,
        acceptUrl,
        expiresInDays,
      }),
      text: getInvitationEmailText({
        teamName,
        inviterName,
        acceptUrl,
        expiresInDays,
      }),
    });

    if (error) {
      emailLog.error({ errName: error.name }, "Failed to send invitation");
      return { success: false, error: error.message };
    }

    emailLog.info("Invitation sent successfully");
    return { success: true, id: data?.id };
  } catch (error) {
    emailLog.error({ err: error }, "Error sending invitation");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

function getInvitationEmailHtml({
  teamName,
  inviterName,
  acceptUrl,
  expiresInDays,
}: {
  teamName: string;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const logoUrl = `${baseUrl}/b0-logo.png`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 48px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Bucket0" width="80" height="80" style="display: block;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                <tr>
                  <td style="padding: 32px;">
                    <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #18181b; text-align: center;">
                      You're invited to join ${escapeHtml(teamName)}
                    </h1>
                    <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; text-align: center;">
                      ${escapeHtml(inviterName)} has invited you to collaborate on Bucket0
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <a href="${acceptUrl}" style="display: inline-block; padding: 12px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                            Accept Invitation
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 24px 0 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                      This invitation expires in ${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0;">
              <p style="margin: 0 0 4px; font-size: 11px; color: #a1a1aa; text-align: center;">
                If you didn't expect this invitation, you can ignore this email.
              </p>
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; text-align: center;">
                Bucket0 &bull; Secure cloud storage for teams
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getInvitationEmailText({
  teamName,
  inviterName,
  acceptUrl,
  expiresInDays,
}: {
  teamName: string;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  return `
You're invited to join ${teamName} on Bucket0

${inviterName} has invited you to collaborate on Bucket0. Join the team to share files, communicate, and work together.

Accept the invitation: ${acceptUrl}

This invitation expires in ${expiresInDays} days.

If you didn't expect this invitation, you can ignore this email.

---
Bucket0 - Secure cloud storage for teams
  `.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
