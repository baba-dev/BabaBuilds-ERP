import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const wf = fs.readFileSync(path.resolve(__dirname, "../../.github/workflows/android-release.yml"), "utf8");

describe("android-release workflow guards", () => {
  it("is manual only and never runs on pull requests (public repo)", () => {
    expect(wf).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    expect(wf).not.toMatch(/pull_request/);
    expect(wf).not.toMatch(/\n\s+push:/);
    expect(wf).toContain("github.ref == 'refs/heads/main'");
  });

  it("references all five secrets and the TWA package", () => {
    for (const s of [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
      "PLAY_SERVICE_ACCOUNT_JSON",
    ]) {
      expect(wf, s).toContain(`secrets.${s}`);
    }
    expect(wf).toContain("packageName: com.bababuilds.erp.twa");
  });

  it("rejects a version_code that is not greater than the manifest's", () => {
    expect(wf).toMatch(/-le "\$current"/);
  });

  it("builds non-interactively: update --skipVersionUpgrade before build, stdin closed", () => {
    expect(wf).toMatch(/bubblewrap update --skipVersionUpgrade <\/dev\/null\s*\n\s*bubblewrap build --skipPwaValidation <\/dev\/null/);
  });

  it("defaults the upload track to internal and never echoes secrets", () => {
    expect(wf).toMatch(/track:[\s\S]*?default: internal/);
    expect(wf).not.toMatch(/echo[^\n]*\$\{\{\s*secrets\./);
    expect(wf).not.toMatch(/echo[^\n]*\$\{?(BUBBLEWRAP_|KEYSTORE_B64)/);
  });

  it("removes the decoded keystore at the end", () => {
    expect(wf).toMatch(/if: always\(\)[\s\S]*rm -f android\/android\.keystore/);
  });
});
