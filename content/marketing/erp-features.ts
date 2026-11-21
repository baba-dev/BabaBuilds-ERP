import { optionalErpFeatures } from "./optional-erp-features";

type TitledText = { title: string; text: string };

export type ErpFeature = {
  slug: string;
  name: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  problem: TitledText;
  solution: TitledText;
  steps: [TitledText, TitledText, TitledText];
  example: TitledText;
  faqs: TitledText[];
  image: { file: string; alt: string };
  guide: string;
  guideLabel?: string;
  related: string[];
};

export const coreErpFeatures: readonly ErpFeature[] = [
  {
    slug: "gst-invoicing",
    name: "GST invoicing",
    title: "GST Invoicing Software for Small Businesses",
    description: "Create GST invoices, send PDFs, and collect payments through a connected gateway with BabaBuilds ERP. See how to check tax details before sending.",
    headline: "GST invoicing software that takes you from draft to payment",
    intro: "Create a GST invoice, send your client a PDF, and track what they owe in one workspace. BabaBuilds ERP gives freelancers and small businesses a repeatable way to bill clients without rebuilding the invoice each month.",
    problem: {
      title: "Every copied invoice gives old details a chance to slip through",
      text: "A spreadsheet template can produce a PDF, but a previous client’s GSTIN, bank details, or tax treatment can carry over into the next invoice. Once the PDF goes out, you still need a reliable way to see which invoices were sent and which payments came in.",
    },
    solution: {
      title: "Create, send, and track invoices in BabaBuilds ERP",
      text: "Select a client, add the work you billed for, and review the applicable tax and net payable amount. The ERP assigns an invoice number and saves the PDF in invoice history, where you can download or resend it.",
    },
    steps: [
      { title: "Set up the billing details", text: "Complete your business profile and confirm the customer’s billing details. Add a clear description and price for each service or item." },
      { title: "Check tax before generating", text: "Verify the relevant GSTINs, place of supply, applicable rate, and tax split before generating the PDF. Check the due date and remittance instructions at the same time." },
      { title: "Give the client a way to pay", text: "Send the PDF through your configured email setup or share it yourself. An active Stripe or Razorpay integration can add a clickable payment link." },
    ],
    example: {
      title: "Example · Bill a completed design project",
      text: "A studio bills an Indian client after final delivery. The owner checks the client’s billing state and GSTIN, generates the invoice, and sends the PDF. When the client pays by bank transfer, the finance team can match the deposit against the invoice.",
    },
    faqs: [
      { title: "Can I use BabaBuilds ERP to send invoices with payment links?", text: "Yes. With payment links enabled on your plan, connect and configure a supported gateway such as Stripe or Razorpay. The generated invoice PDF can then include a clickable payment link." },
      { title: "Can I resend an invoice without issuing a new number?", text: "Yes. Use the saved invoice in invoice history to download or resend the PDF. This keeps the original invoice number with the same transaction." },
      { title: "Does generating a GST invoice file my GST return?", text: "Generating an invoice creates a billing record. GST return preparation and submission are separate steps. Review your filing requirements with your accountant." },
    ],
    image: { file: "invoice_new", alt: "New invoice form with client details, service line items, tax settings, and invoice totals" },
    guide: "generating-invoices",
    related: ["invoice-designs", "bank-reconciliation", "proposal-management"],
  },
  {
    slug: "invoice-designs",
    name: "Invoice designs",
    title: "Invoice Designs for India: GST, TDS, UPI QR and Brand Colour",
    description: "Choose from eight invoice designs with GST, TDS and net payable, a scan-to-pay UPI QR, PAID stamps and your brand colour. Compare them all on your own invoice.",
    headline: "Invoice designs that help you get paid, not just look good",
    intro: "An invoice is the document every client reads. BabaBuilds ERP gives you eight designs built around real invoicing problems: GST-ready tax invoices, scan-to-pay layouts, statements and 80mm receipts, all in your brand colour.",
    problem: {
      title: "A good-looking invoice still leaves the hard questions to your client",
      text: "A template rarely shows what your client will actually transfer after TDS, makes them type your bank details instead of scanning a QR, or says nothing about what is still unpaid. Each gap means a call, a reminder or a late payment.",
    },
    solution: {
      title: "Pick a design for the job, and let the invoice do the explaining",
      text: "Choose from eight designs, set your brand colour once with optional overrides per client or invoice, show TDS with a net payable amount, and add a UPI QR. A compare page shows your latest invoice in every design before you commit.",
    },
    steps: [
      { title: "Compare the designs", text: "Open Settings → Invoicing and select Compare all designs. Your latest invoice appears in all eight designs, and you can open any of them full screen." },
      { title: "Set your colour and payment details", text: "Pick an accent colour, add your UPI ID in Settings → Bank account, and set TDS on clients who deduct it." },
      { title: "Generate and send", text: "Create the invoice as usual. The PDF shows the net payable amount, a scan-to-pay QR where the design has one, and a PAID stamp once the client has paid." },
    ],
    example: {
      title: "Example · Invoice a client who deducts TDS",
      text: "A consultant bills ₹1,00,000 plus 18% GST to a company that deducts 10% TDS. The invoice shows the ₹10,000 deduction and a net payable of ₹1,08,000, and the Pay-Fast QR and payment link ask for that net amount, so the client pays the right figure the first time.",
    },
    faqs: [
      { title: "How many invoice designs are there?", text: "Eight: Classic, Modern agency, Tax invoice (GST), Pay-Fast, Itemised project, Statement, Minimal Pro and an 80mm Receipt." },
      { title: "Can I preview a design before I switch?", text: "Yes. The compare page shows your latest invoice, or a labelled sample if you have none, in every design. Previews never send anything or create a payment link." },
      { title: "Can each client have their own invoice colour?", text: "Yes. Set a workspace colour, then override it for a client or a single invoice. Colours that are too light to read on paper are flagged." },
      { title: "How does TDS affect the amount my client pays?", text: "TDS is shown on the amount before GST. The invoice shows the deduction and the net payable amount, and payment links and QR codes collect the net amount." },
      { title: "Does it work with Paytm and Google Pay QR codes?", text: "Add your UPI ID to get a QR with the exact amount, or upload up to three static QR images from Paytm, Google Pay, PhonePe or your bank." },
    ],
    image: { file: "invoice_designs", alt: "Compare designs page showing the same invoice in several designs with accent colour and TDS controls" },
    guide: "invoice-designs",
    guideLabel: "Read the invoice designs guide",
    related: ["gst-invoicing", "recurring-invoicing"],
  },
  {
    slug: "proposal-management",
    name: "Quotes & proposals",
    title: "Proposal Software With E-Signatures and Invoicing",
    description: "Create client quotes, collect electronic signatures, and turn accepted proposals into invoices in BabaBuilds ERP.",
    headline: "Proposal software that turns a signed quote into an invoice",
    intro: "Build a quote, share a proposal link for approval, and carry the agreed scope and pricing into billing. BabaBuilds ERP connects proposals and invoices so service teams can move from client approval to billing without retyping the deal.",
    problem: {
      title: "A client said yes. Which version did they approve?",
      text: "When scope lives in a PDF, approval lives in email, and billing lives in a different tool, finance has to reconstruct what was agreed. A revised price or an optional line item can easily make it onto the wrong invoice.",
    },
    solution: {
      title: "Keep the quote, acceptance, and invoice connected",
      text: "Create a proposal from your service catalog or add custom lines, set a validity period, and send a digital link. The client can review and sign from the proposal page. After approval, turn the selected lines into a numbered invoice you can share with the client.",
    },
    steps: [
      { title: "Define what the price covers", text: "Use named deliverables, quantities where helpful, and an expiry date. Write down assumptions such as who supplies materials or how many revisions are included." },
      { title: "Share the proposal for approval", text: "Send the client the review link and check the proposal status before following up. A clear expiration date gives both sides a reason to revisit stale pricing." },
      { title: "Convert the accepted quote", text: "Before converting, check the billing date, accepted line items, and payment terms. Then generate the invoice and share the PDF with the client." },
    ],
    example: {
      title: "Example · Quote a website redesign",
      text: "An agency sends a proposal for discovery, design, and development. The client signs through the proposal link. The agency checks the accepted line items, converts the proposal into an invoice, and shares the resulting PDF with the client.",
    },
    faqs: [
      { title: "Can clients sign a proposal online?", text: "Yes. Clients can review and sign a proposal through its shared link." },
      { title: "Does an accepted proposal immediately send an invoice?", text: "Your team triggers the conversion after acceptance. It creates a numbered invoice and PDF for you to share." },
      { title: "How long should a quote stay valid?", text: "Base the expiry on how long you can hold your pricing and availability. If supplier costs or staffing are uncertain, use a shorter validity period and state the date explicitly." },
    ],
    image: { file: "proposals", alt: "BabaBuilds ERP Quotes and Proposals workspace showing proposal statuses" },
    guide: "quotes-and-proposals-operations",
    related: ["gst-invoicing", "recurring-invoicing"],
  },
  {
    slug: "bank-reconciliation",
    name: "Bank reconciliation",
    title: "Bank Reconciliation Software for Small Businesses",
    description: "Import bank statements, review suggested matches to invoices and expenses, and investigate unmatched transactions with BabaBuilds ERP.",
    headline: "Bank reconciliation software to match payments with confidence",
    intro: "When the bank shows a deposit and your invoice still says unpaid, you need to know what the money was for. Import bank activity into BabaBuilds ERP, review suggested matches, and resolve the entries that need a closer look.",
    problem: {
      title: "The amount matches. The customer might not.",
      text: "Statements often give you a short reference and a posting date. Two customers might pay the same amount, or a gateway might combine several payments into one settlement. A wrong match can hide an overdue invoice and put the wrong balance in front of your accountant.",
    },
    solution: {
      title: "Work through suggested matches and exceptions in one place",
      text: "BabaBuilds ERP suggests matches between imported transactions and open invoices or recorded expenses. Review the evidence before confirming each match and investigate entries where the references or amounts don’t line up.",
    },
    steps: [
      { title: "Import the statement", text: "Choose the right account and statement period. Use a supported export such as CSV or OFX, and check that the dates and amounts look right after import." },
      { title: "Review the suggested matches", text: "Compare the amount, transaction date, payer name, and reference where available. An invoice number in a transfer reference makes a match easier to verify." },
      { title: "Resolve the exceptions", text: "Check whether a mismatch comes from a partial payment, a fee, or a grouped payout. Keep unclear transactions open while you look up the supporting records." },
    ],
    example: {
      title: "Example · Identify two identical deposits",
      text: "Two clients each owe ₹25,000 and pay on the same day. One transfer includes an invoice number. The other has an abbreviated sender name. Confirm the first against its reference, then check the second against the payer details before closing either balance.",
    },
    faqs: [
      { title: "What bank statement formats does BabaBuilds ERP support?", text: "The reconciliation workflow supports CSV and OFX imports. Check the import screen for the mapping options available for your bank’s export." },
      { title: "Do suggested matches change invoice balances automatically?", text: "Suggestions give you a match to review. Confirm a match only after checking the relevant invoice or expense and transaction details." },
      { title: "How often should a small business reconcile bank transactions?", text: "Weekly is a practical starting point. Increase the frequency if you handle many payments, and clear outstanding exceptions as part of the month-end close." },
    ],
    image: { file: "reconciliation", alt: "Bank reconciliation workspace for imported activity and payment matching" },
    guide: "ai-reconciliation-operations",
    related: ["gst-invoicing", "expense-management"],
  },
  {
    slug: "expense-management",
    name: "Expense management",
    title: "Business Expense Management and Receipt Tracking",
    description: "Track business expenses by category, attach receipts, and build a record your accountant can review in BabaBuilds ERP.",
    headline: "Expense management software that keeps receipts with the spend",
    intro: "Record business expenses, attach supporting documents, and see where money went in BabaBuilds ERP. Capture each expense while the details are fresh so month-end review takes less digging through inboxes and chats.",
    problem: {
      title: "A bank debit tells you what you paid. The receipt tells you why.",
      text: "A merchant name and an amount may be enough to recognise a purchase today. By month-end, your accountant may also need its business purpose, category, or supplier invoice. The longer you wait, the harder those details are to recover.",
    },
    solution: {
      title: "Keep the category and supporting document on the expense record",
      text: "Log the spend in BabaBuilds ERP, assign a reporting category, and attach the receipt or supplier invoice. The expense list gives your team a place to review what was recorded and find the underlying evidence.",
    },
    steps: [
      { title: "Record the purchase", text: "Capture the vendor, date, amount, and business purpose while the purchase is fresh. Use a note when the merchant name alone is unclear." },
      { title: "Categorise and attach proof", text: "Use consistent categories such as software, travel, or office supplies. Attach the document that explains the charge, especially when the statement reference is vague." },
      { title: "Review before sharing your records", text: "Check uncategorised expenses, missing documents, or charges that might have been entered twice. Compare what you recorded with the bank statement before handing it off." },
    ],
    example: {
      title: "Example · Explain a cloud services charge",
      text: "A card statement shows a generic payment processor label for a hosting renewal. The team records the expense under software, attaches the vendor invoice, and notes which project the subscription supports. The accountant can review the charge without asking the project team to identify it again.",
    },
    faqs: [
      { title: "Can I attach a receipt or supplier invoice to an expense?", text: "Yes. Upload the receipt or invoice on the expense record so the evidence stays with the amount and category." },
      { title: "What should I check before sharing expenses with my accountant?", text: "Check that amounts and dates agree with your records, categories are consistent, and each material expense has supporting evidence. Ask your accountant to review anything with unclear tax treatment." },
      { title: "Does an expense category determine whether it is tax deductible?", text: "A category organises your records. Deductibility depends on local rules, the business purpose, and supporting evidence." },
    ],
    image: { file: "expenses", alt: "Expenses workspace with spending totals and categorised expense records" },
    guide: "expenses-and-tax",
    related: ["bank-reconciliation", "inventory-management"],
  },
  {
    slug: "inventory-management",
    name: "Inventory management",
    title: "Inventory Management Software for Small Businesses",
    description: "Track stock by SKU, review low-stock items, and manage purchase orders and receiving with BabaBuilds ERP.",
    headline: "Inventory management software for fewer stock surprises",
    intro: "See what’s on hand, what needs reordering, and what’s already on order. BabaBuilds ERP gives small businesses one place to review stock levels, log adjustments, and track incoming purchases.",
    problem: {
      title: "The stock sheet says twelve. The shelf says three.",
      text: "A static stock count goes stale when receipts, damage, and adjustments get recorded in different places. That leaves the buying team guessing whether to reorder and the sales team unsure what it can promise.",
    },
    solution: {
      title: "Track quantities, stock movements, and purchase orders together",
      text: "Maintain inventory items by SKU, set minimum stock thresholds, and record adjustments with their reasons. Link inventory items to purchase orders so you can check what is due and update quantities when goods arrive.",
    },
    steps: [
      { title: "Give every item a reliable identifier", text: "Use a distinct SKU for each item or variant. Count what is physically available before entering opening quantities." },
      { title: "Set a reorder threshold", text: "Base your minimum on expected usage during supplier lead time, with some buffer for delays or demand spikes. Review low-stock items alongside open purchase orders." },
      { title: "Record what actually arrived", text: "Check the delivered quantity against the purchase order before receiving goods. Log damage or counting differences so the history explains changes in stock." },
    ],
    example: {
      title: "Example · Reorder a fast-moving item",
      text: "A shop sells 10 units a week and its supplier takes about two weeks to deliver. It sets a minimum of 25 units, including a buffer of five. When stock reaches 22, the buyer checks open purchase orders before deciding whether to replenish.",
    },
    faqs: [
      { title: "Can I set different low-stock thresholds for different items?", text: "Yes. Set a minimum stock threshold on each item so fast sellers and long-lead-time products can have different reorder points." },
      { title: "Can I track stock that is on order?", text: "Yes. Link items to purchase orders and review incoming quantities. Record receipts against the actual quantities received." },
      { title: "How do I handle damaged stock or a count mismatch?", text: "Check recent sales and receipts first, then log a stock adjustment for the confirmed difference and record the reason." },
    ],
    image: { file: "inventory", alt: "Inventory Hub showing stock levels, stock movement, and procurement tools" },
    guide: "inventory-hub-operations",
    related: ["expense-management", "gst-invoicing"],
  },
  {
    slug: "recurring-invoicing",
    name: "Recurring invoicing",
    title: "Recurring Invoicing Software for Agency Retainers",
    description: "Set retainer billing schedules, issue recurring invoices, and track renewals and monthly recurring revenue in BabaBuilds ERP.",
    headline: "Recurring invoicing software for client retainers",
    intro: "Keep monthly and quarterly client billing on schedule. BabaBuilds ERP tracks each retainer’s terms, generates invoices on the billing schedule, and surfaces upcoming renewals so your team can review scope and pricing in time.",
    problem: {
      title: "A missed billing date can push payment into next month",
      text: "Recurring work is easy to deliver on time and bill late when each agreement lives in a separate document. One client pays monthly, another pays quarterly, and a third has just changed scope. A calendar reminder alone can’t tell you what to put on the invoice.",
    },
    solution: {
      title: "Give each recurring agreement a billing schedule",
      text: "Link a retainer to the client, enter its deliverables and billing cadence, and record the contract dates. The ERP generates invoices when an active retainer comes due. The retainer workspace shows upcoming renewals and monthly recurring revenue.",
    },
    steps: [
      { title: "Record the agreement", text: "Add the client, fee, included services, billing frequency, and contract dates. Note any work outside the recurring fee so the billing team knows what to handle separately." },
      { title: "Check the terms before the next billing date", text: "Confirm upcoming dates, pricing changes, and any one-off charges before the next run. Enable invoice emails if clients should receive invoices automatically and your email setup is ready." },
      { title: "Review renewals and paused work", text: "Check upcoming end dates before renewal discussions. Keep retainer statuses current so your recurring revenue view reflects active agreements." },
    ],
    example: {
      title: "Example · Manage a quarterly marketing retainer",
      text: "An agency bills ₹90,000 every quarter. That agreement represents ₹30,000 a month when comparing recurring revenue, though the client is invoiced quarterly. The team checks the terms before the next billing date and tracks actual payments separately.",
    },
    faqs: [
      { title: "Can I use a quarterly billing schedule for a retainer?", text: "Yes. Set the billing frequency on the agreement. Active retainers are billed when they come due on the chosen schedule." },
      { title: "Can the ERP email recurring invoices automatically?", text: "Yes. Enable invoice emails on the retainer, confirm the client has an invoice recipient, and configure your sending email. Payment depends on the remittance method you provide." },
      { title: "What is the difference between MRR and cash collected?", text: "Monthly recurring revenue normalises ongoing contract value to a monthly figure. Cash collected is the amount clients actually paid during the period." },
    ],
    image: { file: "retainers", alt: "Retainers workspace with recurring agreements and monthly recurring revenue" },
    guide: "retainers-and-mrr",
    related: ["proposal-management", "gst-invoicing"],
  },
];

export const erpFeatures = [...coreErpFeatures, ...optionalErpFeatures];
