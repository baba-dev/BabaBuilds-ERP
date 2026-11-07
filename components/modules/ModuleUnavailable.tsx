import Link from 'next/link';
import { Lock } from 'lucide-react';
import { MODULE_DESCRIPTIONS, MODULE_LABELS, type ModuleAvailability, type ModuleKey } from '@/lib/modules';

type Props = {
  moduleKey: ModuleKey;
  /** Anything other than 'enabled' is a reason to render this panel. */
  reason: Exclude<ModuleAvailability, 'enabled'>;
};

const linkBase =
  'rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600';

/**
 * Rendered in place of a module's pages when the module can't be used, instead of silently
 * redirecting. Server component: no client JS, and the URL stays where the user tried to go.
 */
export function ModuleUnavailable({ moduleKey, reason }: Props) {
  const label = MODULE_LABELS[moduleKey];
  const needsPlan = reason === 'plan_required';

  return (
    <div className="min-h-[60vh] p-4 md:p-8">
      <section
        aria-labelledby="module-unavailable-title"
        className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-500">{label}</p>
        <h1
          id="module-unavailable-title"
          className="mt-2 flex items-center gap-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl"
        >
          <Lock aria-hidden className="h-7 w-7 shrink-0 text-amber-700 dark:text-amber-500" />
          {needsPlan ? `${label} needs a paid plan` : `${label} is turned off`}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{MODULE_DESCRIPTIONS[moduleKey]}</p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          {needsPlan
            ? 'This workspace does not have an active paid plan, so the module is unavailable. Your existing data is kept.'
            : 'It is switched off for this workspace. Your existing data is preserved and returns when you turn it back on.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {needsPlan ? (
            <Link
              href="/settings/billing"
              className={`${linkBase} bg-amber-700 text-white hover:bg-amber-800`}
            >
              View plans
            </Link>
          ) : (
            <Link
              href="/settings#workspace-modules"
              className={`${linkBase} bg-amber-700 text-white hover:bg-amber-800`}
            >
              Enable in Settings
            </Link>
          )}
          <Link
            href="/dashboard"
            className={`${linkBase} border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`}
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
