import type { Prisma } from '@prisma/client';
import { buildStructureFromCtc } from '@/lib/payroll/engine/ctc';
import { encrypt } from '@/lib/encryption';

export type DemoPayee = { employeeId: string; name: string; annualCtc: number; ptState?: string; regime?: 'new' | 'old'; esi?: boolean };

const safeEncrypt = (v: string): string | null => {
  try {
    return encrypt(v);
  } catch {
    return null;
  }
};

/**
 * Gives seeded employees a real pay structure, PAN and bank details so the demo can run payroll end to end.
 * Nothing is pre-run: the visitor calculates, approves and posts a month themselves.
 */
export async function seedDemoCompensation(tx: Prisma.TransactionClient, workspaceId: string, userId: string, payees: DemoPayee[], now = new Date()) {
  let i = 0;
  for (const p of payees) {
    i += 1;
    const structure = buildStructureFromCtc({ annualCtc: p.annualCtc });
    const pan = `DEMOP${String(1000 + i)}${String.fromCharCode(64 + i)}`;
    const account = `5010023456${String(1000 + i)}`;
    await tx.employeeCompensation.create({
      data: {
        workspaceId,
        employeeId: p.employeeId,
        effectiveFrom: new Date(Date.UTC(now.getUTCFullYear() - 1, 3, 1)),
        annualCtc: p.annualCtc,
        componentsJson: structure.components as unknown as Prisma.InputJsonValue,
        taxRegime: p.regime ?? 'new',
        pfEnabled: true,
        esiEnabled: Boolean(p.esi),
        ptState: p.ptState ?? 'KA',
        panEnc: safeEncrypt(pan),
        panLast4: pan.slice(-4),
        uan: `1002003004${String(10 + i)}`,
        accountHolder: p.name,
        bankName: 'HDFC Bank',
        ifsc: 'HDFC0001234',
        accountEnc: safeEncrypt(account),
        accountLast4: account.slice(-4),
        paymentMode: 'BANK_TRANSFER',
        createdByUserId: userId,
      },
    });
  }
}
