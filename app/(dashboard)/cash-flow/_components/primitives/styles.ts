export const cashFlowChrome = {
  card: [
    "group relative overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300",
    "motion-reduce:transition-none",
    "hover:-translate-y-[1px]",
    "p-[18px]",
    "shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
    "hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
  ].join(" "),
  cardPadding: "p-[18px]",
  elevationBase: "shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
  elevationHover: "hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
  hoverLift: "hover:-translate-y-[1px]",
} as const;

export const cashFlowIcon = {
  header: "h-[18px] w-[18px]",
  inline: "h-[15px] w-[15px]",
} as const;

export const cashFlowIconSm = cashFlowIcon.inline;

