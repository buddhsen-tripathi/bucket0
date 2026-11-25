import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const revokeSession = vi.fn();
const auth = vi.fn();

vi.mock("@/server/compat/clerk", () => ({
  auth: () => auth(),
  clerkClient: async () => ({ sessions: { getSession, revokeSession } }),
}));

vi.mock("@/lib/shared/logger", () => ({
  userLog: { info: vi.fn(), error: vi.fn() },
}));

function del(sessionId: string) {
  return new Request("http://localhost/api/user/sessions", {
    method: "DELETE",
    body: JSON.stringify({ sessionId }),
  });
}

beforeEach(() => {
  getSession.mockReset();
  revokeSession.mockReset().mockResolvedValue({});
  auth.mockReset().mockResolvedValue({ userId: "userA" });
});

describe("DELETE /api/user/sessions ownership", () => {
  it("revokes the caller's own session", async () => {
    getSession.mockResolvedValue({ id: "sess_a", userId: "userA" });
    const { DELETE } = await import("@/server/routes/api/user/sessions/route");

    const res = await DELETE(del("sess_a"));

    expect(res.status).toBe(200);
    expect(revokeSession).toHaveBeenCalledWith("sess_a");
  });

  it("returns 404 and never revokes another user's session", async () => {
    getSession.mockResolvedValue({ id: "sess_b", userId: "userB" });
    const { DELETE } = await import("@/server/routes/api/user/sessions/route");

    const res = await DELETE(del("sess_b"));

    expect(res.status).toBe(404);
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown session id", async () => {
    getSession.mockRejectedValue(new Error("not found"));
    const { DELETE } = await import("@/server/routes/api/user/sessions/route");

    const res = await DELETE(del("sess_missing"));

    expect(res.status).toBe(404);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
