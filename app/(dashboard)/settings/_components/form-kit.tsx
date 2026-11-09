"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PREFILL_KEYS, readAiPrefill, type PrefillSection } from "@/lib/settings/ai-prefill";
import { useDirty, useSettingsData } from "./settings-data";

/** A labelled control. The label is bound to the control through `id`, errors are announced, hints are described. */
export function Field({ label, hint, error, required, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; required?: boolean; children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode; className?: string; htmlFor?: string }) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="ms-0.5 text-rose-500" aria-hidden>*</span> : null}
      </Label>
      {children({ id, "aria-describedby": descId, "aria-invalid": error ? true : undefined })}
      {error ? <p id={descId} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p> : hint ? <p id={descId} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, description, children, className, right }: { title?: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card shadow-sm", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0"><h2 className="text-sm font-semibold tracking-tight">{title}</h2>{description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}</div>
          {right}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ReadOnlyBanner() {
  const t = useTranslations("SettingsHub");
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <Lock className="size-4 shrink-0" aria-hidden />{t("readOnly")}
    </p>
  );
}

type FieldErrors = Record<string, string>;

/**
 * Edit state for one section: values, dirty tracking, field errors from the server, and a save that only sends this
 * section. `toPayload` turns the edit values into the API values.
 */
export function useSectionForm<T extends Record<string, unknown>>(args: { section: string; initial: T; /** Section whose AI-suggested values should be merged in on first render. */ prefill?: PrefillSection; toPayload?: (v: T) => Record<string, unknown>; onSaved?: (changed: string[]) => void }) {
  const t = useTranslations("SettingsHub");
  const { reload } = useSettingsData();
  const { setDirty } = useDirty();
  const [values, setValues] = useState<T>(() => {
    if (!args.prefill) return args.initial;
    const hint = readAiPrefill();
    if (!hint) return args.initial;
    const next = { ...args.initial } as Record<string, unknown>;
    for (const k of PREFILL_KEYS[args.prefill]) if (hint[k] && k in next) next[k] = hint[k];
    return next as T;
  });
  const [saved, setSaved] = useState<T>(args.initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => { if (!e[key as string]) return e; const next = { ...e }; delete next[key as string]; return next; });
    setJustSaved(false);
  }, []);
  const reset = useCallback(() => { setValues(saved); setErrors({}); }, [saved]);

  const save = useCallback(async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: args.section, values: args.toPayload ? args.toPayload(values) : values }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; fields?: Array<{ field: string; code: string }>; changed?: string[] };
      if (!res.ok) {
        if (body.fields?.length) {
          const next: FieldErrors = {};
          for (const f of body.fields) next[f.field] = t.has(`errors.${f.code}`) ? t(`errors.${f.code}`) : t("errors.INVALID");
          setErrors(next);
          toast.error(t("fixFields"));
        } else toast.error(body.code && t.has(`errors.${body.code}`) ? t(`errors.${body.code}`) : body.error ?? t("saveFailed"));
        return false;
      }
      setSaved(values);
      setJustSaved(true);
      toast.success(t("saved"));
      reload();
      args.onSaved?.(body.changed ?? []);
      return true;
    } catch {
      toast.error(t("networkError"));
      return false;
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- args.toPayload/onSaved are inline closures; values is the real input
  }, [values, args.section, reload, t]);

  return { values, set, errors, dirty, saving, justSaved, save, reset };
}

/** Sticks to the bottom of the section while there is something to save. */
export function SaveBar({ dirty, saving, justSaved, onSave, onReset, disabled }: { dirty: boolean; saving: boolean; justSaved: boolean; onSave: () => void; onReset: () => void; disabled?: boolean }) {
  const t = useTranslations("SettingsHub");
  if (disabled) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-6">
      <motion.div initial={false} animate={{ opacity: dirty || justSaved ? 1 : 0.0, y: dirty || justSaved ? 0 : 12 }} transition={{ duration: 0.18 }} aria-hidden={!dirty && !justSaved} className={cn("flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-lg backdrop-blur", !dirty && !justSaved && "pointer-events-none")}>
        <p className="flex items-center gap-2 text-sm" role="status">
          {dirty ? <><span className="size-2 rounded-full bg-amber-500" aria-hidden />{t("unsavedChanges")}</> : <><CheckCircle2 className="size-4 text-emerald-600" aria-hidden />{t("allSaved")}</>}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={!dirty || saving}>{t("discard")}</Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>{saving ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * A secret the server keeps: shows "configured" (never the value), lets you replace or remove it, and saves on its own
 * through /api/settings/secrets so it never travels with the rest of a form.
 */
export function SecretField({ secretKey, label, configured, disabled, onChanged, placeholder, hint }: { secretKey: "smtpPassword" | "groqApiKey" | "razorpayKeySecret" | "stripeSecretKey"; label: React.ReactNode; configured: boolean; disabled?: boolean; onChanged: () => void; placeholder?: string; hint?: React.ReactNode }) {
  const t = useTranslations("SettingsHub.secret");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function put(next: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/secrets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: secretKey, value: next }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast.error(body.error ?? t("failed")); return; }
      toast.success(next === null ? t("removed") : t("stored"));
      setEditing(false); setValue(""); onChanged();
    } catch { toast.error(t("failed")); } finally { setBusy(false); }
  }

  return (
    <Field label={label} hint={hint}>
      {({ id, ...aria }) => configured && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span id={id} className="flex h-10 flex-1 items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />{t("configured")}</span>
          <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => setEditing(true)}>{t("replace")}</Button>
          <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => { if (window.confirm(t("confirmRemove"))) void put(null); }} aria-label={t("remove")} className="text-rose-600"><Trash2 className="size-4" aria-hidden /></Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input id={id} {...aria} ref={inputRef} type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder ?? t("placeholder")} disabled={disabled || busy} onKeyDown={(e) => { if (e.key === "Enter" && value) void put(value); }} />
          <Button type="button" disabled={disabled || busy || !value} onClick={() => void put(value)}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : t("store")}</Button>
          {editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(false); setValue(""); }}>{t("cancel")}</Button> : null}
        </div>
      )}
    </Field>
  );
}
