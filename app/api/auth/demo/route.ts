import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/money";
import { v4 as uuidv4 } from "uuid";
import { encrypt } from "@/lib/encryption";

// --- HELPERS ---

const getDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const getFY = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month < 4) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
};

// --- MAIN API ROUTE ---

export async function POST(request: Request) {
  try {
    // 1. SAFE JSON PARSING
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    // --- 🚨 SECURITY LAYER 0: TURNSTILE VERIFICATION ---
    const isDev = process.env.NODE_ENV === "development";

    // Bypass Turnstile only if on Localhost AND no token is provided
    if (!isDev || token) {
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
    }

    // --- 🚨 SECURITY LAYER 1: GLOBAL CIRCUIT BREAKER ---
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentDemos = await prisma.workspace.count({
      where: {
        name: "BabaBuilds Demo Enterprise",
        createdAt: { gte: fifteenMinsAgo }
      }
    });

    if (recentDemos > 10) {
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

      // 3. EXPANDED CLIENT CRM
      const client1 = await tx.client.create({ data: { workspaceId: workspace.id, name: "Stark Industries (US)", address: "Malibu Point 10880, CA", country: "USA", taxId: "US-EIN-987654", email: "accounts@stark.com", isExport: true } });
      const client2 = await tx.client.create({ data: { workspaceId: workspace.id, name: "Wayne Enterprises", address: "Gotham Tower, NY", country: "USA", email: "finance@wayne.com", isExport: true } });
      const client3 = await tx.client.create({ data: { workspaceId: workspace.id, name: "Reliance Retail", address: "Navi Mumbai, MH", country: "India", taxId: "27RELIANCE1234Z", email: "vendor.payments@ril.com", isExport: false } });
      const client4 = await tx.client.create({ data: { workspaceId: workspace.id, name: "Zomato Ltd", address: "Gurugram, HR", country: "India", taxId: "06ZOMATO8888P1Z1", email: "tech.billing@zomato.com", isExport: false } });
      const client5 = await tx.client.create({ data: { workspaceId: workspace.id, name: "Acme Startups", address: "HSR Layout, Bangalore", country: "India", email: "founder@acmestartups.in", isExport: false } });

      // 4. SEED SERVICE CATALOG
      const servicesData = [
        { workspaceId: workspace.id, name: "Full-Stack Web App Development", defaultPrice: 150000, description: "End-to-end custom Next.js & Node.js application design and deployment." },
        { workspaceId: workspace.id, name: "SEO Audit & Strategy", defaultPrice: 25000, description: "Comprehensive technical SEO audit, keyword mapping, and competitor analysis." },
        { workspaceId: workspace.id, name: "Cloud Infrastructure Setup", defaultPrice: 45000, description: "AWS/GCP scalable architecture design, dockerization, and CI/CD pipelines." },
        { workspaceId: workspace.id, name: "Monthly Maintenance Retainer", defaultPrice: 15000, description: "Priority bug fixes, server monitoring, and minor feature updates." }
      ];
      await tx.serviceTemplate.createMany({ data: servicesData });
      const catalog = await tx.serviceTemplate.findMany({ where: { workspaceId: workspace.id } });

      // 5. SEED QUOTES & PROPOSALS
      const proposalsToCreate = [
        { client: client4, title: "Zomato Next-Gen Fleet Dashboard", status: "ACCEPTED", validDays: -5, qty: 1, srv: catalog[0] },
        { client: client5, title: "Acme Launch SEO Package", status: "SENT", validDays: 10, qty: 1, srv: catalog[1] },
        { client: client2, title: "Gotham Data Center Migration", status: "DRAFT", validDays: 14, qty: 2, srv: catalog[2] },
      ];

      for (let i = 0; i < proposalsToCreate.length; i++) {
        const p = proposalsToCreate[i];
        const unitPrice = decimalToNumber(p.srv.defaultPrice);
        const subtotal = p.qty * unitPrice;
        const tax = p.client.isExport ? 0 : subtotal * 0.18;
        await tx.proposal.create({
          data: {
            workspaceId: workspace.id, clientId: p.client.id, title: p.title,
            proposalNo: `EST-26-00${i + 1}`, validUntil: getDateOffset(p.validDays),
            subtotal: subtotal, estimatedTax: tax, totalAmount: subtotal + tax, status: p.status,
            items: { create: [{ serviceTemplateId: p.srv.id, title: p.srv.name, description: p.srv.description, quantity: p.qty, unitPrice, total: subtotal }] }
          }
        });
      }

      // 6. GENERATE HISTORICAL INVOICES
      const invoicesToCreate: Array<{
        client: typeof client1;
        daysAgo: number;
        amount: number;
        desc: string;
        status: "Paid" | "Pending";
      }> = [
        { client: client1, daysAgo: -180, amount: 45000, desc: "Q3 System Architecture", status: "Paid" },
        { client: client3, daysAgo: -150, amount: 85000, desc: "Frontend Redesign", status: "Paid" },
        { client: client2, daysAgo: -120, amount: 35000, desc: "Security Audit", status: "Paid" },
        { client: client1, daysAgo: -90, amount: 45000, desc: "Q4 Cloud Infrastructure", status: "Paid" },
        { client: client3, daysAgo: -60, amount: 45000, desc: "Performance Tuning", status: "Paid" },
        { client: client2, daysAgo: -45, amount: 35000, desc: "AWS Migration", status: "Paid" },
        { client: client2, daysAgo: -25, amount: 35000, desc: "Security Retainer", status: "Pending" }, 
        { client: client1, daysAgo: -12, amount: 45000, desc: "Cloud Retainer", status: "Pending" },
        { client: client3, daysAgo: -3, amount: 15000, desc: "Maintenance Retainer", status: "Pending" },
      ];

      for (let i = 0; i < invoicesToCreate.length; i++) {
        const inv = invoicesToCreate[i];
        const date = getDateOffset(inv.daysAgo);
        await tx.invoice.create({
          data: {
            workspaceId: workspace.id, clientId: inv.client.id,
            invoiceNumber: `INV-${getFY(date).replace('-','')}-${String(i + 1).padStart(3, '0')}`,
            financialYear: getFY(date), billingMonth: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
            invoiceDate: date, clientName: inv.client.name, sacCode: "998313", serviceDescription: inv.desc,
            totalAmount: inv.amount, status: inv.status, pdfPath: `/demo-invoices/INV-${i+1}.pdf`,
            amountReceived: inv.status === "Paid" ? inv.amount : null,
            dateReceived: inv.status === "Paid" ? getDateOffset(inv.daysAgo + 5) : null,
          }
        });
      }

      // 7. GENERATE EXPENSES 
      await tx.expense.createMany({
        data: [
          { workspaceId: workspace.id, date: getDateOffset(-100), category: "Office & Rent", vendor: "WeWork", amount: 25000, description: "Monthly Desk Rent" },
          { workspaceId: workspace.id, date: getDateOffset(-5), category: "Meals", vendor: "Swiggy", amount: 850, description: "Client Lunch" },
        ]
      });

      // 8. GENERATE TAX INVESTMENTS 
      await tx.investment.createMany({
        data: [
          { workspaceId: workspace.id, date: getDateOffset(-300), category: "80C", assetName: "PPF Account", amount: 150000 },
          { workspaceId: workspace.id, date: getDateOffset(-60), category: "Mutual Funds", assetName: "Index Fund", amount: 75000 },
        ]
      });

      // 9. GENERATE ACTIVE RETAINERS
      await tx.retainer.createMany({
        data: [
          { workspaceId: workspace.id, clientId: client2.id, serviceName: "Security Monitoring", amount: 35000, frequency: "MONTHLY", autoAppendMonth: true, nextBillingDate: getDateOffset(5), status: "ACTIVE", sacCode: "998313" },
          { workspaceId: workspace.id, clientId: client1.id, serviceName: "Cloud Infrastructure", amount: 45000, frequency: "MONTHLY", autoAppendMonth: true, nextBillingDate: getDateOffset(18), status: "ACTIVE", sacCode: "998313" },
          { workspaceId: workspace.id, clientId: client3.id, serviceName: "Maintenance", amount: 15000, frequency: "MONTHLY", autoAppendMonth: true, nextBillingDate: getDateOffset(27), status: "ACTIVE", sacCode: "998313" }
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
