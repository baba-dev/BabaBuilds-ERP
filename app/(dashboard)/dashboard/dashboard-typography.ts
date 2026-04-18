import { typography, tx } from "@/lib/ui/typography";

export const dashboardTypography = {
  sectionTitle: typography.sectionTitle,
  cardTitle: typography.cardTitle,
  cardSubtitle: typography.cardSubtitle,
  labelUpper: typography.labelUpper,
  labelUpperStrong: typography.labelUpperStrong,
  value4xlLight: typography.metricValueXl,
  value3xlLight: typography.metricValueLg,
  value2xlLight: typography.metricValueMd,
  valueSmBold: typography.metricValueSm,
  helper: typography.helper,
  helperXs: typography.helperXs,
  kpiBadge: typography.kpiBadge,
} as const;

export const dt = tx;
