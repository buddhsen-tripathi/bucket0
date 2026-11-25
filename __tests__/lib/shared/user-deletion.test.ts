import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const deleteAllObjects = vi.fn(async (_userId: string, bucket: string) => {
  calls.push(`deleteAllObjects:${bucket}`);
  return { deletedCount: 1, totalBytesDeleted: 1 };
});

const tables = {
  users: { name: "users", id: "users.id" },
  cloudFiles: { name: "cloudFiles", userId: "cloudFiles.userId" },
  shareLinks: { name: "shareLinks", userId: "shareLinks.userId" },
  s3Configurations: { name: "s3Configurations", userId: "s3Configurations.userId" },
  subscriptions: { name: "subscriptions", userId: "subscriptions.userId" },
  s3ApiCredentials: { name: "s3ApiCredentials", userId: "s3ApiCredentials.userId" },
  s3ApiBuckets: { name: "s3ApiBuckets", userId: "s3ApiBuckets.userId", bucketName: "s3ApiBuckets.bucketName" },
  agentApiKeys: { name: "agentApiKeys", userId: "agentApiKeys.userId" },
  teams: { name: "teams", id: "teams.id", ownerId: "teams.ownerId" },
  teamMembers: { name: "teamMembers", teamId: "teamMembers.teamId", userId: "teamMembers.userId" },
};

vi.mock("@/db/schema", () => tables);

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
}));

vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({
      from: (table: { name: string }) => ({
        where: async () =>
          table.name === "s3ApiBuckets" ? [{ bucketName: "photos" }, { bucketName: "logs" }] : [],
      }),
    }),
    delete: (table: { name: string }) => ({
      where: async () => {
        calls.push(`delete:${table.name}`);
      },
    }),
  },
}));

vi.mock("@/lib/s3-api/storage-service", () => ({
  s3ApiStorageService: { deleteAllObjects },
}));

vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: { deleteAllUserFiles: vi.fn().mockResolvedValue({ totalSize: 0, count: 0 }) },
}));

vi.mock("@/lib/cloud/thumbnail-storage", () => ({
  deleteGeneratedThumbnails: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: { removeAllForUser: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/teams/team-quota-service", () => ({
  teamQuotaService: { decrementMemberCount: vi.fn() },
}));

vi.mock("@/lib/teams/team-deletion-service", () => ({
  deleteTeamCompletely: vi.fn(),
}));

vi.mock("@/lib/shared/logger", () => ({
  userLog: { info: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  calls.length = 0;
  deleteAllObjects.mockClear();
});

describe("purgeUserData S3 API objects", () => {
  it("deletes every S3 API bucket's objects before removing the bucket rows", async () => {
    const { purgeUserData } = await import("@/lib/shared/user-deletion");

    await purgeUserData("userA");

    expect(deleteAllObjects).toHaveBeenCalledWith("userA", "photos");
    expect(deleteAllObjects).toHaveBeenCalledWith("userA", "logs");
    const bucketRowDelete = calls.indexOf("delete:s3ApiBuckets");
    expect(bucketRowDelete).toBeGreaterThan(calls.indexOf("deleteAllObjects:photos"));
    expect(bucketRowDelete).toBeGreaterThan(calls.indexOf("deleteAllObjects:logs"));
    expect(calls).toContain("delete:users");
  });

  it("continues the purge but keeps bucket rows for a retry when S3 API object deletion fails", async () => {
    deleteAllObjects.mockRejectedValueOnce(new Error("R2 down"));
    const { purgeUserData } = await import("@/lib/shared/user-deletion");

    await purgeUserData("userA");

    expect(calls).not.toContain("delete:s3ApiBuckets");
    expect(calls).toContain("delete:users");
  });
});
