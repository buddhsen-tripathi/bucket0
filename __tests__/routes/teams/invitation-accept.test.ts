import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  selectResults: [] as unknown[][],
  insertValues: vi.fn(),
  updateWhere: vi.fn(),
  tryIncrementMemberCount: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({ currentUser: mocks.currentUser }));

vi.mock("@/lib/teams/route-helpers", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_1", error: null })),
}));

vi.mock("@/lib/shared/db", () => {
  const chain = () => {
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => mocks.selectResults.shift() ?? [],
    };
    return q;
  };
  return {
    db: {
      select: vi.fn(chain),
      insert: vi.fn(() => ({ values: mocks.insertValues })),
      update: vi.fn(() => ({ set: () => ({ where: mocks.updateWhere }) })),
    },
  };
});

vi.mock("@/db/schema", () => ({
  teams: { id: "teams.id" },
  teamMembers: { teamId: "tm.teamId", userId: "tm.userId" },
  teamInvitations: { token: "ti.token", id: "ti.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/teams/team-quota-service", () => ({
  teamQuotaService: {
    tryIncrementMemberCount: mocks.tryIncrementMemberCount,
    decrementMemberCount: vi.fn(),
  },
}));

vi.mock("@/lib/teams/activity-service", () => ({ logMemberJoin: vi.fn(async () => {}) }));
vi.mock("@/lib/teams/chat-service", () => ({ chatService: { sendSystemMessage: vi.fn(async () => {}) } }));
vi.mock("@/lib/shared/logger", () => ({ teamLog: { info: vi.fn(), error: vi.fn() } }));

import { POST } from "@/server/routes/api/teams/invitations/accept/route";

const invitation = {
  id: "inv_1",
  teamId: "team_1",
  email: "invitee@example.test",
  status: "pending",
  expiresAt: new Date(Date.now() + 86_400_000),
  roleId: null,
  canUpload: true,
  canDownload: true,
  canDelete: false,
  canShare: false,
  canManageMembers: false,
  canViewActivity: true,
  canChat: true,
  invitedBy: "owner_1",
};

function call() {
  const request = { json: async () => ({ token: "tok" }) } as never;
  return POST(request);
}

describe("POST /api/teams/invitations/accept (verified email binding)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.tryIncrementMemberCount.mockResolvedValue(true);
    // invitation lookup, existing-member lookup, team lookup
    mocks.selectResults = [[invitation], [], [{ id: "team_1", name: "Team", slug: "team" }]];
  });

  it("rejects when the matching first address is unverified", async () => {
    mocks.currentUser.mockResolvedValue({
      fullName: "Mallory",
      emailAddresses: [{ emailAddress: "Invitee@Example.test", verification: { status: "unverified" } }],
    });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("rejects when the address has no verification record", async () => {
    mocks.currentUser.mockResolvedValue({
      fullName: "Mallory",
      emailAddresses: [{ emailAddress: "invitee@example.test", verification: null }],
    });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("accepts a verified matching address that is not at index 0, case-insensitively", async () => {
    mocks.currentUser.mockResolvedValue({
      fullName: "Invitee",
      emailAddresses: [
        { emailAddress: "other@example.test", verification: { status: "verified" } },
        { emailAddress: "INVITEE@example.test", verification: { status: "verified" } },
      ],
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team_1", userId: "user_1" }));
  });

  it("rejects when no address matches the invitation", async () => {
    mocks.currentUser.mockResolvedValue({
      fullName: "Someone",
      emailAddresses: [{ emailAddress: "someone@example.test", verification: { status: "verified" } }],
    });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
