import { NextResponse } from "next/server";
import { LeadStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { verifyTurnstileToken } from "@/lib/turnstile";

type QueryPayload = {
  fullName?: string;
  email?: string;
  company?: string;
  phone?: string;
  website?: string;
  monthlyClientLeads?: number;
  message?: string;
  budgetBand?: string;
  turnstileToken?: string;
  honeypot?: string;
};

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return xf?.split(",")[0]?.trim() || "unknown";
}

function normalizeText(input: unknown, maxLen: number) {
  const value = typeof input === "string" ? input.trim() : "";
  return value.slice(0, maxLen);
}

function normalizeEmail(input: unknown) {
  const value = normalizeText(input, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const limited = checkRateLimit(`reseller-query:${ip}`, 10, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly.", retryAfterMs: limited.retryAfterMs },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as QueryPayload;
    if (normalizeText(body.honeypot, 20)) {
      return NextResponse.json({ error: "Request blocked." }, { status: 400 });
    }

    const token = normalizeText(body.turnstileToken, 4000);
    const verified = await verifyTurnstileToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Bot verification failed." }, { status: 403 });
    }

    const fullName = normalizeText(body.fullName, 120);
    const email = normalizeEmail(body.email);
    const message = normalizeText(body.message, 2000);
    if (!fullName || !email || !message) {
      return NextResponse.json(
        { error: "fullName, valid email, and message are required." },
        { status: 400 },
      );
    }

    const monthlyClientLeadsRaw =
      typeof body.monthlyClientLeads === "number" ? Math.floor(body.monthlyClientLeads) : null;

    const query = await prisma.resellerPublicQuery.create({
      data: {
        fullName,
        email,
        company: normalizeText(body.company, 120) || null,
        phone: normalizeText(body.phone, 40) || null,
        website: normalizeText(body.website, 160) || null,
        monthlyClientLeads:
          monthlyClientLeadsRaw != null && monthlyClientLeadsRaw >= 0 ? monthlyClientLeadsRaw : null,
        message,
        budgetBand: normalizeText(body.budgetBand, 40) || null,
        status: LeadStage.LEAD,
        metadata: {
          ip,
          userAgent: req.headers.get("user-agent") ?? null,
        },
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json(
      {
        id: query.id,
        createdAt: query.createdAt,
        message: "Query submitted. Our reseller team will contact you shortly.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/reseller/query error", error);
    return NextResponse.json({ error: "Failed to submit query" }, { status: 500 });
  }
}
