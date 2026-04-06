import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FormSectionProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function FormSection({ title, description, icon, className, children }: FormSectionProps) {
  return (
    <section className={cn("rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-5 space-y-4", className)}>
      {(title || description) && (
        <header className="space-y-1">
          {title && (
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              {icon}
              {title}
            </h3>
          )}
          {description && <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

type FormFieldRowProps = {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optionalText?: string;
  className?: string;
  children: ReactNode;
};

export function FormFieldRow({ label, htmlFor, required, optionalText, className, children }: FormFieldRowProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {!required && optionalText && <span className="normal-case font-medium text-zinc-400"> ({optionalText})</span>}
      </label>
      {children}
    </div>
  );
}

type FormFieldMessagesProps = {
  helpText?: ReactNode;
  errorText?: ReactNode;
  className?: string;
};

export function FormFieldMessages({ helpText, errorText, className }: FormFieldMessagesProps) {
  if (!helpText && !errorText) return null;

  return (
    <div className={cn("space-y-1", className)}>
      {helpText && <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{helpText}</p>}
      {errorText && <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{errorText}</p>}
    </div>
  );
}

type FormSubmitBarProps = {
  isSubmitting: boolean;
  isDisabled?: boolean;
  submitText: string;
  submittingText?: string;
  helperText?: ReactNode;
  className?: string;
};

export function FormSubmitBar({
  isSubmitting,
  isDisabled,
  submitText,
  submittingText = "Saving...",
  helperText,
  className,
}: FormSubmitBarProps) {
  return (
    <div className={cn("w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 md:justify-between", className)}>
      <div className="min-h-5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{helperText}</div>
      <Button
        type="submit"
        disabled={isSubmitting || isDisabled}
        className="w-full md:w-auto min-w-44 bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-widest text-xs"
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {submittingText}
          </span>
        ) : (
          submitText
        )}
      </Button>
    </div>
  );
}
