import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isLegacyPasswordHash,
  validatePasswordStrength,
  verifyAgainstDummyHash,
  verifyPassword,
} from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes new passwords with scrypt and verifies them", async () => {
    const hash = await hashPassword("correct-horse-battery-9");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(isLegacyPasswordHash(hash)).toBe(false);
    expect(await verifyPassword("correct-horse-battery-9", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-battery-8", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-123"), hashPassword("same-password-123")]);
    expect(a).not.toBe(b);
  });

  it("still verifies legacy bcrypt hashes and flags them for upgrade", async () => {
    const legacy = await bcrypt.hash("legacy-password-42", 4);
    expect(isLegacyPasswordHash(legacy)).toBe(true);
    expect(await verifyPassword("legacy-password-42", legacy)).toBe(true);
    expect(await verifyPassword("wrong-password-42", legacy)).toBe(false);
  });

  it("rejects malformed or empty hashes without throwing", async () => {
    expect(await verifyPassword("anything-123456", null)).toBe(false);
    expect(await verifyPassword("anything-123456", "")).toBe(false);
    expect(await verifyPassword("anything-123456", "scrypt$bad")).toBe(false);
    expect(await verifyPassword("anything-123456", "scrypt$32768$8$1$$")).toBe(false);
  });

  it("refuses weak passwords", async () => {
    expect(validatePasswordStrength("short1")).not.toBeNull();
    await expect(hashPassword("nodigitsatallhere")).rejects.toThrow();
  });

  it("dummy verification always reports failure", async () => {
    expect(await verifyAgainstDummyHash("whatever-password-1")).toBe(false);
  });
});
