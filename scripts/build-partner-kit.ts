import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

type PartnerKitDoc = {
  filename: string;
  title: string;
  subtitle: string;
  sections: Array<{ heading: string; bullets: string[] }>;
};

const partnerKitDocs: PartnerKitDoc[] = [
  {
    filename: "sales-deck.pdf",
    title: "BabaBuilds ERP Partner Deck",
    subtitle: "Concise positioning for reseller conversations",
    sections: [
      {
        heading: "Why BabaBuilds ERP",
        bullets: [
          "Unified invoicing, collections, compliance workflow, and operations dashboard.",
          "Strong fit for agencies, CA firms, freelancers, contractors, and SMB service teams.",
          "Fast onboarding with role-aware landing pages and demo environments.",
        ],
      },
      {
        heading: "Core value props",
        bullets: [
          "Tax-ready invoicing with country-aware setup defaults.",
          "Recurring billing, proposal-to-invoice workflows, and AR collection tooling.",
          "Partner-friendly discount and commission attribution.",
        ],
      },
    ],
  },
  {
    filename: "pricing-sheet.pdf",
    title: "Partner Pricing Sheet",
    subtitle: "Public plan anchors and partner talking points",
    sections: [
      {
        heading: "Plans",
        bullets: [
          "Pro: operational stack for solo operators and growing teams.",
          "Team: expanded seats, shared workflows, and deeper controls.",
          "15-day trial entrypoint with plan-aware signup.",
        ],
      },
      {
        heading: "Partner framing",
        bullets: [
          "Use business outcomes: faster invoicing, better collections, cleaner month-end close.",
          "Highlight guided flows for win-client, retainer billing, overdue recovery, and month-end tax pack prep.",
          "Position tax scope honestly: workflow readiness, not guaranteed automated filing.",
        ],
      },
    ],
  },
  {
    filename: "whatsapp-script.pdf",
    title: "WhatsApp Partner Script",
    subtitle: "Short outbound script for first outreach",
    sections: [
      {
        heading: "Message template",
        bullets: [
          "Hi {{name}}, we help businesses run invoicing + collections + compliance workflows from one ERP workspace.",
          "You can start a 15-day Pro trial mapped to your business type and test guided money flows immediately.",
          "Want a 15-minute walkthrough for your use case this week?",
        ],
      },
      {
        heading: "Follow-up prompts",
        bullets: [
          "Current tools used for invoices and tax workflow?",
          "Biggest issue: overdue payments, recurring billing, or month-end close?",
          "Preferred timezone for a live demo?",
        ],
      },
    ],
  },
  {
    filename: "objection-sheet.pdf",
    title: "Objection Handling Sheet",
    subtitle: "Common reseller objections and response patterns",
    sections: [
      {
        heading: "Objections",
        bullets: [
          "We already use spreadsheets + accounting software.",
          "Migration risk is high for active billing teams.",
          "Tax automation claims sound risky.",
        ],
      },
      {
        heading: "Response",
        bullets: [
          "BabaBuilds complements accounting by adding operational billing + collections workflows.",
          "Start with one guided flow and one active client to de-risk adoption.",
          "Position as tax-ready invoicing + compliance workflow unless country-pack verification is confirmed.",
        ],
      },
    ],
  },
  {
    filename: "onboarding-checklist.pdf",
    title: "Partner Onboarding Checklist",
    subtitle: "Enablement runbook for new partners",
    sections: [
      {
        heading: "Week 1 enablement",
        bullets: [
          "Review product positioning and scope guardrails.",
          "Run persona demos: CA, Agency, Freelancer, Contractor.",
          "Practice one discovery-to-demo call using the WhatsApp script.",
        ],
      },
      {
        heading: "Execution checklist",
        bullets: [
          "Publish trial link with plan + cycle + persona parameters.",
          "Track demo-to-real conversion with guided CTA after three actions.",
          "Share partner kit links after every discovery call.",
        ],
      },
    ],
  },
];

async function createDoc(doc: PartnerKitDoc, outputDir: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  let y = 748;
  page.drawText(doc.title, { x: 48, y, size: 20, font: bold });
  y -= 24;
  page.drawText(doc.subtitle, { x: 48, y, size: 11, font: regular });
  y -= 30;

  for (const section of doc.sections) {
    page.drawText(section.heading, { x: 48, y, size: 13, font: bold });
    y -= 18;
    for (const bullet of section.bullets) {
      page.drawText(`- ${bullet}`, { x: 56, y, size: 10, font: regular, maxWidth: 500 });
      y -= 16;
      if (y < 72) break;
    }
    y -= 8;
    if (y < 72) break;
  }

  const bytes = await pdf.save();
  const outputPath = path.join(outputDir, doc.filename);
  fs.writeFileSync(outputPath, bytes);
  console.info(`Wrote ${outputPath}`);
}

async function run() {
  const outputDir = path.join(process.cwd(), "public", "partner-kit");
  fs.mkdirSync(outputDir, { recursive: true });
  for (const doc of partnerKitDocs) {
    await createDoc(doc, outputDir);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
