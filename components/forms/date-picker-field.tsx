"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerFieldProps = {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder: string;
  formatString?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
};

export function DatePickerField({
  value,
  onChange,
  placeholder,
  formatString = "dd/MM/yyyy",
  className,
  buttonClassName,
  disabled,
}: DatePickerFieldProps) {
  const safeFormat = formatString.replace(/D/g, "d").replace(/Y/g, "y");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full h-11 justify-start text-left font-semibold", buttonClassName)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
          {value ? format(value, safeFormat) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", className)} align="start">
        <Calendar mode="single" selected={value} onSelect={(date) => date && onChange(date)} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
