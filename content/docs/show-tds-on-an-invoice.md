---
title: "How to Show TDS and Net Payable on an Invoice"
description: "Add the TDS your client will deduct, show the net payable amount, and make the payment link and QR collect the right figure."
order: 6
category: "Invoicing"
tags: ["TDS", "net payable", "withholding", "invoice", "Section 194J"]
estimatedMinutes: 4
icon: "Percent"
datePublished: "2026-11-21"
dateModified: "2026-11-21"
---

# How to Show TDS and Net Payable on an Invoice

If your client deducts TDS, your invoice should show it, so they pay the right amount and your records match.

<HelpImage src="/help/diagrams/invoice_tds_net_payable.svg" alt="Example: services of 1,00,000 rupees, 18,000 GST, 10,000 TDS, net payable 1,08,000" caption="TDS is taken on the amount before GST, so GST is paid in full." width={960} height={400} />

## Set a default for a client

Open the client and fill in **TDS this client deducts**: the **section** (for example `194J`) and the **rate**. New invoices for that client are prefilled with them.

## Add TDS to one invoice

<Steps>
  <Step title="Open the new invoice form">
    Choose the client and add your items.
  </Step>
  <Step title="Switch on Client deducts TDS">
    Check the section and rate (the form says when they were prefilled from the client). It shows **Less: TDS** and **Net payable** as you type.
  </Step>
  <Step title="Generate the invoice">
    The PDF shows the deduction, the net payable amount and your PAN.
  </Step>
</Steps>

<HelpImage src="/product-images/light/invoice_new.png" alt="New invoice form with the Client deducts TDS switch and the net payable estimate" caption="The estimate updates as you change the rate." />

## What changes

- The Razorpay link, the Pay-Fast QR and the receipt QR collect the **net** amount.
- Your invoice total and GST are unchanged.
- Export invoices never get TDS.
- Designs 3 to 8 show the TDS lines. Classic and Modern do not.

## Related

- [Invoice Designs: Eight Layouts, Brand Colour, TDS and UPI QR](/help/invoice-designs)
- [Connecting Razorpay & Stripe](/help/payment-gateways)
