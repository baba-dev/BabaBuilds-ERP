import { KeyRound, ShieldAlert } from "lucide-react";
import type { AdminDeniedReason } from "@/lib/admin/access";

/** Shown to a person who is meant to be an admin but is missing one half of the setup. Never shown to anyone else. */
export function AdminSetupNotice({ reason, email }: { reason: AdminDeniedReason; email: string }) {
  const roleMissing = reason === "NOT_ADMIN_ROLE";
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center gap-5 px-4 py-16">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"><ShieldAlert className="size-6" aria-hidden /></span>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin access is half set up</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {roleMissing
            ? <>Your email <b>{email}</b> is on the server&apos;s super-admin list, but your account does not have the ADMIN role yet.</>
            : <>Your account <b>{email}</b> has the ADMIN role, but your email is not on the server&apos;s super-admin list.</>}{" "}
          Both are required, so a change to only one of them can never open the console.
        </p>
      </div>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm" aria-labelledby="fix-title">
        <h2 id="fix-title" className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" aria-hidden />{roleMissing ? "Give the account the ADMIN role" : "Add your email to the server"}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{roleMissing ? "Run this on the server, in the project folder:" : "Set this in the server environment (for example the .env file) and restart the app:"}</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs text-zinc-100"><code>{roleMissing ? `npm run admin:promote -- ${email}` : `SUPERADMIN_EMAILS=${email}`}</code></pre>
        <p className="mt-3 text-xs text-muted-foreground">Several admins: separate emails with commas. Details are in docs/admin-console.md.</p>
      </section>
    </main>
  );
}
