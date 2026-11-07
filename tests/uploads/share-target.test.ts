import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidShareId, loadSharedPayload, toSafeHttpUrl } from "@/lib/uploads/share-target";

const ID = "3f1c9f0e-8a53-4c8e-9a1b-0d6f7a2b4c11";
const OTHER_ID = "9b7e2d44-1c3a-4f55-8e60-7a1d2c3b4e5f";

describe("share-target helpers", () => {
  let cwd: string;
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), "share-target-"));
    spy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
    await mkdir(path.join(cwd, "tmp", "share-target", "ws_a"), { recursive: true });
    await mkdir(path.join(cwd, "tmp", "share-target", "ws_b"), { recursive: true });
    await writeFile(
      path.join(cwd, "tmp", "share-target", "ws_a", `${ID}.json`),
      JSON.stringify({ id: ID, workspaceId: "ws_a", title: "A", files: [{ publicUrl: "", relativePath: "/uploads/share-target/ws_a/x/f.pdf" }] }),
    );
    await writeFile(
      path.join(cwd, "tmp", "share-target", "ws_b", `${OTHER_ID}.json`),
      JSON.stringify({ id: OTHER_ID, workspaceId: "ws_b", title: "B", files: [] }),
    );
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ secret: true }));
  });

  afterEach(async () => {
    spy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("accepts only UUID share ids", () => {
    expect(isValidShareId(ID)).toBe(true);
    for (const bad of ["", "../x", "..%2f", `${ID}/../..`, `${ID}.json`, undefined, 42]) {
      expect(isValidShareId(bad)).toBe(false);
    }
  });

  it("loads a payload for its own workspace and upgrades legacy file urls", async () => {
    const payload = await loadSharedPayload("ws_a", ID);
    expect(payload?.title).toBe("A");
    expect(payload?.files[0].publicUrl).toBe("/uploads/share-target/ws_a/x/f.pdf");
  });

  it("does not read another workspace's payload, even via path traversal", async () => {
    expect(await loadSharedPayload("ws_a", OTHER_ID)).toBeNull();
    expect(await loadSharedPayload("ws_a", `../ws_b/${OTHER_ID}`)).toBeNull();
    expect(await loadSharedPayload("ws_a", "../../../package")).toBeNull();
  });

  it("rejects a workspace id that tries to escape the share-target root", async () => {
    expect(await loadSharedPayload("../..", ID)).toBeNull();
  });

  it("rejects payloads whose recorded workspace differs from the requester", async () => {
    await writeFile(
      path.join(cwd, "tmp", "share-target", "ws_b", `${ID}.json`),
      JSON.stringify({ id: ID, workspaceId: "ws_a", files: [] }),
    );
    expect(await loadSharedPayload("ws_b", ID)).toBeNull();
  });

  it("only allows http(s) source links", () => {
    expect(toSafeHttpUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(toSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(toSafeHttpUrl("not a url")).toBeNull();
    expect(toSafeHttpUrl(null)).toBeNull();
  });
});
