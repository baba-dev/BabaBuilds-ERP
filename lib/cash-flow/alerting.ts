import "server-only";
import { prisma } from "@/lib/prisma";
import { computeAllScenarios } from "@/lib/cash-flow/forecast-engine";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

const DAY = 86_400_000;
/** Do not repeat the same warning more often than this. */
export const ALERT_COOLDOWN_DAYS = 3;
/** Only a shortfall this close is worth waking someone for. */
export const ALERT_LOOKAHEAD_DAYS = 45;

/** Tell the team when the base forecast falls under the cash cushion soon, once per distinct warning, respecting the alert switches. Returns whether a message went out. */
export async function alertOnShortfall(workspaceId: string, now = new Date(), prefetched?: Awaited<ReturnType<typeof computeAllScenarios>>): Promise<boolean> {
  const prefs = await prisma.cashForecastAlertPreference.findUnique({ where: { workspaceId } });
  const critical = prefs?.criticalEnabled ?? true;
  const warning = prefs?.warningEnabled ?? true;
  if (!critical && !warning) return false;
  const { results } = prefetched ?? (await computeAllScenarios({ workspaceId, horizonType: "WEEKLY_13", now }));
  const base = results.BASE;
  if (!base.crunchDate || !base.lowestCashDate) return false;
  const days = Math.round((base.crunchDate.getTime() - now.getTime()) / DAY);
  if (days > ALERT_LOOKAHEAD_DAYS) return false;
  const severity = base.lowestCash.lt(0) ? "critical" : "warning";
  if ((severity === "critical" && !critical) || (severity === "warning" && !warning)) return false;
  const key = `${severity}:${base.crunchDate.toISOString().slice(0, 10)}`;
  if (prefs?.lastAlertKey === key && prefs.lastAlertAt && now.getTime() - prefs.lastAlertAt.getTime() < ALERT_COOLDOWN_DAYS * DAY) return false;
  const threshold = Number(base.assumptions.minimumCashThreshold ?? 0);
  const low = Number(base.lowestCash.toString());
  await dispatchNotification({
    event: "GST_REMINDER",
    workspaceId,
    data: {
      title: severity === "critical" ? "Cash is forecast to run out" : "Cash is forecast to run low",
      body: `The lowest forecast balance is ${Math.round(low).toLocaleString("en-IN")} around ${base.lowestCashDate.toISOString().slice(0, 10)}${threshold > 0 ? ` (your cushion is ${Math.round(threshold).toLocaleString("en-IN")})` : ""}. Open Cash Flow to see what to chase or defer.`,
      actionUrl: "/cash-flow",
    },
  });
  await prisma.cashForecastAlertPreference.upsert({ where: { workspaceId }, update: { lastAlertAt: now, lastAlertKey: key }, create: { workspaceId, lastAlertAt: now, lastAlertKey: key } });
  return true;
}
