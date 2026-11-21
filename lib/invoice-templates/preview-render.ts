import "server-only";
import { generateInvoicePDF } from "@/lib/pdf/generator";
import type { PDFParams } from "@/lib/invoice/build-invoice-view-model";

const MAX_CONCURRENT_RENDERS = 2;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_RENDERS) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight over
  else active -= 1;
}

/** Renders a preview PDF; at most two renders run at once so a page of tiles cannot starve the ARM VPS. */
export async function renderPreviewPdf(params: PDFParams): Promise<Uint8Array> {
  await acquire();
  try {
    return await generateInvoicePDF(params);
  } finally {
    release();
  }
}
