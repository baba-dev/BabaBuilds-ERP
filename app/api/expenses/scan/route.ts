import { NextResponse } from "next/server";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { RECEIPT_MAX_BYTES } from "@/lib/expenses/service";
import { scanReceipt, workspaceGroqKey } from "@/lib/expenses/scan";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { scanBuffer } from "@/lib/security/clamav";
import { sniffAllowedContent } from "@/lib/uploads/private-storage";

/** Reads a bill (photo or PDF) and returns suggested fields. Nothing is saved; the person confirms in the form. */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/expenses/scan", scope: "expense-scan", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;

  const apiKey = await workspaceGroqKey(auth.ctx.workspaceId);
  if (!apiKey) return expenseError(400, "SCANNER_NOT_CONFIGURED", "The receipt scanner needs a Groq API key. Add it in Business Settings.");

  const form = await request.formData().catch(() => null);
  const file = form?.get("receipt");
  if (!(file instanceof File) || file.size === 0) return expenseError(400, "NO_FILE", "No receipt file uploaded.");
  if (file.size > RECEIPT_MAX_BYTES) return expenseError(413, "FILE_TOO_LARGE", "The receipt is too large. The limit is 8 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await scanBuffer(buffer))) return expenseError(400, "MALWARE_DETECTED", "Malware detected in uploaded file.");
  const kind = sniffAllowedContent(buffer); // trust the bytes, not the browser's label
  if (kind !== "png" && kind !== "jpeg" && kind !== "webp" && kind !== "pdf") return expenseError(415, "INVALID_FILE_TYPE", "Upload a photo (JPG, PNG, WEBP) or a PDF.");

  const result = await scanReceipt({ apiKey, buffer, kind });
  if (!result.ok) return expenseError(result.status, result.code, result.message);
  return NextResponse.json(result.data);
}
