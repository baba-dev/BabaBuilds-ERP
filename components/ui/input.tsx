"use client";

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "h-9 pointer-coarse:h-11 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-200 ease-out outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input bg-transparent dark:bg-input/30",
        tinted:
          "border-border/70 bg-muted/20 dark:border-border/60 dark:bg-input/20",
        quiet: "border-border/70 bg-muted/40 shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & VariantProps<typeof inputVariants>
>(({ className, type, variant = "default", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input, inputVariants }
