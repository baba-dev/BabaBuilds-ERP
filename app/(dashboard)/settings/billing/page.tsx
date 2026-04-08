import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import BillingSettingsClient from "./BillingSettingsClient";

export default async function BillingSettingsPage() {
  const session = await getServerSession(authOptions);
  const scopedSession = session as (typeof session & {
    workspaceId?: string;
    locale?: string;
    baseCurrency?: string;
    user?: { currencyFormat?: string };
  }) | null;

  if (!scopedSession?.workspaceId) {
    redirect("/");
  }

  const workspaceId = scopedSession.workspaceId;
  const locale = scopedSession.locale || "en-IN";
  const currency =
    scopedSession.user?.currencyFormat ||
    scopedSession.baseCurrency ||
    "INR";

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      planInterval: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProviderId: true,
      _count: { select: { clients: true } },
    },
  });

  if (!workspace) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="sticky top-0 z-30 -mx-4 px-4 py-6 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300 text-center space-y-2 mb-10">
          <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20 mb-4 transition-transform hover:scale-105">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Billing & Plan
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-sm font-medium">
            Manage your subscription tier, payment methods, and download past receipts.
          </p>
        </div>

        <div className="space-y-8">
          
          {/* CURRENT PLAN CARD */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <Zap className="w-5 h-5 text-indigo-600" /> Current Subscription
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Your active plan and system limits.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {isPro ? `Pro Agency Plan (${workspace.planInterval || 'YEARLY'})` : "Free Starter Plan"}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest ${
                      isPro 
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50" 
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                    }`}>
                      {workspace.subscriptionStatus}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                    {isPro 
                      ? `Your subscription auto-renews on ${workspace.subscriptionEndsAt?.toLocaleDateString(locale) || 'next billing cycle'}.` 
                      : "Perfect for freelancers and micro-agencies just starting out."}
                  </p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{formatMoney(activePrice)}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">{intervalText}</p>
                </div>
              </div>

              {!isPro && (
                <>
                  <Separator className="dark:bg-zinc-800" />
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Client CRM Usage</h3>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-1">You are using {clientCount} out of {clientLimit} free clients.</p>
                      </div>
                      <span className={`text-sm font-bold ${clientCount >= clientLimit ? 'text-rose-600 dark:text-rose-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {clientCount} / {clientLimit}
                      </span>
                    </div>
                    
                    <div className="h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-zinc-200/50 dark:border-zinc-700">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          clientCount >= clientLimit ? 'bg-rose-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${usagePercentage}%` }}
                      />
                    </div>

                    {clientCount >= clientLimit && (
                      <div className="mt-4 flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                          You've hit the maximum client limit for the Free plan. To add more clients and grow your business, upgrade to the Pro plan below.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
            {isPro && (
              <CardFooter className="bg-zinc-50 dark:bg-zinc-950/50 border-t dark:border-zinc-800 p-4">
                 <Button variant="outline" className="w-full sm:w-auto text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-500 dark:hover:bg-rose-900/20 text-xs font-bold uppercase tracking-widest">
                   Cancel Subscription
                 </Button>
              </CardFooter>
            )}
          </Card>

          {/* THE PRO UPGRADE PITCH (Interactive Component) */}
          {!isPro && (
            <ProUpgradeCard locale={locale} currency={currency} />
          )}

          {/* PAYMENT METHODS (Vault) */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-500" /> Payment Vault
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Manage how you pay for your subscription.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {workspace.paymentMethodMask ? (
                <div className="flex items-center justify-between p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-sm">
                      <CreditCard className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">{workspace.paymentMethodMask}</p>
                      <p className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 mt-0.5">Primary Method</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest border-none">Active</Badge>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/30">
                   <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">No payment methods saved.</p>
                </div>
              )}
              
              <Button variant="outline" className="mt-4 w-full sm:w-auto text-xs font-bold uppercase tracking-widest dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Plus className="w-4 h-4 mr-2" /> Add Payment Method
              </Button>
            </CardContent>
          </Card>

          {/* BILLING HISTORY CARD */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <Receipt className="w-5 h-5 text-zinc-600 dark:text-zinc-400" /> Billing History
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Download past invoices and receipts for your records.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {billingHistory.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-4">
                    <Receipt className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                  </div>
                  <p className="text-zinc-900 dark:text-zinc-200 font-bold uppercase tracking-widest text-sm">No billing history yet.</p>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">Your receipts will appear here once you upgrade.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {billingHistory.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">{inv.date}</td>
                          <td className="px-6 py-4 text-xs text-zinc-900 dark:text-zinc-100 font-bold">{inv.plan}</td>
                          <td className="px-6 py-4 text-xs font-black text-indigo-700 dark:text-indigo-400">{inv.amount}</td>
                          <td className="px-6 py-4">
                            <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-widest">
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 p-2 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900"
                              aria-label={`Download receipt for ${inv.plan} on ${inv.date}`}
                              title="Download receipt"
                            >
                              <Download className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
