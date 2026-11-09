"use client";

import { useTranslations } from "next-intl";
import { Panel, ReadOnlyBanner, SecretField } from "../form-kit";
import type { SectionProps } from "./types";

export function AiSection({ data, canManage, reload }: SectionProps) {
  const t = useTranslations("SettingsHub.ai");
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("title")} description={t("hint")}>
        <SecretField secretKey="groqApiKey" label={t("key")} configured={!!data.hasGroqApiKey} disabled={!canManage} onChanged={reload} hint={t("keyHint")} />
      </Panel>
      <Panel title={t("usedFor")}>
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">{(["u1", "u2", "u3"] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("privacy")}</p>
      </Panel>
    </div>
  );
}

