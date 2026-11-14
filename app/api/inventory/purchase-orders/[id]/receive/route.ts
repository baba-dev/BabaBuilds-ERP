import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { loadGstProfile } from "@/lib/gst/data";
import { normalizeExpenseGst } from "@/lib/gst/expense-gst";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { isStateCode } from "@/lib/gst/states";
import { resolveVendor } from "@/lib/expenses/vendors";

const receiveSchema = z.object({
  syncExpense: z.boolean().optional(),
  supplierGstin: z.string().trim().max(20).nullish(),
  supplierInvoiceNo: z.string().trim().max(60).nullish(),
  supplierStateCode: z.string().trim().max(2).nullish(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const poId = id;

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, workspaceId },
      include: { items: true }
    });

    if (!po) {
      return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
    }

    if (po.status === "DELIVERED") {
      return NextResponse.json({ error: "Purchase Order is already delivered" }, { status: 400 });
    }

    const parsedBody = receiveSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) return NextResponse.json({ error: "Invalid receive request.", code: "INVALID_BODY" }, { status: 400 });
    const { syncExpense } = parsedBody.data; // Boolean flag from UI to log expense
    const supplierGstin = normalizeGstin(parsedBody.data.supplierGstin ?? po.supplierGstin) || null;
    if (supplierGstin && !validateGstin(supplierGstin).valid) {
      return NextResponse.json({ error: "The supplier GSTIN is not valid.", code: "VENDOR_GSTIN_INVALID" }, { status: 422 });
    }
    const supplierInvoiceNo = (parsedBody.data.supplierInvoiceNo ?? po.supplierInvoiceNo) || null;
    const chosenState = parsedBody.data.supplierStateCode ?? po.supplierStateCode;
    const supplierStateCode = supplierGstin ? null : chosenState && isStateCode(chosenState) ? chosenState : null;
    const gstinCheck = validateGstin(supplierGstin);
    const vendorState = gstinCheck.valid ? gstinCheck.stateCode : supplierStateCode;
    const products = await prisma.product.findMany({ where: { workspaceId, id: { in: po.items.map((i) => i.productId) } }, select: { id: true, hsnCode: true, gstRate: true } });
    const productById = new Map(products.map((p) => [p.id, p]));

    const transactionTasks: Prisma.PrismaPromise<unknown>[] = [];

    // 1. Update PO Status
    transactionTasks.push(
      prisma.purchaseOrder.update({
        where: { id: poId },
        data: { status: "DELIVERED", supplierGstin, supplierInvoiceNo, supplierStateCode: vendorState }
      })
    );

    // 2. Add Stock and Movement for each item
    for (const item of po.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, workspaceId } });
      if (product) {
        const newStock = product.currentStock + item.quantity;
        transactionTasks.push(
          prisma.product.update({
            where: { id: item.productId },
            data: {
              currentStock: newStock,
              status: newStock === 0 ? "OUT_OF_STOCK" : (newStock <= product.safetyStock ? "LOW_STOCK" : "IN_STOCK")
            }
          })
        );
        transactionTasks.push(
          prisma.inventoryMovement.create({
            data: {
              workspaceId,
              productId: item.productId,
              type: "IN",
              quantity: item.quantity,
              reason: `PO #${po.poNumber} Received`,
              referenceId: po.id
            }
          })
        );
      }
    }

    // 3. Sync the purchase bill if requested. Vendor GSTIN, HSN and the CGST/SGST/IGST split travel with it so
    // input tax credit is not re-keyed. PO prices exclude GST, so tax is added per line from the line (or product) rate.
    if (syncExpense) {
      const gstProfile = await loadGstProfile(workspaceId);
      // The bill is linked to the supplier record and to this PO. A PO with payment terms is a bill on credit: it shows up under
      // bills to pay, lands in the cash forecast on its due date, and is paid when the bank debit is matched.
      const supplierRow = await resolveVendor(prisma, workspaceId, po.supplier, { gstin: supplierGstin, stateCode: vendorState, category: "Inventory Restock" });
      const onCredit = (po.paymentTermsDays ?? 0) > 0 || Boolean(po.expectedPaymentDate);
      const billDate = new Date();
      const poDueDate = onCredit ? po.expectedPaymentDate ?? new Date(billDate.getTime() + (po.paymentTermsDays ?? 0) * 86_400_000) : null;
      const poLink = { vendorId: supplierRow?.id ?? null, purchaseOrderId: po.id, source: "PO", dueDate: poDueDate };
      const paymentStatus = onCredit ? "UNPAID" : "PAID";
      const alreadyBilled = (await prisma.expense.count({ where: { workspaceId, purchaseOrderId: po.id } })) > 0;
      const groups = new Map<string, { rate: number | null; net: number; hsn: string | null }>();
      for (const item of po.items) {
        const product = productById.get(item.productId);
        const rate = item.gstRate ?? product?.gstRate ?? null;
        const key = rate === null ? "none" : String(rate);
        const net = Number(item.expectedTotal);
        const g = groups.get(key) ?? { rate, net: 0, hsn: item.hsnCode ?? product?.hsnCode ?? null };
        g.net += net;
        g.hsn = g.hsn ?? item.hsnCode ?? product?.hsnCode ?? null;
        groups.set(key, g);
      }
      const registered = !!supplierGstin;
      const ordered = Array.from(groups.values());
      const anyRate = ordered.some((g) => g.rate !== null && g.rate > 0);
      if (!anyRate) {
        // Nothing to split: one bill for the PO total, exactly as before (the vendor details still ride along).
        const gst = normalizeExpenseGst({ itcStatus: "NONE", paymentStatus, vendorGstin: supplierGstin, vendorInvoiceNo: supplierInvoiceNo, vendorStateCode: vendorState, hsnCode: ordered[0]?.hsn ?? null }, Number(po.totalAmount), gstProfile.stateCode);
        if (!alreadyBilled) transactionTasks.push(
          prisma.expense.create({
            data: { workspaceId, vendor: po.supplier, amount: po.totalAmount, category: "Inventory Restock", description: `Auto-generated expense for PO #${po.poNumber}`, date: billDate, ...poLink, ...(gst.ok ? gst.data : {}) },
          }),
        );
      } else {
        for (const g of ordered) {
          const rate = g.rate ?? 0;
          const gross = Math.round(g.net * (1 + rate / 100) * 100) / 100;
          const gst = normalizeExpenseGst({ itcStatus: registered && rate > 0 ? "ELIGIBLE" : "NONE", paymentStatus, vendorGstin: supplierGstin, vendorInvoiceNo: supplierInvoiceNo, vendorStateCode: vendorState, hsnCode: g.hsn, gstRate: rate > 0 ? rate : null }, gross, gstProfile.stateCode);
          if (!gst.ok) return NextResponse.json({ error: gst.message, code: gst.code }, { status: 422 });
          if (!alreadyBilled) transactionTasks.push(
            prisma.expense.create({
              data: { workspaceId, vendor: po.supplier, amount: gross, category: "Inventory Restock", description: `Auto-generated expense for PO #${po.poNumber}${rate > 0 ? ` (GST ${rate}%)` : ""}`, date: billDate, ...poLink, ...gst.data },
            }),
          );
        }
      }
    }

    await prisma.$transaction(transactionTasks);

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'purchase_order', action: 'receive', error: String(error) });
    }

    return NextResponse.json({ success: true, message: `PO #${po.poNumber} Received Successfully` });
  } catch (error: unknown) {
    console.error("[PO_RECEIVE]", error);
    return NextResponse.json({ error: "Failed to receive Purchase Order" }, { status: 500 });
  }
}
