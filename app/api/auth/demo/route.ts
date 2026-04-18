import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_DEMO_TEMPLATE_KEY,
  isDemoTemplateKey,
  type DemoTemplateKey,
} from "@/lib/demo/templates";
import { seedDemoWorkspace } from "@/lib/demo/seed-workspace";

function isLocalhostRequest(request: Request): boolean {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;

  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase() ?? "";
  if (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1")) return true;

  return false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    const templateKey: DemoTemplateKey = isDemoTemplateKey(body.templateKey)
      ? body.templateKey
      : DEFAULT_DEMO_TEMPLATE_KEY;

    if (body.templateKey !== undefined && !isDemoTemplateKey(body.templateKey)) {
      return NextResponse.json(
        { error: "Invalid templateKey. Allowed values: dm_agency, software_company, tax_agency" },
        { status: 400 },
      );
    }

    const isDev = process.env.NODE_ENV === "development";
    const isLocal = isLocalhostRequest(request);

    const agentKeyFromHeader = request.headers.get("x-demo-agent-key")?.trim() || null;
    const configuredAgentKey = process.env.DEMO_AGENT_KEY?.trim() || null;
    const hasValidAgentKey =
      Boolean(configuredAgentKey) &&
      Boolean(agentKeyFromHeader) &&
      agentKeyFromHeader === configuredAgentKey;

    if (isDev && !isLocal && !hasValidAgentKey) {
      return NextResponse.json(
        {
          error:
            "Demo provisioning in development is only allowed from localhost unless a valid x-demo-agent-key is provided.",
        },
        { status: 403 },
      );
    }

    if (!isDev) {
      if (!token) {
        return NextResponse.json({ error: "Security challenge failed: No token." }, { status: 400 });
      }

      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return NextResponse.json({ error: "Bot verification failed." }, { status: 403 });
      }
    } else if (!isLocal && !token && !hasValidAgentKey) {
      return NextResponse.json(
        {
          error:
            "Demo provisioning in development requires either a Turnstile token or a valid x-demo-agent-key header.",
        },
        { status: 400 },
      );
    }

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentDemos = await prisma.workspace.count({
      where: {
        createdAt: { gte: fifteenMinsAgo },
        OR: [{ demoTemplateKey: { not: null } }, { name: "BabaBuilds Demo Enterprise" }],
      },
    });

    const configuredThreshold = Number(process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD ?? "10");
    const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 10;

    if (recentDemos > threshold) {
      return NextResponse.json({ error: "High volume. Try in 15 mins." }, { status: 429 });
    }

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

      await seedDemoWorkspace(tx, { userId: user.id, templateKey });

      const demoPassword = uuidv4();
      await tx.verificationToken.create({
        data: {
          identifier: demoEmail,
          token: demoPassword,
          expires: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return { email: demoEmail, password: demoPassword, templateKey };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demo Creation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
