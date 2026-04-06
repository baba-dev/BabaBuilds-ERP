import test from "node:test";
import assert from "node:assert/strict";
import { validateAndResolveBackupPath } from "./route";

test("rejects parent traversal payloads", () => {
  const traversalPayloads = [
    "../ERP_BACKUP_2026-04-06T10:10:10.zip",
    "..\\ERP_BACKUP_2026-04-06T10:10:10.zip",
    "%2e%2e/ERP_BACKUP_2026-04-06T10:10:10.zip",
    "ERP_BACKUP_2026-04-06T10:10:10..zip",
  ];

  for (const payload of traversalPayloads) {
    const result = validateAndResolveBackupPath(payload);
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.status, 400);
    }
  }
});

test("rejects nested path payloads", () => {
  const nestedPathPayloads = [
    "nested/ERP_BACKUP_2026-04-06T10:10:10.zip",
    "nested\\ERP_BACKUP_2026-04-06T10:10:10.zip",
  ];

  for (const payload of nestedPathPayloads) {
    const result = validateAndResolveBackupPath(payload);
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.status, 400);
    }
  }
});

test("accepts canonical backup filename format", () => {
  const validFilename = "ERP_BACKUP_2026-04-06T10:10:10.zip";
  const result = validateAndResolveBackupPath(validFilename);

  assert.equal("filePath" in result, true);
});
