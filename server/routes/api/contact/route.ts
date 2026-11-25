import { NextResponse } from "@/server/compat/next-server";
import { getClientIp } from "@/lib/shared/http-utils";
import { db } from "@/lib/shared/db";
import { contactMessages } from "@/db/schema";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { contactLog } from "@/lib/shared/logger";

const VALID_SUBJECTS = ["general", "support", "billing", "partnership", "feedback", "other"];

// Disposable email domains commonly used by spammers
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "trashmail.com", "fakeinbox.com", "mailnesia.com",
  "maildrop.cc", "10minutemail.com", "temp-mail.org",
]);

/**
 * Detect likely spam content server-side
 */
function isSpamContent(text: string): boolean {
  const lower = text.toLowerCase();

  // Excessive URLs (>3)
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 3) return true;

  // Common spam phrases
  const spamPhrases = [
    "buy now", "click here", "free money", "act now", "limited time",
    "earn money", "make money online", "work from home", "crypto invest",
    "casino online", "viagra", "cialis", "weight loss", "diet pill",
    "nigerian prince", "lottery winner", "congratulations you won",
    "double your", "100% free", "dear friend",
  ];
  const matchedPhrases = spamPhrases.filter((p) => lower.includes(p));
  if (matchedPhrases.length >= 2) return true;

  // ALL CAPS message (>60% uppercase, min 20 chars)
  if (text.length > 20) {
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    if (upperCount / text.length > 0.6) return true;
  }

  // Repetitive character spam
  if (/(.)(\1){9,}/i.test(text)) return true;

  // HTML/script injection attempt
  if (/<script|<iframe|javascript:|on\w+\s*=/i.test(text)) return true;

  return false;
}

/**
 * POST /api/contact
 * Submit a contact form message (no auth required)
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Rate limit: 5 per hour per IP
    const rateLimitResult = await RateLimiters.contact(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await request.json();
    const { name, email, subject, message, _t } = body;

    // Timing check: if submitted in < 3 seconds, likely a bot
    if (typeof _t === "number" && _t < 3000) {
      // Silently accept to not tip off the bot
      return NextResponse.json({
        success: true,
        id: "ok",
        message: "Message sent successfully",
      });
    }

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Type checks — reject non-string payloads
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof subject !== "string" ||
      typeof message !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Disposable email check
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      return NextResponse.json(
        { error: "Please use a valid email address" },
        { status: 400 }
      );
    }

    // Validate subject
    if (!VALID_SUBJECTS.includes(subject)) {
      return NextResponse.json(
        { error: "Invalid subject" },
        { status: 400 }
      );
    }

    // Validate lengths
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "Name must be between 2 and 100 characters" },
        { status: 400 }
      );
    }

    if (email.length > 255) {
      return NextResponse.json(
        { error: "Email is too long" },
        { status: 400 }
      );
    }

    if (message.trim().length < 10 || message.length > 5000) {
      return NextResponse.json(
        { error: "Message must be between 10 and 5000 characters" },
        { status: 400 }
      );
    }

    // URLs in name field = spam
    if (/https?:\/\/|www\./i.test(name)) {
      return NextResponse.json(
        { error: "Invalid name" },
        { status: 400 }
      );
    }

    // Spam content detection
    if (isSpamContent(message) || isSpamContent(name)) {
      // Silently accept to not tip off spammer
      return NextResponse.json({
        success: true,
        id: "ok",
        message: "Message sent successfully",
      });
    }

    // HTML/XSS injection in any field — reject
    if (/<[^>]*>/.test(name) || /<[^>]*>/.test(message)) {
      return NextResponse.json(
        { error: "HTML is not allowed" },
        { status: 400 }
      );
    }

    // Insert into database
    const [newMessage] = await db
      .insert(contactMessages)
      .values({
        name: name.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 255),
        subject,
        message: message.trim().slice(0, 5000),
        ip,
        status: "new",
      })
      .returning();

    contactLog.info("Contact form submitted");
    return NextResponse.json({
      success: true,
      id: newMessage.id,
      message: "Message sent successfully",
    });
  } catch (error) {
    contactLog.error({ err: error }, "Contact form error");
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
