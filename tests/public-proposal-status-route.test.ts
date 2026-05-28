import { beforeEach, describe, expect, it, vi } from "vitest";

const proposalFindUnique = vi.fn();
const proposalUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposal: {
      findUnique: (...args: unknown[]) => proposalFindUnique(...args),
      update: (...args: unknown[]) => proposalUpdate(...args),
    },
  },
}));

async function patchStatus(body: unknown, token?: string) {
  const { PATCH } = await import("@/app/api/p/[token]/status/route");

  return PATCH(
    new Request("http://localhost/api/p/public-token/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
}

describe("public proposal status route", () => {
  beforeEach(() => {
    proposalFindUnique.mockReset();
    proposalUpdate.mockReset();
  });

  it("records a revision request and preserves existing structured proposal metadata", async () => {
    proposalFindUnique.mockResolvedValue({
      status: "SENT",
      validUntil: new Date(Date.now() + 86_400_000),
      expiredAt: null,
      declineReason: JSON.stringify({
        richSections: [{ title: "Intro", body: "Existing structured content" }],
      }),
    });
    proposalUpdate.mockResolvedValue({ status: "REVISION_REQUESTED" });

    const response = await patchStatus(
      { status: "REVISION_REQUESTED", clientNote: "Please add a training option." },
      "public-token",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, status: "REVISION_REQUESTED" });
    expect(proposalFindUnique).toHaveBeenCalledWith({
      where: { publicToken: "public-token" },
      select: {
        status: true,
        validUntil: true,
        expiredAt: true,
        declineReason: true,
      },
    });
    expect(proposalUpdate).toHaveBeenCalledOnce();

    const updateArgs = proposalUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ publicToken: "public-token" });
    expect(updateArgs.data.status).toBe("REVISION_REQUESTED");
    expect(updateArgs.data.declinedAt).toBeInstanceOf(Date);

    const persistedFeedback = JSON.parse(updateArgs.data.declineReason);
    expect(persistedFeedback.richSections).toEqual([{ title: "Intro", body: "Existing structured content" }]);
    expect(persistedFeedback.clientNote).toBe("Please add a training option.");
    expect(typeof persistedFeedback.revisionRequestedAt).toBe("string");
  });

  it("rejects a missing token", async () => {
    const response = await patchStatus(
      { status: "REVISION_REQUESTED", clientNote: "Please revise." },
      "   ",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Proposal token is required." });
    expect(proposalFindUnique).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the public token does not match a proposal", async () => {
    proposalFindUnique.mockResolvedValue(null);

    const response = await patchStatus(
      { status: "REVISION_REQUESTED", clientNote: "Please revise." },
      "unknown-token",
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Proposal not found." });
    expect(proposalFindUnique).toHaveBeenCalledWith({
      where: { publicToken: "unknown-token" },
      select: {
        status: true,
        validUntil: true,
        expiredAt: true,
        declineReason: true,
      },
    });
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it("rejects revision requests for accepted proposals", async () => {
    proposalFindUnique.mockResolvedValue({
      status: "ACCEPTED",
      validUntil: new Date(Date.now() + 86_400_000),
      expiredAt: null,
      declineReason: null,
    });

    const response = await patchStatus(
      { status: "REVISION_REQUESTED", clientNote: "Please revise." },
      "public-token",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Proposal is already accepted and cannot be revised.",
    });
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid public status transitions", async () => {
    const response = await patchStatus(
      { status: "ACCEPTED", clientNote: "Trying to accept through the status route." },
      "public-token",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid public proposal status transition." });
    expect(proposalFindUnique).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
  });
});
