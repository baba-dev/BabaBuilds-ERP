import Link from "next/link";

const collectedData = [
  "Account information such as name, email address, authentication provider metadata, profile details, workspace membership, and role/permission assignments.",
  "Business profile information such as company name, tax and billing details, addresses, subscription status, and ERP setup preferences.",
  "Customer, supplier, proposal, invoice, retainer, service, inventory, reconciliation, expense, receipt, tax, and reporting records that users enter or import.",
  "Documents and uploaded files, including receipts, logos, product images, signatures, invoice attachments, imported spreadsheets, and files opened through secure document routes.",
  "Payroll and workforce information such as contractor/employee names, payout records, role assignments, attendance/workforce records, and related compliance notes where enabled by the workspace.",
  "Payment metadata such as plan, invoice ID, gateway, payment status, transaction references, billing cycle, tax treatment, and settlement/refund status. We do not intentionally store full card numbers.",
  "Device and browser information, IP address, cookies/session identifiers, locale/theme preferences, push subscription endpoints, diagnostics, security logs, audit trails, and abuse-prevention signals.",
];

const purposes = [
  "Provide ERP functionality including onboarding, dashboards, invoicing, proposals, expenses, documents, payroll/workforce workflows, reporting, and exports.",
  "Authenticate users, enforce permissions, maintain sessions, secure accounts, detect abuse, investigate incidents, and prevent fraud or unauthorized access.",
  "Process subscriptions, taxes, invoices, payment confirmations, refunds/cancellations, customer support, and account administration.",
  "Send operational notifications, security notices, billing reminders, support updates, and push notifications when users opt in or configure them.",
  "Maintain backups, logs, service reliability, analytics/monitoring, compliance evidence, accounting records, and business continuity processes.",
];

const processors = [
  "Hosting, database, storage, backup, deployment, monitoring, logging, and security infrastructure providers used to run erp.bababuilds.com.",
  "Authentication providers such as Google OAuth when enabled by a workspace or user.",
  "SMTP/email delivery providers used for account, support, billing, and notification emails.",
  "Payment processors and billing providers such as Stripe and Razorpay when a workspace uses paid plans or gateway-powered collections.",
  "Cloudflare Turnstile or comparable anti-abuse providers when bot protection is enabled.",
  "Google Play services, Play App Signing, and Google Play Billing if the Android/TWA distribution adds Play-managed purchase or verification flows.",
  "Analytics, crash reporting, and application monitoring providers if configured for product reliability and security telemetry.",
  "Professional advisers, auditors, regulators, law enforcement, or successor entities when disclosure is required by law, compliance, dispute resolution, or a business transaction.",
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">BabaBuilds ERP</p>
        <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Last updated: May 9, 2026. This Privacy Policy explains how BabaBuilds ERP (&quot;BabaBuilds&quot;, &quot;we&quot;, &quot;us&quot;, and &quot;our&quot;)
          collects, uses, shares, retains, and protects information for the BabaBuilds ERP web app, installed PWA, and Trusted Web
          Activity experience for <a className="underline" href="https://erp.bababuilds.com">https://erp.bababuilds.com</a>.
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          BabaBuilds ERP is a business operations platform. Do not use the service if you are not authorized to provide your
          organization&apos;s business, customer, billing, document, payroll, or workforce information.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">1. Data we collect</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          We collect information you provide directly, information generated while using ERP features, and technical information
          needed to operate, secure, and improve the service.
        </p>
        <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {collectedData.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">2. How we use data</h2>
        <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {purposes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">We do not sell personal information.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">3. Third-party processors and sharing</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          We share information only as needed to operate the service, comply with law, protect users, complete transactions, or
          support the customer relationship. Depending on which features are enabled, recipients may include:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {processors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">4. Data retention</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          We retain account, workspace, billing, invoice, tax, audit, and security records for as long as needed to provide the
          service, meet legal/accounting obligations, resolve disputes, enforce agreements, maintain backups, and protect the
          platform. Deleted data may remain in backups or logs for a limited operational period before deletion or anonymization.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">5. User controls, export, and deletion</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Workspace administrators can update many business records from the app. To request access, correction, export,
          workspace deletion, account deletion, or consent withdrawal where applicable, email
          {" "}<a className="font-semibold underline" href="mailto:admin@bababuilds.com">admin@bababuilds.com</a>{" "}
          with your account email, workspace name, and request details (see{" "}<Link className="font-semibold underline" href="/delete-account">how to delete your account</Link>). Some records may be retained where required for tax,
          accounting, fraud prevention, legal compliance, security, or dispute-resolution purposes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">6. Security practices</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          We use administrative, technical, and organizational safeguards designed to protect data, including authenticated access,
          role-based permissions, tenant isolation, secure session handling, audit/security logging, backup controls, and file-upload
          protections where configured. No internet service is perfectly secure, so users should keep credentials confidential and
          promptly report suspected unauthorized access.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">7. Cookies, device data, and notifications</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          We use cookies, local storage, and similar technologies for login, session continuity, preferences, security, fraud
          prevention, and product reliability. Browser or device settings may limit some technologies, but disabling required session
          storage may prevent login. Push subscriptions are used only to deliver requested or operational notifications and can be
          disabled through browser or device settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">8. Children and minors</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          BabaBuilds ERP is intended for businesses and professional users. It is not directed to children, and we do not knowingly
          collect personal information from children under applicable minimum ages. Contact us if you believe a minor provided data
          without appropriate authorization.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">9. Contact</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          For privacy questions, data-safety requests, or Play Store listing inquiries, contact
          {" "}<a className="font-semibold underline" href="mailto:admin@bababuilds.com">admin@bababuilds.com</a>.
        </p>
      </section>

      <p className="text-xs text-zinc-500">
        Also review our <Link href="/terms" className="underline">Terms of Service</Link> and{" "}
        <Link href="/refund-cancellation" className="underline">Refund & Cancellation Policy</Link>.
      </p>
    </main>
  );
}
