import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { isDemoTemplateKey, DEFAULT_DEMO_TEMPLATE_KEY } from "@/lib/demo/templates";
import { seedDemoWorkspace } from "@/lib/demo/seed-workspace";
import {
  evaluateDemoProvisionThrottle,
  getClientFingerprint,
  getClientIp,
  recordDemoProvisionAttempt,
  throttleToHttpResponse,
} from "@/lib/demo-auth-throttle";

// --- HELPERS ---

function isLocalhostRequest(request: Request): boolean {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;

  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase() ?? "";
  if (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1")) return true;

  // Best-effort: only trust local development usage; don't rely on x-forwarded-for for security.
  return false;
}

async function verifyTurnstile(
  token: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!token || typeof token !== "string") {
    return { ok: false, status: 400, error: "Security challenge failed: No token." };
  }
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return { ok: false, status: 500, error: "Turnstile is not configured (missing TURNSTILE_SECRET_KEY)." };
  }

  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyData?.success) {
    return { ok: false, status: 403, error: "Bot verification failed." };
  }
  return { ok: true };
}

// --- MAIN API ROUTE ---

export async function POST(request: Request) {
  try {
    // 1. SAFE JSON PARSING
    const body = await request.json().catch(() => ({}));
    const token = body.token;
    const rawTemplateKey = typeof body.templateKey === "string" ? body.templateKey : body.templateId;
    const templateKey = isDemoTemplateKey(rawTemplateKey) ? rawTemplateKey : DEFAULT_DEMO_TEMPLATE_KEY;
    if (rawTemplateKey !== undefined && !isDemoTemplateKey(rawTemplateKey)) {
      return NextResponse.json(
        {
          error:
            "Invalid templateKey. Allowed values: dm_agency, software_company, tax_agency, contractor_builder, freelancer_consultant",
        },
        { status: 400 },
      );
    }

    // --- 🚨 SECURITY LAYER 0: TURNSTILE VERIFICATION ---
    const isDev = process.env.NODE_ENV === "development";
    const isLocal = isLocalhostRequest(request);

    const agentKeyFromHeader = request.headers.get("x-demo-agent-key")?.trim() || null;
    const configuredAgentKey = process.env.DEMO_AGENT_KEY?.trim() || null;
    const hasValidAgentKey =
      Boolean(configuredAgentKey) &&
      Boolean(agentKeyFromHeader) &&
      agentKeyFromHeader === configuredAgentKey;

    // In development we allow non-local callers (e.g. Cloud Agents) ONLY if they present a valid agent key.
    // Without the key, dev access is limited to localhost to reduce accidental exposure.
    if (isDev && !isLocal && !hasValidAgentKey) {
      return NextResponse.json(
        {
          error:
            "Demo provisioning in development is only allowed from localhost unless a valid x-demo-agent-key is provided.",
        },
        { status: 403 },
      );
    }

    // Production requires Turnstile always.
    // Development rules:
    // - localhost: allow without Turnstile (faster local onboarding)
    // - non-local: allow with valid agent key OR Turnstile token (verified)
    if (!isDev) {
      const verify = await verifyTurnstile(token);
      if (!verify.ok) return NextResponse.json({ error: verify.error }, { status: verify.status });
    } else if (!isLocal && !hasValidAgentKey) {
      const verify = await verifyTurnstile(token);
      if (!verify.ok) return NextResponse.json({ error: verify.error }, { status: verify.status });
    }

    // --- 🚨 SECURITY LAYER 1: GLOBAL CIRCUIT BREAKER ---
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const configuredThreshold = Number(process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD ?? "10");
    const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 10;

    const ip = getClientIp(request);
    const fingerprint = getClientFingerprint(request);
    const globalCount = await prisma.workspace.count({
      where: {
        isDemo: true,
        createdAt: { gte: fifteenMinsAgo },
      },
    });

    const decision = await evaluateDemoProvisionThrottle({
      fifteenMinsAgo,
      globalCount,
      globalThreshold: threshold,
      ip,
      fingerprint,
      bypassPerClientLimits: hasValidAgentKey,
    });

    await recordDemoProvisionAttempt({
      ip,
      fingerprint,
      templateKey,
      decision,
    });

    if (!decision.allowed) {
      const blocked = throttleToHttpResponse(decision);
      return NextResponse.json(blocked.body, { status: blocked.status, headers: blocked.headers });
    }

    // --- DATA SEEDING TRANSACTION ---
    const demoId = uuidv4().substring(0, 8);
    const demoEmail = `demo_${demoId}@bababuilds.demo`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: `Demo User ${demoId.toUpperCase()}`,
          email: demoEmail,
          role: "DEMO",
        },
      });
      const ttlHoursRaw = Number(process.env.DEMO_TTL_HOURS ?? "24");
      const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;
      await seedDemoWorkspace(tx, { userId: user.id, templateKey, ttlHours });

    // Generate a secure one-time password for this specific demo login
      const demoPassword = uuidv4(); 
      
      // Store it in NextAuth's VerificationToken table with a 5-minute expiry
      await tx.verificationToken.create({
        data: {
          identifier: demoEmail,
          token: demoPassword, 
          expires: new Date(Date.now() + 5 * 60 * 1000) 
        }
      });

      // Return BOTH the email and the secure token to the client
      return { email: demoEmail, password: demoPassword, templateKey };
      // --- 🚨 SECURITY PATCH END ---
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demo Creation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
