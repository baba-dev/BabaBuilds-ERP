import type { SettingsData } from "../settings-data";

export type SectionProps = { data: SettingsData; canManage: boolean; reload: () => void };
