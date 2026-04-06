"use client";

import { Input } from "@/components/ui/input";
import { FormFieldMessages } from "@/components/forms/form-primitives";
import { cn } from "@/lib/utils";

type FileUploadFieldProps = {
  id?: string;
  accept?: string;
  onFileSelect: (file: File | null) => void;
  helpText?: string;
  errorText?: string;
  className?: string;
  inputClassName?: string;
};

export function FileUploadField({
  id,
  accept,
  onFileSelect,
  helpText,
  errorText,
  className,
  inputClassName,
}: FileUploadFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Input
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
        className={cn(
          "h-10 pt-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-2.5 file:py-1 file:text-xs file:font-semibold cursor-pointer",
          inputClassName,
        )}
      />
      <FormFieldMessages helpText={helpText} errorText={errorText} />
    </div>
  );
}
