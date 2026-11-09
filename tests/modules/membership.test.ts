import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceUser: { findFirst: findFirstMock } } }));

import { resolveSessionMembership } from "@/lib/workspace-scope";

describe("resolveSessionMembership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns nothing without a signed-in user", async () => {
    expect(await resolveSessionMembership(null)).toBeNull();
    expect(await resolveSessionMembership({ user: {} })).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("uses the workspace the user switched to, not their oldest one", async () => {
    findFirstMock.mockResolvedValueOnce({ workspaceId: "second", role: "OWNER", businessRole: "OWNER" });
    const m = await resolveSessionMembership({ user: { id: "u1" }, workspaceId: "second" });
    expect(m?.workspaceId).toBe("second");
    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock.mock.calls[0][0].where).toEqual({ userId: "u1", workspaceId: "second", isActive: true });
  });

  it("does not trust a session workspace the user no longer belongs to", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ workspaceId: "oldest", role: "OWNER", businessRole: null });
    const m = await resolveSessionMembership({ user: { id: "u1" }, workspaceId: "removed" });
    expect(m?.workspaceId).toBe("oldest");
    expect(findFirstMock.mock.calls[1][0].orderBy).toEqual({ joinedAt: "asc" });
  });

  it("falls back to the oldest membership when the session has no workspace", async () => {
    findFirstMock.mockResolvedValueOnce({ workspaceId: "oldest", role: "OWNER", businessRole: null });
    expect((await resolveSessionMembership({ user: { id: "u1" } }))?.workspaceId).toBe("oldest");
  });
});
