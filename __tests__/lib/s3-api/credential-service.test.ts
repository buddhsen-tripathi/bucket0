import { describe, it, expect } from "vitest";
import { s3ApiCredentialService } from "@/lib/s3-api/credential-service";

const isCredentialValid = (isActive: boolean, expiresAt: Date | null) =>
  s3ApiCredentialService.isCredentialValid(isActive, expiresAt);

describe("isCredentialValid", () => {
  it("returns valid for active non-expired credential", () => {
    const result = isCredentialValid(true, null);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for active credential with future expiry", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const result = isCredentialValid(true, futureDate);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid for deactivated credential", () => {
    const result = isCredentialValid(false, null);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("deactivated");
  });

  it("returns invalid for expired credential", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const result = isCredentialValid(true, pastDate);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("returns invalid for deactivated and expired credential", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const result = isCredentialValid(false, pastDate);
    expect(result.valid).toBe(false);
    // Should fail on deactivated check first
    expect(result.reason).toContain("deactivated");
  });

  it("handles credential expiring exactly now", () => {
    const now = new Date();
    // Subtract 1ms to ensure it's in the past
    now.setMilliseconds(now.getMilliseconds() - 1);

    const result = isCredentialValid(true, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("returns valid for credential with expiry far in the future (year 2099)", () => {
    const farFuture = new Date("2099-12-31T23:59:59.999Z");

    const result = isCredentialValid(true, farFuture);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for credential with expiry exactly 1ms in the future", () => {
    const barelyFuture = new Date();
    barelyFuture.setMilliseconds(barelyFuture.getMilliseconds() + 1);

    const result = isCredentialValid(true, barelyFuture);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for active credential with null expiresAt (perpetual)", () => {
    const result = isCredentialValid(true, null);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
