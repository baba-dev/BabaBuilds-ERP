import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const trimmed = typeof v === "string" ? v.trim() : "";
      return trimmed.length > 0 ? trimmed : null;
    });

const optionalId = z
  .string()
  .max(64)
  .nullish()
  .transform((v) => {
    const trimmed = typeof v === "string" ? v.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  });

export const MAX_SERVICE_PRICE = 1_000_000_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const serviceFieldsSchema = z.object({
  name: z.string().trim().min(1, "Service name is required.").max(120, "Service name is too long (120 characters max)."),
  description: optionalText(200),
  longDescription: optionalText(20_000),
  defaultPrice: z.coerce
    .number({ message: "Enter a valid price." })
    .finite("Enter a valid price.")
    .min(0, "Price cannot be negative.")
    .max(MAX_SERVICE_PRICE, "Price is too large."),
  nicCodeId: optionalId,
  sacCodeId: optionalId,
});

export type ServiceFields = z.infer<typeof serviceFieldsSchema>;

/** Reads the multipart fields the catalog form posts. */
export function parseServiceForm(formData: FormData) {
  const raw: Record<string, FormDataEntryValue | undefined> = {};
  for (const key of ["name", "description", "longDescription", "defaultPrice", "nicCodeId", "sacCodeId"]) {
    const value = formData.get(key);
    raw[key] = typeof value === "string" ? value : undefined;
  }
  return serviceFieldsSchema.safeParse(raw);
}

/** Case-insensitive name comparison used for the duplicate-name guard. */
export function sameServiceName(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}
