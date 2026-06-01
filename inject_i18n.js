const fs = require('fs');
const path = require('path');

const locales = ['ar.json', 'en-IN.json', 'es.json', 'hi.json'];
const dir = path.join(__dirname, 'messages');

const landingV3Translations = {
  "Hero": {
    "badge": "Meet the new BabaBuilds ERP",
    "headline1": "Run your business,",
    "headlineHighlight": "beautifully.",
    "subtitle": "Proposals, invoicing, automated AR, bank reconciliation, tax, and payroll—all in one vibrant, lightning-fast platform designed to help you grow.",
    "ctaFree": "Sign Up for Free",
    "ctaPro": "Start Pro Trial",
    "dashboardPreview": "Dashboard Preview Area"
  },
  "InteractiveDemo": {
    "title1": "Effortless Invoicing.",
    "title2": "Automated Reminders.",
    "subtitle": "Create an invoice and let our automated engine chase payments for you. Try it out below.",
    "createInvoice": "Create Invoice",
    "resetDemo": "Reset Demo",
    "clientName": "Client Name",
    "amount": "Amount (USD)",
    "autoReminders": "Auto-Reminders",
    "autoRemindersDesc": "Follow up before & after due date",
    "generateLink": "Generate Link",
    "generating": "Building your smart invoice...",
    "done": "Done!",
    "magicText": "Fill out the details and click Generate to see the magic.",
    "linkReady": "Link Ready to Share!",
    "scheduledReminders": "Scheduled Reminders",
    "reminder1": "3 days before due date",
    "reminder2": "On due date",
    "reminder3": "5 days overdue",
    "pending": "Pending"
  },
  "Features": {
    "title1": "Everything you need.",
    "title2": "Nothing you don't.",
    "subtitle": "Enable the modules you need today. Add more as your business grows.",
    "items": {
      "invoicing": {
        "title": "Proposals & Invoicing",
        "shortDesc": "E-signatures, recurring invoices, and custom branding.",
        "details": "Send professional proposals that convert. Collect e-signatures instantly, and automatically generate invoices from approved proposals. Set up recurring billing schedules to keep your cash flowing without manual intervention."
      },
      "reminders": {
        "title": "AR Collections",
        "shortDesc": "Automated reminders to get paid faster.",
        "details": "Never chase a client for payment again. Our smart AR system sends polite, automated email and SMS reminders before, on, and after the due date, increasing your on-time payment rate by up to 40%."
      },
      "expenses": {
        "title": "Expenses & Cash Flow",
        "shortDesc": "Track spending in real-time.",
        "details": "Log expenses on the go, snap receipts, and categorize spending automatically. Keep a real-time pulse on your cash flow with visual dashboards that predict future runway based on your scheduled receivables and payables."
      },
      "bank": {
        "title": "Bank Reconciliation",
        "shortDesc": "AI-powered bank matching.",
        "details": "Connect your bank feeds or upload statements. Our AI engine automatically matches deposits to open invoices and withdrawals to logged expenses, saving you hours of tedious manual data entry every month."
      },
      "tax": {
        "title": "Tax & CA Portal",
        "shortDesc": "CA-ready exports and tax engine.",
        "details": "Built-in tax compliance. Automatically calculate VAT, GST, or Sales Tax based on your region. Invite your Chartered Accountant to a dedicated portal where they can export ledgers and trial balances without needing full account access."
      },
      "payroll": {
        "title": "Workforce & Payroll",
        "shortDesc": "Manage employees and run payroll.",
        "details": "A complete HRIS module. Track employee attendance, manage leave requests, and run payroll with automated tax deductions and payslip generation. Keep your entire workforce organized in one place."
      },
      "inventory": {
        "title": "Inventory Management",
        "shortDesc": "Real-time stock tracking.",
        "details": "Track product quantities across multiple warehouses. Set low-stock alerts, manage supplier purchase orders, and automatically deduct stock when an invoice is paid. Perfect for modern retail and e-commerce."
      },
      "retainers": {
        "title": "Retainers",
        "shortDesc": "Manage ongoing agreements.",
        "details": "Easily handle clients on monthly retainers. Track hours worked against the retainer budget and automatically roll over unused hours or bill for overages in the next billing cycle."
      },
      "crm": {
        "title": "Client CRM",
        "shortDesc": "Track client interactions.",
        "details": "A lightweight, powerful CRM built into your billing software. Track email threads, log call notes, and provide your clients with a self-serve portal where they can view past invoices and update payment methods."
      },
      "docs": {
        "title": "Document Management",
        "shortDesc": "Secure file storage.",
        "details": "Store contracts, identity documents, and project briefs securely. Attach documents directly to client profiles or specific invoices for a fully paperless back office."
      },
      "reporting": {
        "title": "Reporting & Analytics",
        "shortDesc": "Comprehensive data visualization.",
        "details": "Generate beautiful, investor-ready reports with one click. From P&L statements to AR aging reports, get the insights you need to make data-driven decisions for your business."
      },
      "partner": {
        "title": "Partner Ecosystem",
        "shortDesc": "Manage referrals easily.",
        "details": "Turn your best clients into advocates. Our built-in partner ecosystem allows you to track referrals, manage commission payouts, and grow your business through word-of-mouth."
      }
    }
  },
  "Pricing": {
    "title": "Simple, transparent pricing",
    "subtitle": "Start for free, upgrade when you need superpowers. No hidden fees. Cancel anytime.",
    "monthly": "Monthly",
    "annually": "Annually",
    "bestValue": "2 Months Free",
    "mostPopular": "Most Popular",
    "perMo": "/ mo",
    "perYr": "/ yr",
    "free": {
      "name": "Free Forever",
      "description": "Perfect for freelancers just starting out.",
      "cta": "Sign Up for Free",
      "features": ["Up to 3 active clients", "5 invoices per month", "Basic templates", "Community support"]
    },
    "pro": {
      "name": "Pro",
      "description": "Everything you need to automate your growing business.",
      "cta": "Start Pro Trial",
      "features": ["Unlimited clients & invoices", "Automated payment reminders", "Bank reconciliation", "Tax & CA Portal", "Priority email support"]
    },
    "team": {
      "name": "Team",
      "description": "For agencies and teams needing advanced controls.",
      "cta": "Start Team Trial",
      "features": ["Everything in Pro", "Role-based access control", "Multiple team members", "Inventory & Payroll", "Dedicated onboarding"]
    }
  },
  "FinalCTA": {
    "title": "Ready to streamline your business?",
    "subtitle": "Join thousands of businesses that trust BabaBuilds ERP to manage their proposals, invoices, and cash flow.",
    "ctaFree": "Sign Up for Free",
    "ctaPro": "Start Pro Trial"
  }
};

for (const locale of locales) {
  const filePath = path.join(dir, locale);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data["LandingV3"] = landingV3Translations;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${locale}`);
  }
}
