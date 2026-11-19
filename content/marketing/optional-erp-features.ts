import type { ModuleKey } from "@/lib/module-keys";
import type { ErpFeature } from "./erp-features";
import { optionalFeatureSlugs as slugs } from "./feature-paths";

const modules = {
  POS: {
    name: "Point of sale (POS)",
    title: "Point of Sale Software for Small Businesses",
    description: "Record walk-in sales, update stock, and compare expected cash with the till count using the BabaBuilds ERP point of sale.",
    headline: "Point of sale software that connects checkout to stock",
    intro: "Sell a product, charge for a service, or do both in one checkout. BabaBuilds ERP records the payment and updates stock when you complete the sale, giving your team a record to check when the counter closes.",
    problem: {
      title: "The sale takes seconds. Reconciling it can take much longer.",
      text: "When staff use one tool to take payments and another to count stock, a missing entry can leave a sold item showing as available. By closing time, you may also have to separate cash takings from transfers and card payments by hand.",
    },
    solution: {
      title: "Run counter sales from the same ERP as your inventory",
      text: "Build a cart from catalogue products, services, or permitted custom lines. Record the payment, generate the sale invoice, and track the change in stock for inventory items. The shift closeout compares recorded cash takings with the amount counted.",
    },
    steps: [
      { title: "Add items to the cart", text: "Check quantities and prices. Use the walk-in flow for an immediate sale or select a customer when the sale belongs on their account." },
      { title: "Record how the customer paid", text: "Choose the payment method and add a reference when useful. For cash, enter the amount tendered to see the change due." },
      { title: "Count cash at close", text: "Compare counted cash with the cash takings recorded for the shift. Record any variance and check the underlying sales before closing the shift." },
    ],
    example: {
      title: "Example · Sell a part and fitting service",
      text: "A repair shop sells two replacement parts and a fitting service. The cashier records a UPI payment after confirming receipt and issues the invoice. The parts come out of inventory, and the payment is recorded as UPI for the shift review.",
    },
    faqs: [
      { title: "Can I check out a walk-in customer?", text: "Yes. The POS has a walk-in flow for immediate payment. Use an existing customer record when you need the sale tied to that customer." },
      { title: "Does recording UPI or a card payment collect the money?", text: "In this checkout flow, you record the payment after receiving it through your payment method. Confirm the payment with your provider before marking the sale paid." },
      { title: "Can a sale include both products and services?", text: "Yes. Products and services can share one cart. Inventory movement applies to stocked products." },
    ],
    image: { file: "pos", alt: "BabaBuilds POS register with a product catalogue and checkout cart" },
    guide: "settings-guide",
    guideLabel: "Read the workspace settings guide",
    related: ["inventory-management", slugs.SHOP, "gst-invoicing"],
  },
  SHOP: {
    name: "Online shop",
    title: "Online Storefront Software for Small Businesses",
    description: "Publish a shareable online shop, organise product listings, and manage customer enquiries and orders in BabaBuilds ERP.",
    headline: "An online storefront customers can browse on their own",
    intro: "Give customers one link for products, prices, and ordering. BabaBuilds ERP Shop lets you publish a public catalogue and manage the orders or enquiries it brings in.",
    problem: {
      title: "Customers keep asking for the latest catalogue",
      text: "Product photos get buried in chats and an old PDF keeps circulating with last season’s prices. Customers have to wait for a reply to find out what’s available, while your team keeps answering the same questions.",
    },
    solution: {
      title: "Publish one storefront and manage it from the ERP",
      text: "Show product details, pricing, images, and categories on a public storefront. Customers can search or filter the catalogue, enquire about a product, or check out online when supported payments are enabled.",
    },
    steps: [
      { title: "Prepare your product listings", text: "Add useful names, clear photos, current prices, and descriptions that answer the questions customers normally ask." },
      { title: "Set up how buyers place orders", text: "Publish your shop link and contact details. If your plan and payment setup support online checkout, connect the gateway and test the buying flow." },
      { title: "Review and fulfil incoming orders", text: "Check the items and payment status in the shop workspace before dispatching. Update the order status as it moves through fulfilment." },
    ],
    example: {
      title: "Example · Replace a catalogue PDF",
      text: "A stationery supplier shares its shop link in messages. Buyers filter by category and see the current pack sizes. A buyer who needs a custom quantity can contact the supplier from the storefront.",
    },
    faqs: [
      { title: "Can customers browse without logging in to the ERP?", text: "Yes. The published storefront is public and has its own shareable link." },
      { title: "Does the Shop support online payments?", text: "Eligible shops can use a configured Stripe or Razorpay integration. Your plan, gateway configuration, and storefront settings determine whether online checkout is available." },
      { title: "Can I use the storefront for enquiries?", text: "Yes. Add current contact details and product information so customers can reach you before placing an order." },
    ],
    image: { file: "public_shop", alt: "A BabaBuilds public shop with product listings and storefront navigation" },
    guide: "shop-operations",
    related: [slugs.POS, "inventory-management", "gst-invoicing"],
  },
  WORKFORCE: {
    name: "Workforce management",
    title: "Employee Attendance and Leave Management Software",
    description: "Track attendance, manage leave requests, and organise employee records and approvals with the BabaBuilds ERP Workforce module.",
    headline: "Attendance and leave management in one workspace",
    intro: "See who is working, whose leave is approved, and which attendance records need a correction. BabaBuilds ERP brings employee records, attendance, and leave approvals together for small HR and operations teams.",
    problem: {
      title: "An approved day off should reach the people planning the week",
      text: "When requests arrive in chat and attendance is kept in a spreadsheet, managers can plan around the wrong availability. HR then has to resolve the differences again before payroll.",
    },
    solution: {
      title: "Keep employee records, attendance, and leave connected",
      text: "Build an employee directory, capture daily attendance, and give authorised managers a place to review leave requests. When you also use Workforce-linked payroll, reviewed attendance can inform the payroll run.",
    },
    steps: [
      { title: "Set up the employee directory", text: "Add your people, departments, and designations so managers can find the right records and approval responsibilities are clear." },
      { title: "Record attendance and review leave", text: "Check missing or unusual attendance entries. Review pending requests against policy and coverage before approving them." },
      { title: "Review exceptions before payroll", text: "Resolve disputed attendance or unpaid leave for the period and give payroll a reviewed set of inputs." },
    ],
    example: {
      title: "Example · Catch an absence before payroll",
      text: "A supervisor spots an employee marked absent on a day that was approved as leave. HR checks the request and resolves the attendance exception before it affects the pay period.",
    },
    faqs: [
      { title: "Can managers approve leave in the ERP?", text: "Yes. Users with the appropriate permissions can review and act on leave requests in Workforce." },
      { title: "Does Workforce require Payroll?", text: "You can use Workforce for employee records, attendance, and leave on its own. Linking it to Payroll is a separate setup choice." },
    ],
    image: { file: "workforce", alt: "Workforce workspace with employee, attendance, and leave views" },
    guide: "optional-sub-system-workforce",
    related: [slugs.PAYROLL, slugs.REPORTING_CENTER],
  },
  PAYROLL: {
    name: "Payroll",
    title: "Payroll Processing Software for Small Businesses",
    description: "Set up pay components, review payroll runs, and track postings and liabilities with the BabaBuilds ERP Payroll module.",
    headline: "Payroll software with a review step before posting",
    intro: "Run payroll with a clear record of what changed from the last pay period. BabaBuilds ERP helps you calculate pay and deductions, review exceptions, and post approved results to your records.",
    problem: {
      title: "A small spreadsheet error can reach every payslip",
      text: "A copied formula may overlook a new joiner, a deduction change, or an unpaid day. Once the figures are handed off, the reviewer needs enough detail to explain any unexpected difference.",
    },
    solution: {
      title: "Separate payroll preparation from approval and posting",
      text: "Configure earnings and deductions, prepare the pay period, and review gross-to-net amounts before finalising. Use the available posting and export tools once your workspace is ready for live payroll.",
    },
    steps: [
      { title: "Set up your pay rules", text: "Choose standalone or Workforce-linked setup. Verify employee pay assignments, earnings, deductions, and any local requirements before the first run." },
      { title: "Draft and check the run", text: "Review net pay for new joiners, salary changes, bonuses, and deductions. Resolve readiness issues and confirm unusual changes with the responsible team." },
      { title: "Post after approval", text: "Follow the approval workflow and use the appropriate exports and liability records for the handoff to finance." },
    ],
    example: {
      title: "Example · Review a month with a new hire",
      text: "A new employee starts midway through the month. Payroll checks the applicable pay basis and compares the result with the agreed terms before it approves the run.",
    },
    faqs: [
      { title: "Do I need Workforce to use Payroll?", text: "No. Payroll supports standalone setup. Workforce-linked setup lets you bring in relevant attendance and people data when both modules are enabled." },
      { title: "Can I review figures before posting payroll?", text: "Yes. Prepare a run, review employee amounts and readiness checks, and follow the approval process before posting." },
    ],
    image: { file: "payroll", alt: "Payroll workspace showing payroll readiness and pay run history" },
    guide: "optional-sub-system-payroll",
    related: [slugs.WORKFORCE, slugs.CASH_FLOW],
  },
  REVENUE_PIPELINE: {
    name: "Sales pipeline",
    title: "Sales Pipeline Software for Service Businesses",
    description: "See proposals by stage, find stalled quotes and accepted work awaiting invoicing, and prioritise follow-up in BabaBuilds ERP.",
    headline: "Sales pipeline software that shows where proposals stall",
    intro: "Know which proposals need a follow-up and which approved deals are ready for billing. BabaBuilds ERP Revenue Pipeline uses proposal activity to help service teams decide what to do next.",
    problem: {
      title: "An open proposal list can hide two very different jobs",
      text: "A buyer who hasn’t replied needs a follow-up. A buyer who already approved the work may simply be waiting for an invoice. Treating both as open sales makes it easier to miss the handoff.",
    },
    solution: {
      title: "See the stage and business value behind the next action",
      text: "Review proposals by stage, identify stalled deals, and see accepted proposals that still need converting. Use the pipeline to separate sales follow-ups from billing work.",
    },
    steps: [
      { title: "Keep proposals current", text: "Send proposals from the ERP and review their status after each decision. Record expiry dates so old quotes don’t crowd the working list." },
      { title: "Review stalled deals", text: "Look at the time spent in stage, proposal value, and any useful follow-up context. Decide who should contact the client and when." },
      { title: "Hand accepted work to billing", text: "Check the accepted-but-unconverted queue. Convert appropriate proposals and pass unpaid invoices to the collections workflow when needed." },
    ],
    example: {
      title: "Example · Unblock two late deals",
      text: "An agency finds two equally valuable proposals in its review. One needs a scope discussion. The other was signed last week and needs a billing owner. The team assigns different next actions.",
    },
    faqs: [
      { title: "What records does Revenue Pipeline use?", text: "It uses proposal activity, so sent, accepted, and converted work can be reviewed alongside each deal’s stage and value." },
      { title: "Can I see accepted proposals that still need invoicing?", text: "Yes. The pipeline highlights accepted-but-unconverted proposals so your team can check which ones are ready to bill." },
    ],
    image: { file: "proposals_pipeline", alt: "Revenue Pipeline overview with proposal stages and follow-up signals" },
    guide: "optional-sub-system-revenue-pipeline",
    related: ["proposal-management", slugs.AR_COLLECTIONS],
  },
  AR_COLLECTIONS: {
    name: "AR aging and collections",
    title: "Accounts Receivable Aging and Collections Software",
    description: "Track overdue invoices, prioritise follow-ups, and organise payment reminders with BabaBuilds ERP AR Collections.",
    headline: "Accounts receivable software that helps you decide who to chase",
    intro: "Find overdue invoices, organise your follow-up queue, and track client commitments in BabaBuilds ERP. See what is owed and who needs a call before another week goes by.",
    problem: {
      title: "An overdue total tells you how much. It doesn’t tell you whom to call.",
      text: "A newly late invoice, a disputed charge, and a missed promise to pay all contribute to the same total. They need different follow-ups, particularly when a large balance is blocking cash for payroll or suppliers.",
    },
    solution: {
      title: "Turn your aging report into a collections queue",
      text: "Group outstanding invoices by age and use amount and risk signals to review the most pressing balances. Record follow-ups and promises to pay, and configure reminders when your sending email is ready.",
    },
    steps: [
      { title: "Check aging and payment records", text: "Review invoices by days overdue. Match recent deposits before contacting a customer who may already have paid." },
      { title: "Prioritise follow-ups", text: "Look at the amount, age, and previous contact. Choose an email reminder, a direct call, or a review with the account owner." },
      { title: "Record the next action", text: "Log a payment commitment or next follow-up date. Review missed commitments before sending another generic reminder." },
    ],
    example: {
      title: "Example · Start the week with one follow-up queue",
      text: "Finance separates recently overdue bills from a large invoice whose promised date has passed. The team reviews the recent payments and calls the account with the missed commitment first.",
    },
    faqs: [
      { title: "What is an accounts receivable aging report?", text: "It groups outstanding invoices by time past the due date, helping you see how much money is tied up in newer and older overdue balances." },
      { title: "Can the ERP email overdue reminders?", text: "Yes. Configure sending email and the reminder rules for your workspace. Check the billing recipient and follow-up status before turning on a new cadence." },
    ],
    image: { file: "ar_collections", alt: "AR Collections workspace with aging and invoice follow-up priorities" },
    guide: "optional-sub-system-ar-collections",
    related: ["bank-reconciliation", slugs.CASH_FLOW, "gst-invoicing"],
  },
  CASH_FLOW: {
    name: "Cash flow forecasting",
    title: "Cash Flow Forecasting Software for Small Businesses",
    description: "Compare expected inflows and outflows, test payment delays, and review cash shortfalls with BabaBuilds ERP Cash Flow.",
    headline: "Cash flow forecasting that helps you see a shortfall coming",
    intro: "Plan around when money actually moves. BabaBuilds ERP brings expected receipts, scheduled spending, and your own assumptions into one cash forecast.",
    problem: {
      title: "A profitable month can still leave you short on payday",
      text: "Revenue may look healthy on paper while the customer payment arrives after rent, wages, and supplier bills are due. A useful forecast shows those dates and makes the assumptions easy to check.",
    },
    solution: {
      title: "Put expected receipts and payments on the same timeline",
      text: "Review forecast snapshots with planned inflows and outflows. Use scenarios to see what changes when a client pays late, add adjustments for known one-off events, and compare prior expectations with actual cash movements.",
    },
    steps: [
      { title: "Start from a checked cash balance", text: "Review your opening balance and account context. Confirm that major expected receipts and outgoing payments are represented." },
      { title: "Test an assumption", text: "Move an expected payment date or add a planned cost in a scenario. Check when the shortfall appears and how long it lasts." },
      { title: "Review the gaps against actuals", text: "Look for assumptions that keep proving wrong, such as a customer who always pays late. Update the next forecast with what you learned." },
    ],
    example: {
      title: "Example · Test a two-week payment delay",
      text: "A founder expects a large invoice to clear before payroll. They test a two-week delay and see a temporary shortfall, giving them time to follow up and review the timing of discretionary spend.",
    },
    faqs: [
      { title: "What is the difference between a cash forecast and a profit report?", text: "A cash forecast focuses on when money is expected to arrive or leave. A profit report measures financial performance for a period under your accounting rules." },
      { title: "Do planning adjustments create booked transactions?", text: "Scenario adjustments belong to the forecast. Use your accounting workflows to record actual transactions." },
    ],
    image: { file: "cash_flow", alt: "Cash Flow workspace displaying forecast movements and liquidity indicators" },
    guide: "optional-sub-system-cash-flow",
    related: [slugs.AR_COLLECTIONS, slugs.REPORTING_CENTER, "bank-reconciliation"],
  },
  DOCUMENTS: {
    name: "Document Vault",
    title: "Business Document Management With OCR",
    description: "Upload business documents, review OCR suggestions, and link supporting files to ERP records with BabaBuilds Document Vault.",
    headline: "Business document management that keeps evidence with the record",
    intro: "Give receipts, contracts, and compliance files a place to live alongside the work they support. BabaBuilds ERP Document Vault brings intake, review, and record linking into one workspace.",
    problem: {
      title: "The entry is easy to find. The supporting file is somewhere else.",
      text: "A payment can be visible in the ledger while the supplier invoice sits in a colleague’s inbox. The missing connection slows down reviews and makes handoffs depend on who remembers where the file went.",
    },
    solution: {
      title: "Organise documents by what they support",
      text: "Upload documents to the intake queue, classify them, and link them to relevant records. For supported documents, review OCR suggestions before accepting extracted values.",
    },
    steps: [
      { title: "Upload the supporting file", text: "Use a clear name and select a document type. Keep the original evidence available for review." },
      { title: "Check extracted details", text: "Compare suggested fields such as date, supplier, or amount with the original. Correct errors before relying on the values." },
      { title: "Link it to the relevant record", text: "Attach the document to the relevant client, expense, invoice, or other supported record so reviewers can find it later." },
    ],
    example: {
      title: "Example · Trace a supplier charge",
      text: "A finance assistant uploads a supplier invoice, checks the extracted amount, and links it to the existing expense. The reviewer opens the source document from the same workflow.",
    },
    faqs: [
      { title: "Can OCR read every document accurately?", text: "Accuracy varies with file quality and layout. Check suggested values against the original, especially totals, reference numbers, and dates." },
      { title: "What should I link to an expense?", text: "Attach the receipt or supplier invoice that explains the purchase. Add other evidence where it helps a reviewer understand the charge." },
    ],
    image: { file: "documents", alt: "Document Vault workspace with uploaded files and review states" },
    guide: "optional-sub-system-document-vault",
    related: ["expense-management", slugs.TAX_ADVANCED],
  },
  TAX_ADVANCED: {
    name: "Tax readiness and compliance",
    title: "Tax Readiness and Compliance Workflow Software",
    description: "Review tax readiness, investigate import issues, and trace tax decisions and supporting evidence with BabaBuilds ERP.",
    headline: "Tax readiness software that shows what needs review before filing",
    intro: "Bring tax issues, evidence, and filing-period status into one workspace. BabaBuilds ERP helps teams prepare records for review and track why a tax decision was made.",
    problem: {
      title: "A tax total on its own can’t explain what changed",
      text: "A missing tax ID or a corrected rate may change a return-period total. When the reason lives in a separate spreadsheet or chat, the reviewer has to rebuild the decision trail.",
    },
    solution: {
      title: "Review exceptions with the evidence behind them",
      text: "Use readiness checks and import diagnostics to find items that need attention. Review supporting documents and use the approval workflow for tax overrides where applicable, so the decision has a history.",
    },
    steps: [
      { title: "Review the reporting period", text: "Confirm the entity and period. Check readiness signals for incomplete or inconsistent records." },
      { title: "Investigate flagged items", text: "Open the underlying records and check the tax details against their supporting invoices or documents." },
      { title: "Record decisions for handoff", text: "Capture the basis for any adjustment, use the applicable approvals, and review the filing status with the person responsible." },
    ],
    example: {
      title: "Example · Resolve an invoice with an unexpected rate",
      text: "An accountant spots a tax rate that differs from similar invoices. They review the invoice and supporting evidence, then document the adjustment and its approval before the period is signed off.",
    },
    faqs: [
      { title: "Does BabaBuilds ERP submit tax returns automatically?", text: "BabaBuilds provides tax-ready invoicing and compliance workflows. Filing automation depends on verification for your jurisdiction. Check the tax engine scope and confirm your filing process with your accountant." },
      { title: "How can a reviewer see why a tax rate changed?", text: "The tax workflow provides decision history and audit events for supported tax actions. Include the supporting evidence when reviewing an override." },
    ],
    image: { file: "tax_advanced", alt: "Advanced tax workspace with tax readiness and compliance operations" },
    guide: "tax-engine-scope",
    guideLabel: "Read the tax engine scope",
    related: ["gst-invoicing", slugs.DOCUMENTS, slugs.REPORTING_CENTER],
  },
  REPORTING_CENTER: {
    name: "Financial reporting",
    title: "Financial Reporting Software for Small Businesses",
    description: "Run preset business reports, apply filters, and export worksheets for review with the BabaBuilds ERP Reporting Center.",
    headline: "Financial reporting software that makes month-end review repeatable",
    intro: "Pick a report, check its scope, and export a workbook finance can review. BabaBuilds ERP Reporting Center gives teams a consistent starting point for recurring reporting.",
    problem: {
      title: "Two reports with the same name can show different numbers",
      text: "If each person creates their own spreadsheet, differences in date ranges, status filters, and late postings can turn a routine review into a debate about which totals to use.",
    },
    solution: {
      title: "Run a defined report and check the underlying filters",
      text: "Start from a preset, apply the filters available for that report, and preview the output before exporting. The reporting workspace keeps a record of report runs and exports.",
    },
    steps: [
      { title: "Choose the question the report should answer", text: "Pick the preset that matches the decision, such as which customer balances need follow-up." },
      { title: "Check the period and scope", text: "Apply the relevant filters and confirm the preview covers the intended records. Compare an unexpected result with its source data." },
      { title: "Export for the reader", text: "Export the report as a workbook where available. Share the reporting period and any important filters with the recipient." },
    ],
    example: {
      title: "Example · Review aging with the same cut-off each month",
      text: "Finance runs the aging report for a month-end review, confirms the scope, and exports a workbook for the collections team. Both teams can discuss the same set of balances.",
    },
    faqs: [
      { title: "Do I need to write SQL to run a preset report?", text: "No. Choose a preset and use the available filters. Custom query capabilities have separate controls." },
      { title: "Can I export a report to Excel?", text: "The Reporting Center supports XLSX exports. Check the selected report for its available export options." },
    ],
    image: { file: "reporting", alt: "Reporting Center with a gallery of preset finance reports" },
    guide: "optional-sub-system-reporting-center",
    related: [slugs.CASH_FLOW, slugs.AR_COLLECTIONS, slugs.IMPORT_MANAGER],
  },
  IMPORT_MANAGER: {
    name: "Data import",
    title: "ERP Data Import Software for CSV and Excel",
    description: "Map spreadsheet columns, preview row errors and duplicates, and import supported records with BabaBuilds ERP Import Manager.",
    headline: "ERP data import that shows spreadsheet errors before you commit",
    intro: "Bring client lists, products, and other supported records into BabaBuilds ERP with a preview first. The Import Manager lets you inspect column mappings and check row errors before running a bulk import.",
    problem: {
      title: "A spreadsheet mistake is cheaper to fix before it creates records",
      text: "One column mapped incorrectly can put the wrong value on many records. A file with inconsistent identifiers can also duplicate clients or update the wrong item if the team chooses an unsuitable import mode.",
    },
    solution: {
      title: "Map, validate, and preview the file before importing",
      text: "Choose a supported record type, start from a template or map your own file, and inspect validation results. Select create-only or upsert where supported based on how existing records should be handled.",
    },
    steps: [
      { title: "Choose the record type", text: "Download its template or prepare a CSV or XLSX file with clear headers and consistent identifiers." },
      { title: "Review mappings and errors", text: "Check each source column against the destination field. Fix duplicates, missing values, and other flagged rows in the source file." },
      { title: "Run a small batch first", text: "Verify a handful of rows before committing a large import. Check the execution summary and sample resulting records." },
    ],
    example: {
      title: "Example · Migrate an inventory spreadsheet",
      text: "A shop maps SKU, product name, and price, then finds two rows using the same SKU during preview. It corrects the spreadsheet and checks a small batch before bringing in the remaining products.",
    },
    faqs: [
      { title: "Which files can Import Manager read?", text: "It supports CSV and XLSX for supported import types. Start with a template if you are unsure which columns are required." },
      { title: "What does upsert mean?", text: "Upsert updates a matching record or creates one when no match exists. Review the matching identifier and preview before choosing this mode." },
    ],
    image: { file: "import_manager", alt: "Import Manager interface for selecting a data type and preparing a file import" },
    guide: "optional-sub-system-import-manager",
    related: ["inventory-management", slugs.SHOP, slugs.REPORTING_CENTER],
  },
  MULTI_COMPANY: {
    name: "Multi-company ERP",
    title: "Multi-Company ERP for Separate Legal Entities",
    description: "Manage multiple legal entities with company-specific settings and company-aware navigation in BabaBuilds ERP.",
    headline: "Multi-company ERP that helps teams work in the right entity",
    intro: "Manage separate legal entities when the same team works across companies. BabaBuilds ERP adds company-aware navigation and company-level settings so operators can check the entity before doing their work.",
    problem: {
      title: "A shared back office can issue documents under the wrong company",
      text: "Separate entities can have similar names, staff, and clients. If the current company is unclear, an invoice may carry the wrong legal identity or a review may pull records from the wrong context.",
    },
    solution: {
      title: "Set up company contexts and check which one is active",
      text: "Enable Multi-Company for the workspace and configure company-specific settings. Use company-aware navigation and record views where supported to keep the active entity visible.",
    },
    steps: [
      { title: "Identify the legal entities you need", text: "List their legal names and operating responsibilities. Confirm which staff need to work in each company." },
      { title: "Review company-specific defaults", text: "Check identity, billing defaults, and the module views your team uses before relying on the new company context." },
      { title: "Confirm the entity before acting", text: "Verify the active company before issuing documents or reviewing records, especially after switching from another entity." },
    ],
    example: {
      title: "Example · Check who should issue the invoice",
      text: "A shared finance team bills for two legal entities. An operator selects the contracting company and confirms its billing details on a test invoice before issuing customer documents.",
    },
    faqs: [
      { title: "Can I keep using a single-company workspace?", text: "Yes. Multi-Company is opt-in. A business that operates under one legal entity can use the single-company setup." },
      { title: "Does Multi-Company produce a statutory consolidation?", text: "Multi-Company gives teams company-specific settings and company-aware workflows. Verify consolidation and statutory reporting requirements separately with your accountant." },
    ],
    image: { file: "companies", alt: "Companies workspace for managing company identities and active context" },
    guide: "settings-guide",
    guideLabel: "Read the workspace settings guide",
    related: ["gst-invoicing", slugs.REPORTING_CENTER, slugs.TAX_ADVANCED],
  },
  MIAB_BILLING: {
    name: "Email hosting billing",
    title: "Mail-in-a-Box Hosting Billing Software",
    description: "Connect Mail-in-a-Box, map domains to clients, and review mailbox counts before they reach recurring billing in BabaBuilds ERP.",
    headline: "Email hosting billing that helps you keep mailbox counts current",
    intro: "See which hosted domains are linked to clients and which mailbox counts need a billing review. BabaBuilds ERP connects Mail-in-a-Box inventory with client and recurring billing records.",
    problem: {
      title: "Mailbox counts change between billing runs",
      text: "An account can add mailboxes mid-cycle while your invoice still uses an older quantity. An unmapped domain can also disappear from the billing review entirely.",
    },
    solution: {
      title: "Bring hosted-domain inventory and billing review together",
      text: "Sync domains and mailbox inventory from a configured Mail-in-a-Box server, map each domain to the right client, and check quantity changes against the customer’s billing setup.",
    },
    steps: [
      { title: "Connect and sync the server", text: "Configure the Mail-in-a-Box connection and verify that the expected domains and mailbox counts appear." },
      { title: "Map domains to billing clients", text: "Link each domain to the customer responsible for payment and check the billing arrangement before connecting recurring charges." },
      { title: "Review changes before the cycle closes", text: "Check unmapped domains and changed mailbox counts. Compare them with the agreed plan or quantity before applying a billing change." },
    ],
    example: {
      title: "Example · Review three new mailboxes",
      text: "A hosting provider sees that a client went from eight to eleven mailboxes. The billing owner checks the customer’s plan and reviews the proposed quantity change before the next recurring charge.",
    },
    faqs: [
      { title: "Which email server does the module connect to?", text: "This workflow is built for Mail-in-a-Box. Confirm access to the server and the required connection setup before using it." },
      { title: "Can I review mailbox changes before they affect billing?", text: "Yes. The review queue can surface differences between synced and billed quantities. Check your configuration before enabling automatic quantity updates." },
    ],
    image: { file: "email_billing", alt: "Email Billing workspace with hosting inventory and review activity" },
    guide: "retainers-and-mrr",
    guideLabel: "Read the recurring billing guide",
    related: ["recurring-invoicing", slugs.AR_COLLECTIONS],
  },
} satisfies Record<ModuleKey, Omit<ErpFeature, "slug">>;

export const optionalErpFeatures: readonly ErpFeature[] = (
  Object.keys(modules) as Array<keyof typeof modules>
).map((key) => ({ slug: slugs[key], ...modules[key] }));
