import { describe, it, expect } from "vitest";
import { s3ApiBucketService } from "@/lib/s3-api/bucket-service";

const validateBucketName = (name: string) => s3ApiBucketService.validateBucketName(name);

describe("validateBucketName", () => {
  describe("valid bucket names", () => {
    it("accepts simple lowercase name", () => {
      expect(validateBucketName("mybucket")).toEqual({ valid: true });
    });

    it("accepts name with numbers", () => {
      expect(validateBucketName("bucket123")).toEqual({ valid: true });
    });

    it("accepts name with hyphens", () => {
      expect(validateBucketName("my-bucket-name")).toEqual({ valid: true });
    });

    it("accepts name with periods", () => {
      expect(validateBucketName("my.bucket.name")).toEqual({ valid: true });
    });

    it("accepts 3 character name", () => {
      expect(validateBucketName("abc")).toEqual({ valid: true });
    });

    it("accepts 63 character name", () => {
      const name = "a".repeat(63);
      expect(validateBucketName(name)).toEqual({ valid: true });
    });

    it("accepts name starting with number", () => {
      expect(validateBucketName("123bucket")).toEqual({ valid: true });
    });

    it("accepts name with only numbers", () => {
      expect(validateBucketName("123456")).toEqual({ valid: true });
    });

    it("accepts name with mixed numbers and hyphens", () => {
      expect(validateBucketName("my-123-bucket")).toEqual({ valid: true });
    });

    it("accepts longest possible all-periods-and-alpha mix", () => {
      expect(validateBucketName("a.b.c.d.e")).toEqual({ valid: true });
    });
  });

  describe("invalid bucket names - length", () => {
    it("rejects 2 character name", () => {
      const result = validateBucketName("ab");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("between 3 and 63 characters");
    });

    it("rejects 64 character name", () => {
      const name = "a".repeat(64);
      const result = validateBucketName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("between 3 and 63 characters");
    });

    it("rejects empty name", () => {
      const result = validateBucketName("");
      expect(result.valid).toBe(false);
    });

    it("rejects single character name", () => {
      const result = validateBucketName("a");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("between 3 and 63 characters");
    });

    it("rejects 100+ character name", () => {
      const name = "a".repeat(100);
      const result = validateBucketName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("between 3 and 63 characters");
    });
  });

  describe("invalid bucket names - format", () => {
    it("rejects uppercase letters", () => {
      const result = validateBucketName("MyBucket");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("lowercase");
    });

    it("rejects name starting with hyphen", () => {
      const result = validateBucketName("-mybucket");
      expect(result.valid).toBe(false);
    });

    it("rejects name ending with hyphen", () => {
      const result = validateBucketName("mybucket-");
      expect(result.valid).toBe(false);
    });

    it("rejects name starting with period", () => {
      const result = validateBucketName(".mybucket");
      expect(result.valid).toBe(false);
    });

    it("rejects name ending with period", () => {
      const result = validateBucketName("mybucket.");
      expect(result.valid).toBe(false);
    });

    it("rejects underscores", () => {
      const result = validateBucketName("my_bucket");
      expect(result.valid).toBe(false);
    });

    it("rejects spaces", () => {
      const result = validateBucketName("my bucket");
      expect(result.valid).toBe(false);
    });

    it("rejects special characters", () => {
      expect(validateBucketName("my@bucket").valid).toBe(false);
      expect(validateBucketName("my#bucket").valid).toBe(false);
      expect(validateBucketName("my$bucket").valid).toBe(false);
    });

    it("rejects unicode characters", () => {
      const result = validateBucketName("büçkét");
      expect(result.valid).toBe(false);
    });

    it("rejects name with forward slash", () => {
      const result = validateBucketName("my/bucket");
      expect(result.valid).toBe(false);
    });

    it("rejects name with backslash", () => {
      const result = validateBucketName("my\\bucket");
      expect(result.valid).toBe(false);
    });

    it("rejects name with null byte", () => {
      const result = validateBucketName("my\0bucket");
      expect(result.valid).toBe(false);
    });

    it("rejects name with tab character", () => {
      const result = validateBucketName("my\tbucket");
      expect(result.valid).toBe(false);
    });
  });

  describe("invalid bucket names - IP address format", () => {
    it("rejects IPv4 address format", () => {
      const result = validateBucketName("192.168.1.1");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("IP address");
    });

    it("rejects another IPv4 format", () => {
      const result = validateBucketName("10.0.0.1");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("IP address");
    });
  });

  describe("invalid bucket names - consecutive periods", () => {
    it("rejects consecutive periods", () => {
      const result = validateBucketName("my..bucket");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("consecutive periods");
    });
  });

  describe("invalid bucket names - hyphen adjacent to period", () => {
    it("rejects hyphen before period", () => {
      const result = validateBucketName("my-.bucket");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("hyphen adjacent to a period");
    });

    it("rejects period before hyphen", () => {
      const result = validateBucketName("my.-bucket");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("hyphen adjacent to a period");
    });
  });

  describe("edge cases", () => {
    it("accepts bucket name that looks like partial IP", () => {
      // Not a complete IP address format
      expect(validateBucketName("192.168.1").valid).toBe(true);
      expect(validateBucketName("192.168").valid).toBe(true);
    });

    it("accepts bucket name with numbers resembling IP but extra chars", () => {
      expect(validateBucketName("a192.168.1.1").valid).toBe(true);
      expect(validateBucketName("192.168.1.1a").valid).toBe(true);
    });

    it("rejects name that is all hyphens", () => {
      const result = validateBucketName("---");
      expect(result.valid).toBe(false);
    });

    it("rejects single period name (fails length)", () => {
      const result = validateBucketName(".");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("between 3 and 63 characters");
    });

    it("accepts 3 char name with hyphen in middle", () => {
      expect(validateBucketName("a-b")).toEqual({ valid: true });
    });

    it("rejects name with consecutive periods in middle", () => {
      const result = validateBucketName("a..b");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("consecutive periods");
    });
  });
});
