type InvoiceGenerateFieldError = {
  field?: unknown;
  message?: unknown;
};

const normalizeFieldErrors = (fieldErrors: unknown): InvoiceGenerateFieldError[] => {
  if (Array.isArray(fieldErrors)) {
    return fieldErrors.filter(
      (entry): entry is InvoiceGenerateFieldError =>
        !!entry && typeof entry === "object"
    );
  }

  if (fieldErrors && typeof fieldErrors === "object") {
    return [fieldErrors as InvoiceGenerateFieldError];
  }

  return [];
};

export const buildInvoiceGenerateErrorMessage = (
  payload: unknown,
  fallback: string
): string => {
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as {
    error?: unknown;
    fields?: unknown;
  };

  if (typeof record.error === "string" && record.error.trim().length > 0) {
    if (record.error !== "Validation failed") return record.error;

    const fieldErrors = normalizeFieldErrors(record.fields)
      .map((entry) => {
        const message = typeof entry.message === "string" ? entry.message.trim() : "";
        const field = typeof entry.field === "string" ? entry.field.trim() : "";
        if (!message) return "";
        return field ? `${field}: ${message}` : message;
      })
      .filter(Boolean);

    if (fieldErrors.length > 0) {
      return fieldErrors.join(" ");
    }
  }

  return fallback;
};
