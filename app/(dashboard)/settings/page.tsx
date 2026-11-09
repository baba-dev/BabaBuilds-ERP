import type { Metadata } from "next";
import { isSectionKey } from "@/lib/settings/nav";
import { SettingsHost } from "./_components/SettingsHost";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  return <SettingsHost section={isSectionKey(section) ? section : "overview"} />;
}
