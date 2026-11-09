import { describe, expect, it } from "vitest";
import { decideAdminAccess, isSetupGap, parseAllowlist } from "@/lib/admin/access";

const list = parseAllowlist("Admin@Acme.in, ops@acme.in ,, ");

describe("super-admin decision", () => {
  it("parses the allowlist case-insensitively and ignores blanks", () => {
    expect([...list].sort()).toEqual(["admin@acme.in", "ops@acme.in"]);
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("  ").size).toBe(0);
  });

  it("needs BOTH the ADMIN role and an allowlisted email", () => {
    expect(decideAdminAccess({ role: "ADMIN", email: "ADMIN@acme.in" }, list, true)).toEqual({ ok: true, email: "admin@acme.in" });
    expect(decideAdminAccess({ role: "ADMIN", email: "stranger@x.in" }, list, true)).toMatchObject({ ok: false, reason: "NOT_ALLOWLISTED" });
    expect(decideAdminAccess({ role: "USER", email: "admin@acme.in" }, list, true)).toMatchObject({ ok: false, reason: "NOT_ADMIN_ROLE" });
    expect(decideAdminAccess({ role: "USER", email: "stranger@x.in" }, list, true)).toMatchObject({ ok: false, reason: "NOT_ADMIN" });
  });

  it("fails closed with an empty allowlist, even for an ADMIN role", () => {
    expect(decideAdminAccess({ role: "ADMIN", email: "admin@acme.in" }, new Set(), true)).toMatchObject({ ok: false, reason: "NOT_ALLOWLISTED" });
  });

  it("treats a missing user or session as anonymous, and a missing email as denied", () => {
    expect(decideAdminAccess(null, list, false)).toMatchObject({ ok: false, reason: "ANONYMOUS" });
    expect(decideAdminAccess(null, list, true)).toMatchObject({ ok: false, reason: "ANONYMOUS" });
    expect(decideAdminAccess({ role: "ADMIN", email: null }, list, true)).toMatchObject({ ok: false, reason: "NOT_ALLOWLISTED" });
  });

  it("only setup gaps get a hint; strangers and anonymous get none", () => {
    expect(isSetupGap("NOT_ALLOWLISTED")).toBe(true);
    expect(isSetupGap("NOT_ADMIN_ROLE")).toBe(true);
    expect(isSetupGap("NOT_ADMIN")).toBe(false);
    expect(isSetupGap("ANONYMOUS")).toBe(false);
  });

  it("the old hard-coded email no longer opens anything by itself", () => {
    expect(decideAdminAccess({ role: "USER", email: "admin@bababuilds.com" }, list, true)).toMatchObject({ ok: false, reason: "NOT_ADMIN" });
  });
});
