import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "group/card flex flex-col gap-6 overflow-hidden py-6 text-sm text-card-foreground ring-1 transition-all duration-200 ease-out has-[>img:first-child]:pt-0 data-[size=sm]:gap-4 data-[size=sm]:py-4 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  {
    variants: {
      size: {
        default: "",
        sm: "",
      },
      variant: {
        default: "rounded-xl bg-card shadow-xs ring-foreground/10",
        elevated:
          "rounded-xl bg-card shadow-md ring-foreground/10 hover:-translate-y-0.5 hover:shadow-lg",
        glass:
          "rounded-2xl border border-border/70 bg-[color:var(--color-panel-glass,var(--color-surface-glass,var(--color-card)))] shadow-[0_18px_40px_-22px_color-mix(in_oklab,var(--foreground)_40%,transparent)] ring-foreground/10 backdrop-blur-xl backdrop-saturate-150",
        panel:
          "rounded-xl border border-border/70 bg-[color:var(--color-panel,var(--color-surface-elevated,var(--color-card)))] shadow-xs ring-foreground/10",
        "panel-muted":
          "rounded-xl border border-border/70 bg-[color:var(--color-panel-muted,var(--color-surface-base,var(--color-muted)))] shadow-none ring-transparent",
        /**
         * Legacy-ish variants kept for compatibility with existing call sites,
         * but expressed in token terms (intent-based, not hue-based).
         */
        tinted:
          "rounded-xl border border-border/70 bg-[color:color-mix(in_oklab,var(--color-panel-muted,var(--color-surface-base,var(--color-muted)))_86%,var(--color-accent-info,var(--color-chart-2)))] shadow-sm ring-foreground/10 dark:border-border/60 dark:bg-[color:color-mix(in_oklab,var(--color-panel-muted,var(--color-surface-base,var(--color-muted)))_82%,var(--color-accent-info,var(--color-chart-2)))]",
        "accent-highlighted":
          "rounded-xl border border-border/70 bg-[color:color-mix(in_oklab,var(--color-panel,var(--color-surface-elevated,var(--color-card)))_90%,var(--color-accent-info,var(--color-chart-2)))] shadow-md ring-foreground/10",
        quiet: "rounded-xl border border-border/70 bg-muted/30 shadow-none ring-transparent",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        cardVariants({ size, variant }),
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-6 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-6 group-data-[size=sm]/card:[.border-b]:pb-4",
        className
      )}
      {...props}
    />
  )
}

type CardTitleProps = React.ComponentProps<"div"> & {
  /** Render as a semantic heading. Defaults to a plain `div` (no outline change). */
  as?: "div" | "h1" | "h2" | "h3" | "h4"
}

function CardTitle({ as: Tag = "div", className, ...props }: CardTitleProps) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 group-data-[size=sm]/card:px-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl px-6 group-data-[size=sm]/card:px-4 [.border-t]:pt-6 group-data-[size=sm]/card:[.border-t]:pt-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  cardVariants,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
