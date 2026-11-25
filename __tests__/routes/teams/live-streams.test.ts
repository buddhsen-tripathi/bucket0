import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  hasPermission: vi.fn(),
  isTeamOwner: vi.fn(),
  requireTeamFeature: vi.fn(),
  getRecentActivity: vi.fn(),
  getRecentMessages: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({ auth: mocks.auth }));

vi.mock("@/lib/teams/permission-service", () => ({
  Permission: { VIEW_ACTIVITY: "canViewActivity", CHAT: "canChat" },
  permissionService: {
    hasPermission: mocks.hasPermission,
    isTeamOwner: mocks.isTeamOwner,
  },
}));

vi.mock("@/lib/teams/route-helpers", () => ({
  requireTeamFeature: mocks.requireTeamFeature,
}));

vi.mock("@/lib/teams/activity-service", () => ({
  activityService: { getRecentActivity: mocks.getRecentActivity },
}));

vi.mock("@/lib/teams/chat-service", () => ({
  chatService: { getRecentMessages: mocks.getRecentMessages },
}));

vi.mock("@/lib/shared/logger", () => ({
  teamLog: { info: vi.fn(), error: vi.fn() },
}));

import { GET as activityGET } from "@/server/routes/api/teams/[teamId]/activity/stream/route";
import { GET as messagesGET } from "@/server/routes/api/teams/[teamId]/messages/stream/route";

const cases = [
  {
    name: "activity stream",
    GET: activityGET,
    feature: "activityLogsEnabled",
    poll: mocks.getRecentActivity,
    intervalMs: 5000,
    type: "activities",
  },
  {
    name: "messages stream",
    GET: messagesGET,
    feature: "chatEnabled",
    poll: mocks.getRecentMessages,
    intervalMs: 2000,
    type: "messages",
  },
] as const;

function open(GET: (typeof cases)[number]["GET"]) {
  const request = { signal: new AbortController().signal } as never;
  return GET(request, { params: Promise.resolve({ teamId: "team_1" }) });
}

const decoder = new TextDecoder();

describe.each(cases)("$name re-authorization", ({ GET, feature, poll, intervalMs, type }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.isTeamOwner.mockResolvedValue(false);
    mocks.requireTeamFeature.mockResolvedValue(null);
    poll.mockResolvedValue([{ id: "row_1" }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects opening the stream when the owner's plan disables the feature", async () => {
    mocks.requireTeamFeature.mockResolvedValue(new Response(null, { status: 403 }));

    const res = await open(GET);

    expect(res.status).toBe(403);
    expect(mocks.requireTeamFeature).toHaveBeenCalledWith("team_1", feature);
  });

  it("closes the stream once permission is revoked and stops polling data", async () => {
    const res = await open(GET);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();

    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain('"connected"');

    await vi.advanceTimersByTimeAsync(intervalMs);
    const second = await reader.read();
    expect(decoder.decode(second.value)).toContain(`"${type}"`);
    expect(poll).toHaveBeenCalledTimes(1);
    // Authorization is not re-queried on every tick
    expect(mocks.hasPermission).toHaveBeenCalledTimes(1);

    // Member removed (hasPermission is false for non-members)
    mocks.hasPermission.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(30_000);
    const pollsBeforeClose = poll.mock.calls.length;

    let next = await reader.read();
    while (!next.done) next = await reader.read();
    expect(next.done).toBe(true);

    await vi.advanceTimersByTimeAsync(intervalMs * 3);
    expect(poll).toHaveBeenCalledTimes(pollsBeforeClose);
  });

  it("closes the stream when the plan feature is turned off mid-stream", async () => {
    const res = await open(GET);
    const reader = res.body!.getReader();
    await reader.read();

    mocks.requireTeamFeature.mockResolvedValue(new Response(null, { status: 403 }));
    await vi.advanceTimersByTimeAsync(30_000);
    const pollsBeforeClose = poll.mock.calls.length;

    let next = await reader.read();
    while (!next.done) next = await reader.read();
    expect(next.done).toBe(true);

    await vi.advanceTimersByTimeAsync(intervalMs * 3);
    expect(poll).toHaveBeenCalledTimes(pollsBeforeClose);
  });
});
