import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({ syncPlayPurchase: vi.fn(), markPlayOrderRefunded: vi.fn() }));
vi.mock("@/lib/billing/play-subscription", async (orig) => ({ ...(await orig<object>()), ...sync }));

const session = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn(async () => session.value) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const rbac = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<object>()), ...rbac }));
vi.mock("@/lib/rate-limit-memory", () => ({ checkRateLimit: () => ({ ok: true }) }));

import { GooglePlayApiError } from "@/lib/billing/google-play-client";
import { PlayBindingError } from "@/lib/billing/play-subscription";
import { RbacDeniedError } from "@/lib/rbac";
import { POST as rtdn } from "@/app/api/billing/play/rtdn/route";
import { POST as verify } from "@/app/api/billing/play/verify/route";

const SECRET = "s3cret-value";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const push = (notification: unknown, token: string | null = SECRET) =>
  new Request(`https://erp.test/api/billing/play/rtdn${token === null ? "" : `?token=${token}`}`, {
    method: "POST",
    body: JSON.stringify({ message: { data: b64(notification), messageId: "1" } }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_PLAY_RTDN_SECRET", SECRET);
  vi.stubEnv("GOOGLE_PLAY_PACKAGE_NAME", "com.bababuilds.erp.twa");
  sync.syncPlayPurchase.mockResolvedValue({ ok: true });
});

describe("POST /api/billing/play/rtdn", () => {
  it("rejects a missing or wrong secret and never calls Google", async () => {
    expect((await rtdn(push({}, null))).status).toBe(401);
    expect((await rtdn(push({}, "wrong-value"))).status).toBe(401);
    expect(sync.syncPlayPurchase).not.toHaveBeenCalled();
  });

  it("is closed (503) when no secret is configured", async () => {
    vi.stubEnv("GOOGLE_PLAY_RTDN_SECRET", "");
    expect((await rtdn(push({}))).status).toBe(503);
  });

  it("400s a malformed body (retrying cannot fix it)", async () => {
    const res = await rtdn(new Request(`https://erp.test/x?token=${SECRET}`, { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("acknowledges test notifications and other apps' packages without syncing", async () => {
    expect((await rtdn(push({ packageName: "com.bababuilds.erp.twa", testNotification: { version: "1.0" } }))).status).toBe(200);
    const other = await rtdn(push({ packageName: "com.other.app", subscriptionNotification: { purchaseToken: "t" } }));
    expect(await other.json()).toMatchObject({ ignored: "other_package" });
    expect(sync.syncPlayPurchase).not.toHaveBeenCalled();
  });

  it("re-syncs from Google on a subscription notification (body is only a hint)", async () => {
    const res = await rtdn(push({ packageName: "com.bababuilds.erp.twa", subscriptionNotification: { notificationType: 2, purchaseToken: "tok-1", subscriptionId: "x" } }));
    expect(res.status).toBe(200);
    expect(sync.syncPlayPurchase).toHaveBeenCalledWith({ purchaseToken: "tok-1", source: "rtdn" });
  });

  it("marks the order refunded and re-syncs on a voided purchase", async () => {
    await rtdn(push({ voidedPurchaseNotification: { purchaseToken: "tok-2", orderId: "GPA.9" } }));
    expect(sync.markPlayOrderRefunded).toHaveBeenCalledWith("GPA.9");
    expect(sync.syncPlayPurchase).toHaveBeenCalledWith({ purchaseToken: "tok-2", source: "voided" });
  });

  it("returns 200 for permanent failures and 500 for transient ones (Pub/Sub retry)", async () => {
    const n = { subscriptionNotification: { purchaseToken: "tok-3" } };
    sync.syncPlayPurchase.mockRejectedValueOnce(new PlayBindingError("x", "TOKEN_BOUND_TO_OTHER_WORKSPACE", 409));
    expect((await rtdn(push(n))).status).toBe(200);
    sync.syncPlayPurchase.mockRejectedValueOnce(new GooglePlayApiError("gone", 404));
    expect((await rtdn(push(n))).status).toBe(200);
    sync.syncPlayPurchase.mockRejectedValueOnce(new GooglePlayApiError("upstream", 502));
    expect((await rtdn(push(n))).status).toBe(500);
  });
});

describe("POST /api/billing/play/verify", () => {
  const req = (body: unknown) => new Request("https://erp.test/api/billing/play/verify", { method: "POST", body: JSON.stringify(body) });
  const signedIn = () => (session.value = { workspaceId: "w1", user: { id: "u1", email: "a@b.c" } });

  beforeEach(() => {
    session.value = null;
    vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "{}");
    rbac.requirePermission.mockResolvedValue(undefined);
  });

  it("requires a session", async () => {
    expect((await verify(req({ purchaseToken: "x".repeat(20) }))).status).toBe(401);
  });

  it("requires the billing.manage permission", async () => {
    signedIn();
    rbac.requirePermission.mockRejectedValue(new RbacDeniedError("billing.manage", "denied"));
    const res = await verify(req({ purchaseToken: "x".repeat(20) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(sync.syncPlayPurchase).not.toHaveBeenCalled();
  });

  it("is unavailable (503) when Play credentials are not configured", async () => {
    signedIn();
    vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "");
    expect((await verify(req({ purchaseToken: "x".repeat(20) }))).status).toBe(503);
  });

  it("validates the token shape", async () => {
    signedIn();
    expect((await verify(req({ purchaseToken: "short" }))).status).toBe(400);
    expect((await verify(req({ purchaseToken: 123 }))).status).toBe(400);
    expect((await verify(req({ purchaseToken: "x".repeat(5000) }))).status).toBe(400);
  });

  it("binds to the caller's own workspace and reports the result", async () => {
    signedIn();
    sync.syncPlayPurchase.mockResolvedValue({ ok: true, ignored: false, entitled: true, state: "SUBSCRIPTION_STATE_ACTIVE", interval: "YEARLY", expiresAt: new Date("2027-01-01T00:00:00Z") });
    const res = await verify(req({ purchaseToken: "x".repeat(20), workspaceId: "attacker-chosen" }));
    expect(await res.json()).toMatchObject({ ok: true, entitled: true, pending: false, interval: "YEARLY" });
    expect(sync.syncPlayPurchase).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w1", source: "client_verify" }));
  });

  it("flags a pending purchase and maps a cross-workspace token to 409", async () => {
    signedIn();
    sync.syncPlayPurchase.mockResolvedValueOnce({ ok: true, ignored: false, entitled: false, state: "SUBSCRIPTION_STATE_PENDING", interval: "MONTHLY", expiresAt: null });
    expect(await (await verify(req({ purchaseToken: "x".repeat(20) }))).json()).toMatchObject({ entitled: false, pending: true });
    sync.syncPlayPurchase.mockRejectedValueOnce(new PlayBindingError("bound", "TOKEN_BOUND_TO_OTHER_WORKSPACE", 409));
    expect((await verify(req({ purchaseToken: "x".repeat(20) }))).status).toBe(409);
  });
});
