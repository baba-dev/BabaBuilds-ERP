import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { encrypt } from "@/lib/encryption";
import { seedDmAgencyTemplate } from "@/lib/demo/templates/dm-agency";

// --- HELPERS ---

function isLocalhostRequest(request: Request): boolean {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;

  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase() ?? "";
  if (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1")) return true;

  // Best-effort: only trust local development usage; don't rely on x-forwarded-for for security.
  return false;
}

const getDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

// --- MAIN API ROUTE ---

export async function POST(request: Request) {
  try {
    // 1. SAFE JSON PARSING
    const body = await request.json().catch(() => ({}));
    const token = body.token;
    const templateId = typeof body.templateId === "string" ? body.templateId : "dm_agency";

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
    // - non-local: require a valid agent key (Cloud Agents / remote dev)
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
    } else {
      if (!isLocal && !token && !hasValidAgentKey) {
        return NextResponse.json(
          {
            error:
              "Demo provisioning in development requires either a Turnstile token or a valid x-demo-agent-key header.",
          },
          { status: 400 },
        );
      }
    }

    // --- 🚨 SECURITY LAYER 1: GLOBAL CIRCUIT BREAKER ---
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentDemos = await prisma.workspace.count({
      where: {
        name: "BabaBuilds Demo Enterprise",
        createdAt: { gte: fifteenMinsAgo }
      }
    });

    const configuredThreshold = Number(process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD ?? "10");
    const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 10;

    if (recentDemos > threshold) {
      return NextResponse.json({ error: "High volume. Try in 15 mins." }, { status: 429 });
    }

    // --- DATA SEEDING TRANSACTION ---
    const demoId = uuidv4().substring(0, 8);
    const demoEmail = `demo_${demoId}@bababuilds.demo`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. CREATE USER & WORKSPACE
      const user = await tx.user.create({
        data: {
          name: `Demo User ${demoId.toUpperCase()}`,
          email: demoEmail,
          role: "DEMO",
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: "BabaBuilds Demo Enterprise",
          subscriptionStatus: "ACTIVE",
          users: {
            create: { userId: user.id, role: "OWNER" }
          }
        }
      });

      // 2. COMPLETE BUSINESS PROFILE
      await tx.businessProfile.create({
        data: {
          workspaceId: workspace.id,
          companyName: "Nexus Digital Agency",
          proprietorName: "Aditya Sharma",
          address: "Level 4, Tech Park, Koramangala, Bangalore, KA 560034",
          email: "billing@nexusdigital.demo",
          phone: "+91 98765 43210",
          website: "https://nexusdigital.demo",
          panNumber: "ABCDE1234F",
          udyamNumber: "UDYAM-KR-00-1234567",
          gstin: "29ABCDE1234F1Z5",
          bankName: "HDFC Bank Ltd.",
          accountName: "Nexus Digital Agency",
          accountNumber: "50200012345678",
          ifscCode: "HDFC0001234",
          groqApiKey: encrypt("gsk_demo_bypass_key_placeholder"),
        }
      });

      if (templateId !== "dm_agency") {
        throw new Error(`Unsupported demo template: ${templateId}`);
      }

      await seedDmAgencyTemplate({
        tx,
        workspaceId: workspace.id,
        userId: user.id,
      });

      // 4. GENERATE TAX INVESTMENTS
      await tx.investment.createMany({
        data: [
          { workspaceId: workspace.id, date: getDateOffset(-300), category: "80C", assetName: "PPF Account", amount: 150000 },
          { workspaceId: workspace.id, date: getDateOffset(-60), category: "Mutual Funds", assetName: "Index Fund", amount: 75000 },
        ]
      });

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
      return { email: demoEmail, password: demoPassword };
      // --- 🚨 SECURITY PATCH END ---
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demo Creation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
