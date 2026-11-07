import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import Razorpay from "razorpay";
import crypto from "crypto";
import { timingSafeEqualString } from "@/lib/security/signature";
import { withPermission } from "@/lib/rbac";

type Provider = "STRIPE" | "RAZORPAY";

function formatStripeMask(method: Stripe.PaymentMethod) {
  if (method.card?.last4) {
    const brand = method.card.brand ? method.card.brand.toUpperCase() : "CARD";
    return `${brand} •••• ${method.card.last4}`;
  }

  if (method.us_bank_account?.last4) {
    return `BANK •••• ${method.us_bank_account.last4}`;
  }

  return method.type.toUpperCase();
}

function formatRazorpayMask(payment: {
  method?: string;
  card?: { network?: string | null; last4?: string | null } | null;
  vpa?: string | null;
}) {
  if (payment.method === "card" && payment.card?.last4) {
    const brand = payment.card.network ? String(payment.card.network).toUpperCase() : "CARD";
    return `${brand} •••• ${payment.card.last4}`;
  }

  if (payment.vpa) {
    return payment.vpa;
  }

  return (payment.method || "PAYMENT_METHOD").toUpperCase();
}

function getPlatformProvider(): Provider | null {
  if ((process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) && process.env.RAZORPAY_KEY_SECRET) return "RAZORPAY";
  if (process.env.STRIPE_SECRET_KEY) return "STRIPE";
  return null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId || !scopedSession.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;
    const permission = await withPermission(
      scopedSession.user.id,
      workspaceId,
      "billing.manage",
    );
    if (!permission.granted) return permission.response;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { paymentMethodMask: true, billingProviderId: true },
    });

    const provider = getPlatformProvider();

    return NextResponse.json({
      paymentMethodMask: workspace?.paymentMethodMask || null,
      providerCustomerId: workspace?.billingProviderId || null,
      provider,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch payment method." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId || !scopedSession.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;
    const permission = await withPermission(
      scopedSession.user.id,
      workspaceId,
      "billing.manage",
    );
    if (!permission.granted) return permission.response;

    const [workspace, profile] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, paymentMethodMask: true, billingProviderId: true },
      }),
      prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: { companyName: true },
      }),
    ]);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (workspace.paymentMethodMask) {
      return NextResponse.json({ ok: true, message: "Payment method already on file.", confirmed: true });
    }

    const provider = getPlatformProvider();
    if (!provider) {
      return NextResponse.json(
        {
          error: "No payment provider is configured on the platform.",
          code: "PROVIDER_NOT_CONFIGURED",
        },
        { status: 500 },
      );
    }

    if (provider === "STRIPE") {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return NextResponse.json({ error: "Stripe is not fully configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 500 });
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
      const customerId = workspace.billingProviderId?.startsWith("cus_")
        ? workspace.billingProviderId
        : (
            await stripe.customers.create({
              name: profile?.companyName || undefined,
              metadata: { workspaceId },
            })
          ).id;

      if (workspace.billingProviderId !== customerId) {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { billingProviderId: customerId },
        });
      }

      const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://erp.bababuilds.com";
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        success_url: `${origin}/settings/billing?pm_setup=stripe_success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/settings/billing?pm_setup=stripe_cancelled`,
        metadata: { workspaceId, flow: "payment_method_setup" },
      });

      return NextResponse.json({
        ok: true,
        provider,
        confirmed: false,
        clientAction: {
          type: "REDIRECT",
          url: checkoutSession.url,
          checkoutSessionId: checkoutSession.id,
        },
      });
    }

    if (provider === "RAZORPAY") {
      const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!razorpayKeyId || !razorpayKeySecret) {
        return NextResponse.json({ error: "Razorpay is not fully configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 500 });
      }

      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
      });

      const order = await razorpay.orders.create({
        amount: 100,
        currency: "INR",
        receipt: `pm_setup_${workspaceId}_${Date.now()}`,
        notes: {
          workspaceId,
          flow: "payment_method_setup",
        },
      });

      return NextResponse.json({
        ok: true,
        provider,
        confirmed: false,
        clientAction: {
          type: "RAZORPAY_CHECKOUT",
          keyId: razorpayKeyId,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          name: profile?.companyName || "BabaBuilds ERP",
          description: "Setup payment method",
        },
      });
    }
  } catch {
    return NextResponse.json({ error: "Unable to add payment method." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId || !scopedSession.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;
    const permission = await withPermission(
      scopedSession.user.id,
      workspaceId,
      "billing.manage",
    );
    if (!permission.granted) return permission.response;
    const body = await req.json().catch(() => ({}));
    const provider = body?.provider as Provider | undefined;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, billingProviderId: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (provider === "STRIPE") {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return NextResponse.json({ error: "Stripe is not configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 500 });
      }

      const checkoutSessionId = body?.checkoutSessionId as string | undefined;
      if (!checkoutSessionId) {
        return NextResponse.json({ error: "Missing Stripe checkout session ID.", code: "INVALID_REQUEST" }, { status: 400 });
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
      const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
        expand: ["setup_intent", "setup_intent.payment_method"],
      });

      const setupIntent = checkoutSession.setup_intent as Stripe.SetupIntent | null;
      const paymentMethod = setupIntent?.payment_method;
      const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;

      if (!checkoutSession || checkoutSession.mode !== "setup" || checkoutSession.status !== "complete") {
        return NextResponse.json({ error: "Stripe setup is not complete yet.", code: "ATTACHMENT_PENDING" }, { status: 409 });
      }

      if (!setupIntent || setupIntent.status !== "succeeded") {
        return NextResponse.json({ error: "Stripe setup intent not confirmed.", code: "ATTACHMENT_FAILED" }, { status: 409 });
      }

      if (!paymentMethod || typeof paymentMethod === "string") {
        return NextResponse.json({ error: "Stripe payment method is missing.", code: "ATTACHMENT_FAILED" }, { status: 409 });
      }

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          billingProviderId: customerId || workspace.billingProviderId || null,
          paymentMethodMask: formatStripeMask(paymentMethod),
        },
      });

      return NextResponse.json({ ok: true, confirmed: true });
    }

    if (provider === "RAZORPAY") {
      const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!razorpayKeySecret) {
        return NextResponse.json({ error: "Razorpay is not configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 500 });
      }

      const razorpayPaymentId = body?.razorpay_payment_id as string | undefined;
      const razorpayOrderId = body?.razorpay_order_id as string | undefined;
      const razorpaySignature = body?.razorpay_signature as string | undefined;

      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        return NextResponse.json({ error: "Missing Razorpay confirmation payload.", code: "INVALID_REQUEST" }, { status: 400 });
      }

      const generatedSignature = crypto
        .createHmac("sha256", razorpayKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      if (!timingSafeEqualString(generatedSignature, razorpaySignature)) {
        return NextResponse.json({ error: "Invalid Razorpay signature.", code: "ATTACHMENT_FAILED" }, { status: 400 });
      }

      const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
      if (!razorpayKeyId) {
        return NextResponse.json({ error: "Razorpay is not configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 500 });
      }

      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
      });

      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      if (!payment || !["authorized", "captured"].includes(String(payment.status))) {
        return NextResponse.json({ error: "Razorpay payment is not confirmed.", code: "ATTACHMENT_PENDING" }, { status: 409 });
      }

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          billingProviderId: String(payment.customer_id || workspace.billingProviderId || razorpayPaymentId),
          paymentMethodMask: formatRazorpayMask(payment),
        },
      });

      return NextResponse.json({ ok: true, confirmed: true });
    }

    return NextResponse.json({ error: "Unknown provider callback.", code: "INVALID_REQUEST" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to attach payment method.", code: "ATTACHMENT_FAILED" }, { status: 500 });
  }
}
