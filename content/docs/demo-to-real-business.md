---
title: "Demo to Real Business Activation"
description: "How to move from an interactive demo session to your real business workspace with plan-aware signup intent."
order: 5
category: "Getting Started"
tags: ["demo", "signup", "onboarding", "trial"]
icon: "rocket"
estimatedMinutes: 5
isFeatured: true
dateModified: "2026-04-29"
---

# Demo to Real Business Activation

Use this flow after exploring the interactive demo.

## Trigger

- In demo mode, complete at least 3 actions (proposal, tax, or invoice actions).
- The dashboard shows **Start with my real business**.

## What happens next

1. CTA opens `/signup?plan=pro&cycle=monthly&trial=15&fromDemo=1`.
2. Signup intent is saved and forwarded to login.
3. After auth, your workspace is provisioned with:
   - Pro trial intent
   - Selected billing cycle
   - Persona-aware onboarding

## Recommended first steps

- Pick persona (if not preselected).
- Finish the onboarding money task.
- Open Billing to complete payment setup when ready.
