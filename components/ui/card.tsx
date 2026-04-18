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
          "rounded-2xl border border-border/70 bg-card/80 shadow-[0_18px_40px_-22px_color-mix(in_oklab,var(--foreground)_40%,transparent)] ring-foreground/10 backdrop-blur-xl backdrop-saturate-150",
        tinted:
          "rounded-xl border border-indigo-200/60 bg-indigo-50/50 shadow-sm ring-indigo-300/30 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:ring-indigo-700/30",
        "accent-highlighted":
          "rounded-xl border border-indigo-300/70 bg-gradient-to-br from-indigo-50/80 via-card to-card shadow-md ring-indigo-300/40 dark:border-indigo-700/60 dark:from-indigo-950/30 dark:ring-indigo-700/30",
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

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
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
