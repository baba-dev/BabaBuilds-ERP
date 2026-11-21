---
title: "Invoice Designs: Eight Layouts, Brand Colour, TDS and UPI QR"
description: "Choose from eight invoice designs, set a brand colour per workspace, client or invoice, show TDS with a net payable amount, and add a scan-to-pay UPI QR. Compare every design on your own invoice."
order: 3
category: "Invoicing"
tags: ["invoice design", "invoice template", "brand colour", "TDS", "UPI QR", "GST invoice", "thermal receipt", "statement"]
estimatedMinutes: 9
isFeatured: true
icon: "Palette"
datePublished: "2026-11-21"
dateModified: "2026-11-21"
---

# Invoice Designs: Eight Layouts, Brand Colour, TDS and UPI QR

An invoice is the one document every client reads. BabaBuilds ERP gives you **eight designs**, each built around a real invoicing problem: a GST-ready tax invoice, a design that makes paying a single scan, a statement that shows what a client still owes, and an 80mm receipt for the counter.

You can change the design at any time. Past invoices keep their numbers and amounts, and you can download them again in whichever design you choose now.

<HelpImage src="/product-images/light/invoice_designs.png" alt="Compare designs page showing the same invoice in several designs, with accent colour and TDS controls" caption="Settings → Invoicing → Compare all designs shows your latest invoice in every design, side by side." priority />

## The eight designs

| Design | Best for | What makes it different |
|---|---|---|
| **Classic** | Everyday invoices | White header, clean lines, shows your signature. |
| **Modern agency** | Studios and agencies | Bold dark header; does not show a signature. |
| **Tax invoice (GST)** | Registered GST businesses | HSN/SAC per line, CGST/SGST/IGST split, place of supply, IRN and amount in words. |
| **Pay-Fast** | Getting paid sooner | A big amount due and a scan-to-pay QR beside it. |
| **Itemised project** | Project and milestone billing | Sections with subtotals, quantity × rate, discounts and line notes. |
| **Statement** | Clients with several open invoices | Previous balance, payments received, credits applied and the amount due now. |
| **Minimal Pro** | Consultants and solo professionals | Quiet and spacious: one accent, rules instead of boxes. |
| **Receipt (80mm)** | Counters, events and thermal printers | A narrow receipt with a small payment QR at the end. |

<HelpImage src="/help/invoice-designs/design-3.webp" alt="Tax invoice design with HSN/SAC, CGST and SGST split, a tax summary table, TDS deduction and net payable" caption="The GST tax invoice shows the tax split, a tax summary table, the TDS deduction and the net payable amount." width={900} height={1273} />

## Compare designs on your own invoice

Choosing a design from a list of names is guesswork. The compare page shows your real data instead.

<Steps>
  <Step title="Open the compare page">
    Go to **Settings → Invoicing** and select **Compare all designs**.
  </Step>
  <Step title="See your latest invoice in every design">
    Each tile is your most recent invoice (or a labelled sample if you have none yet). The tiles keep true paper proportions, so the receipt looks narrow and the A4 designs look like paper.
  </Step>
  <Step title="Try a colour or TDS">
    Pick an accent colour or switch on **Show TDS**. Every tile updates after a moment. These are previews only until you choose a design.
  </Step>
  <Step title="Open one full screen">
    Select a tile to read it at full size. Zoom in, move to the previous or next design, download the PDF, or choose **Use this design**.
  </Step>
</Steps>

<HelpImage src="/product-images/light/invoice_design_viewer.png" alt="Full-screen preview of the Pay-Fast design with a UPI QR, zoom controls and a Use this design button" caption="The full-screen view: zoom, step through designs, download, or use the design." />

<Callout type="info">
  Previews never create a payment link, never email anyone and never change the invoice. Choosing a design only changes how your invoices look.
</Callout>

## Brand colour: workspace, client and invoice

Set your brand colour once, then override it only where you need to. BabaBuilds ERP checks four levels in order and uses the first colour it finds.

<HelpImage src="/help/diagrams/invoice_accent_chain.svg" alt="Four levels checked in order: this invoice, the client, the workspace, then the design's own colour" caption="The first level with a colour set wins." width={960} height={360} />

- **Workspace:** Settings → Invoicing → **Accent colour**. This is your default for every invoice.
- **Client:** open the client and set **Invoice colour for this client**. Useful when a client has a brand you want to echo, or when you run sub-brands.
- **Invoice:** the **Invoice colour** field in the new invoice form overrides everything for one invoice.

Colours that are too light to read on paper are flagged with a **Use this shade** button, which picks the nearest readable version. Designs 3 to 8 follow your accent colour. Classic and Modern keep their fixed look.

## TDS and the net payable amount

If your client deducts TDS before paying, the invoice should say so, and the payment link should ask for the amount they will actually send.

<HelpImage src="/help/diagrams/invoice_tds_net_payable.svg" alt="Example: 1,00,000 rupees of services plus 18,000 GST is 1,18,000; TDS at 10 percent on 1,00,000 is 10,000; net payable is 1,08,000" caption="TDS is calculated on the amount before GST, so GST is paid in full." width={960} height={400} />

1. On a client, fill in **TDS this client deducts** (section and rate) if they always deduct. It prefills new invoices.
2. On a new invoice, switch on **Client deducts TDS** and check the section and rate.
3. The invoice shows **Less: TDS** and **Net payable**, plus your PAN, which your client needs for the deduction.

<HelpImage src="/product-images/light/invoice_new.png" alt="New invoice form with the Invoice colour field and the Client deducts TDS switch showing less TDS and net payable" caption="The new invoice form shows the TDS and net payable estimate as you type." />

TDS is taken on the amount before GST. Export invoices never get TDS. The Razorpay link, the Pay-Fast QR and the receipt QR all collect the **net** amount. TDS here is the amount the client is expected to deduct; it is stored separately from withholding you actually record when a payment arrives.

## Scan-to-pay: UPI ID and QR codes

Add your payment details once and your invoices can carry a QR code that clients scan with any UPI app.

<HelpImage src="/product-images/light/settings_banking.png" alt="Bank account settings with a UPI ID field, payee name, a live QR check and an uploaded QR codes section" caption="Settings → Bank account → UPI and QR codes. A live QR lets you scan it with your own phone first." />

- **UPI ID:** BabaBuilds builds a QR for each invoice with the exact amount and the invoice number in the note.
- **Uploaded QR images:** add up to three static QRs from Paytm, Google Pay, PhonePe or your bank. They do not include the amount, so the client types it. Each image must be under 1 MB.
- Both are optional, and you can also add a UPI ID during onboarding.

<HelpImage src="/help/diagrams/invoice_qr_priority.svg" alt="QR priority: payment link QR first, then a UPI QR from your UPI ID, then your uploaded QR images" caption="The invoice shows the best option it has." width={960} height={330} />

QR codes appear on **Pay-Fast** and on the **Receipt**. They are shown only for INR invoices with something left to collect. The receipt keeps a single small QR at the end.

<HelpImage src="/help/invoice-designs/pay-fast-qr.webp" alt="Pay-Fast invoice with a large amount due and a scan to pay UPI QR beside it" caption="Pay-Fast puts the amount due and the QR side by side." width={900} height={1273} />

## PAID and PARTIALLY PAID stamps

Every new design shows a **PAID** stamp with the payment date when the invoice is settled, and a **PARTIALLY PAID** stamp with the amount received when it is part paid. A paid invoice no longer shows a payment QR, and a part-paid invoice's QR asks for the balance due.

<HelpImage src="/help/invoice-designs/paid-stamp.webp" alt="Tax invoice with a PAID stamp showing the payment date" caption="A paid invoice carries a PAID stamp with the date." width={900} height={1273} />

## Fonts, rupee sign and Indian languages

The new designs embed their own fonts, so the **₹** sign and Devanagari text print correctly in any PDF viewer and on any printer.

## Which design for which situation

- **You are GST-registered:** Tax invoice (GST).
- **Clients pay by UPI:** Pay-Fast.
- **You bill by project or milestone:** Itemised project.
- **A client has several unpaid invoices:** Statement.
- **You prefer a calm, minimal look:** Minimal Pro.
- **You sell over a counter:** Receipt (80mm).

## Troubleshooting

### My accent colour does not change Classic or Modern
These two keep their fixed look so existing invoices do not change. Use designs 3 to 8 for brand colour.

### The QR does not appear on my invoice
Check that the design is Pay-Fast or Receipt, the invoice is in INR, it is not fully paid, and you have a UPI ID or an uploaded QR in Settings → Bank account.

### The compare page shows a sample invoice
You have not created an invoice yet. Create one and the page uses it automatically.

## FAQ

### Can I use a different design for different clients?
The design is set for the workspace. The accent colour can differ per client or per invoice.

### Will changing the design change my old invoices?
Invoice numbers and amounts never change. Downloading an old invoice uses your current design.

### Is TDS added to the amount I invoice?
No. TDS is an estimate of what the client will deduct. Your invoice total is unchanged, and the invoice also shows the net payable.

### Where do I set my UPI ID?
In **Settings → Bank account → UPI and QR codes**. You can also add it at the end of the business identity step in onboarding.

## Related guides

- [Generating, Sending, and Collecting Invoices](/help/generating-invoices)
- [Connecting Razorpay & Stripe](/help/payment-gateways)
- [Configuring Your Business Profile & Workspace Settings](/help/settings-guide)
- [Managing Your Client CRM](/help/managing-clients)
