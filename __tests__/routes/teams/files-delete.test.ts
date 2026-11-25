import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  isTeamOwner: vi.fn(),
  isTeamMember: vi.fn(),
  getFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteFilesByPrefix: vi.fn(),
  deleteTeamFile: vi.fn(),
  deleteTeamFolder: vi.fn(),
  getTeamFileSize: vi.fn(),
  decrementUsage: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/server/context", () => ({
  runInBackground: vi.fn(async () => {}),
}));

vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: {
    deleteTeamFile: mocks.deleteTeamFile,
    deleteTeamFolder: mocks.deleteTeamFolder,
    getTeamFileSize: mocks.getTeamFileSize,
  },
}));

vi.mock("@/lib/teams/permission-service", () => ({
  Permission: { DELETE: "canDelete" },
  permissionService: {
    hasPermission: mocks.hasPermission,
    isTeamOwner: mocks.isTeamOwner,
    isTeamMember: mocks.isTeamMember,
  },
}));

vi.mock("@/lib/teams/route-helpers", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_1", error: null })),
}));

vi.mock("@/lib/teams/team-file-service", () => ({
  teamFileService: {
    getFile: mocks.getFile,
    deleteFile: mocks.deleteFile,
    deleteFilesByPrefix: mocks.deleteFilesByPrefix,
  },
}));

vi.mock("@/lib/teams/team-quota-service", () => ({
  teamQuotaService: { decrementUsage: mocks.decrementUsage },
}));

vi.mock("@/lib/teams/activity-service", () => ({
  logFileDelete: vi.fn(async () => {}),
}));

vi.mock("@/lib/shared/logger", () => ({
  teamLog: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/shared/db", () => ({
  db: { update: mocks.update },
}));

vi.mock("@/db/schema", () => ({
  teamShareLinks: { teamId: "teamShareLinks.teamId", fileKey: "teamShareLinks.fileKey", isActive: "isActive" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  like: vi.fn((col: unknown, val: unknown) => ({ op: "like", col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
}));

import { DELETE } from "@/server/routes/api/teams/[teamId]/files/delete/route";
import { teamShareLinks } from "@/db/schema";

function call(key: string) {
  const request = { json: async () => ({ key }) } as never;
  return DELETE(request, { params: Promise.resolve({ teamId: "team_1" }) });
}

describe("DELETE /api/teams/[teamId]/files/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue(undefined);
    mocks.hasPermission.mockResolvedValue(false);
    mocks.isTeamOwner.mockResolvedValue(false);
    mocks.isTeamMember.mockResolvedValue(true);
    mocks.getFile.mockResolvedValue({ uploadedBy: "user_1", fileSize: 10 });
    mocks.deleteTeamFile.mockResolvedValue(undefined);
    mocks.deleteFile.mockResolvedValue(undefined);
  });

  it("denies a former member who uploaded the file", async () => {
    mocks.isTeamMember.mockResolvedValue(false);

    const res = await call("report.pdf");

    expect(res.status).toBe(403);
    expect(mocks.getFile).not.toHaveBeenCalled();
    expect(mocks.deleteTeamFile).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.decrementUsage).not.toHaveBeenCalled();
  });

  it("still allows a current member to delete their own upload", async () => {
    const res = await call("report.pdf");

    expect(res.status).toBe(200);
    expect(mocks.deleteTeamFile).toHaveBeenCalledWith("team_1", "report.pdf");
    expect(mocks.deleteFile).toHaveBeenCalledWith("team_1", "teams/team_1/report.pdf");
  });

  it("denies a current member who neither uploaded the file nor has canDelete", async () => {
    mocks.getFile.mockResolvedValue({ uploadedBy: "someone_else", fileSize: 10 });

    const res = await call("report.pdf");

    expect(res.status).toBe(403);
    expect(mocks.deleteTeamFile).not.toHaveBeenCalled();
  });

  it("deactivates share links for the deleted file key", async () => {
    const res = await call("docs/report.pdf");

    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(teamShareLinks);
    expect(mocks.set).toHaveBeenCalledWith({ isActive: false });
    expect(mocks.where).toHaveBeenCalledWith({
      op: "and",
      args: [
        { op: "eq", col: "teamShareLinks.teamId", val: "team_1" },
        { op: "eq", col: "teamShareLinks.fileKey", val: "docs/report.pdf" },
      ],
    });
  });

  it("deactivates share links under a deleted folder prefix", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    mocks.getFile.mockResolvedValue(undefined);
    mocks.deleteFilesByPrefix.mockResolvedValue({ totalSize: 20, count: 2 });
    mocks.deleteTeamFolder.mockResolvedValue(undefined);

    const res = await call("docs/");

    expect(res.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({ isActive: false });
    expect(mocks.where).toHaveBeenCalledWith({
      op: "and",
      args: [
        { op: "eq", col: "teamShareLinks.teamId", val: "team_1" },
        { op: "like", col: "teamShareLinks.fileKey", val: "docs/%" },
      ],
    });
  });
});
