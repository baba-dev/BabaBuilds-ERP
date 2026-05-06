# Production Readiness Audit Report: BabaBuilds ERP

**Date:** Wednesday, 6 May 2026  
**Status:** CRITICAL - NOT READY FOR MASS PUBLIC LAUNCH

This document outlines high-priority issues and "showstoppers" identified during a deep-dive audit of the BabaBuilds ERP system. These must be addressed to ensure scalability, data integrity, and global compliance before a public release.

---

## 1. Core Architecture & Database (Showstoppers)

### 1.1 SQLite in Production
*   **Issue:** The `prisma/schema.prisma` is configured to use `sqlite`. 
*   **Risk:** SQLite is unsuitable for a multi-tenant ERP with high concurrency. It uses file-level locking for writes, which will lead to "Database is locked" errors and performance degradation as user volume grows.
*   **Recommendation:** Migrate to **PostgreSQL** immediately.

### 1.2 Multi-Tenancy Leaks & Indexing
*   **Issue:** While `workspaceId` is present on most models, some critical lookups lack composite indexes.
*   **Risk:** Slow queries as data scales. Potential for cross-tenant data leakage if a developer forgets a `where: { workspaceId }` clause in a complex raw query or new API route.
*   **Recommendation:** Implement strict **Row Level Security (RLS)** if moving to Postgres, and audit all queries for `workspaceId` scoping. Add composite indexes (e.g., `@@index([workspaceId, status, createdAt])`).

---

## 2. Financial Logic & Data Processing (High Risk)

### 2.1 Inconsistent Financial Math
*   **Issue:** The system mixes `Prisma.Decimal` (in `lib/money.ts`) with `number` and "minor units" logic (in `lib/invoice/totals.ts`).
*   **Risk:** 
    *   **Precision Loss:** Floating-point math (`number`) is inherently imprecise for currency.
    *   **Minor Units Flaw:** The `* 100` logic assumes all currencies have 2 decimal places. This will break for JPY (0 decimals) or BHD (3 decimals).
*   **Recommendation:** Standardize on **Decimal.js** or `Prisma.Decimal` for ALL financial calculations. Eliminate `number` conversions in the business logic layer.

### 2.2 Invoice Numbering Race Conditions
*   **Issue:** `app/api/generate/route.ts` calculates the next invoice number by querying the last record and incrementing.
*   **Risk:** Under high load, two requests can read the same "last number" and attempt to create the same "next number". While the DB unique constraint prevents corruption, the user experience will be "Retry 5 times and then fail".
*   **Recommendation:** Use a database-native **Sequence** or a dedicated atomic counter per workspace.

---

## 3. Internationalization (i18n) & Global Tax (High Risk)

### 3.1 "Global" Tax Engine is India-Centric
*   **Issue:** 
    *   Hardcoded **SAC Codes** (`998313`) as defaults.
    *   `hooks/use-format.ts` uses a binary `isIndia` check. If not India, it defaults to a generic "Global" profile.
    *   Enums in `schema.prisma` (like `TaxReturnFamily`) only support Indian TDS.
*   **Risk:** The system cannot legally operate in the EU (VAT compliance), USA (Sales Tax Nexus), or UAE without significant refactoring. It is currently a "Localized ERP" marketed as "Global".
*   **Recommendation:** Implement a proper **Compliance Pack** architecture. Load tax rules, date formats, and labels dynamically based on the `workspace.countryCode` instead of hardcoded ternary operators.

### 3.2 Hardcoded Transactional Strings
*   **Issue:** Transactional email templates (`lib/notifications/transactional-email-templates.ts`) have hardcoded English subjects and body text.
*   **Risk:** Non-English speaking users will receive English emails, breaking the professional persona of the ERP.
*   **Recommendation:** Integrate `next-intl` or a similar library into the mailer logic to support localized email templates.

---

## 4. Security & Robustness (Medium-High Risk)

### 4.1 Lack of Schema Validation (Zod)
*   **Issue:** API routes like `/api/generate` use manual `typeof` and `null` checks for input validation.
*   **Risk:** "NaN poisoning", injection of unexpected fields, and brittle code. Manual validation is inconsistent across the codebase.
*   **Recommendation:** Standardize on **Zod** for all request body and query parameter validation.

### 4.2 Sequential Background Jobs
*   **Issue:** Heavy tasks like OCR and PDF generation are often triggered in-line or in sequential loops within API routes.
*   **Risk:** Requests will timeout on serverless platforms (Vercel has a 10s-60s limit). If one OCR job in a batch of 10 hangs, the entire request fails.
*   **Recommendation:** Move heavy processing to a background worker queue (e.g., **Upstash QStash**, **BullMQ**, or **Temporal**).

---

## 5. Module Maturity

*   **Payroll:** Explicitly marked as "Alpha/Preview" with read-only guards.
*   **Workforce:** Early-stage implementation.
*   **Risk:** Marketing these as "Production Ready" during a mass launch will lead to high churn and support overhead.
*   **Recommendation:** Clearly label "Beta" modules in the UI and consider a staged rollout for advanced features.

---

## Summary of Action Items

1.  **DB:** Switch to PostgreSQL.
2.  **Logic:** Refactor `calculateInvoiceTotals` to use `Decimal` exclusively.
3.  **i18n:** Remove `isIndia` ternary logic; use a registry of country-specific configurations.
4.  **Validation:** Implement Zod schemas for all API routes.
5.  **Performance:** Offload PDF/OCR to background queues.
