import crypto from "crypto";
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { evaluateEmailSignInThrottle } from "@/lib/auth-throttle";
import { recordAuthThrottleAttempt } from "@/lib/auth-observability";

const handler = NextAuth(authOptions);

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
  return realIp?.trim() || "unknown";
}

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

async function parseEmailSignInAttempt(req: Request): Promise<{ email: string; turnstileToken: string | null }> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    return {
      email: typeof body.email === "string" ? body.email : "",
      turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
    };
  }

  const formData = await req.clone().formData().catch(() => null);
  return {
    email: typeof formData?.get("email") === "string" ? String(formData?.get("email")) : "",
    turnstileToken: typeof formData?.get("turnstileToken") === "string" ? String(formData?.get("turnstileToken")) : null,
  };
}

async function applyEmailSignInThrottle(req: NextRequest): Promise<Response | null> {
  if (!req.nextUrl.pathname.endsWith("/signin/email")) {
    return null;
  }

  const { email, turnstileToken } = await parseEmailSignInAttempt(req);
  if (!email.trim()) {
    return null;
  }

  const ip = getClientIp(req);
  const fingerprint = req.headers.get("x-auth-fingerprint");
  const decision = await evaluateEmailSignInThrottle({
    ip,
    email,
    fingerprint,
    turnstileToken,
  });

  recordAuthThrottleAttempt({
    ip,
    emailHash: hashEmail(email),
    fingerprint: fingerprint?.trim() || null,
    decision: decision.reason,
    retryAfterSeconds: decision.retryAfterSeconds,
    requiresTurnstile: decision.requiresTurnstile,
  });

  if (!decision.allowed) {
    return Response.json(
      {
        error: "Too many sign-in attempts. Please retry later.",
        reason: decision.reason,
        retryAfter: decision.retryAfterSeconds,
        requiresTurnstile: decision.requiresTurnstile,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return null;
}

type RouteContext = {
  params: Promise<{
    nextauth: string[];
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  return handler(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const throttleResponse = await applyEmailSignInThrottle(req);
  if (throttleResponse) {
    return throttleResponse;
  }

  return handler(req, context);
}
