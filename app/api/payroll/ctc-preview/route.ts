import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { buildStructureFromCtc } from '@/lib/payroll/engine/ctc';
import { computePayslip } from '@/lib/payroll/engine/engine';
import { fyOf } from '@/lib/payroll/service/period';
import { ctcPreviewSchema } from '@/lib/payroll/service/schemas';

/** Splits a CTC into components and shows the take-home for a typical full month. Pure maths, nothing is saved. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const d = ctcPreviewSchema.parse(await readJson(req));
    const built = buildStructureFromCtc({ annualCtc: d.annualCtc, basicPercentOfCtc: d.basicPercentOfCtc, hraPercentOfBasic: d.hraPercentOfBasic, pfEnabled: d.pfEnabled, pfOnActualBasic: d.pfOnActualBasic });
    const structure = d.components ? { ...built, components: d.components, monthlyGross: d.components.reduce((s, c) => s + c.monthly, 0) } : built;
    const fy = fyOf(new Date());
    const slip = computePayslip({
      periodStart: `${fy.startYear}-04-01`, periodEnd: `${fy.startYear}-04-30`, fy: fy.label, fyMonth: 1,
      components: structure.components, adjustments: [], loanInstalments: [],
      statutory: { pfEnabled: d.pfEnabled, pfOnActualBasic: d.pfOnActualBasic, esiEnabled: d.esiEnabled, ptState: d.ptState ?? null, hasPan: d.hasPan },
      tax: { regime: d.taxRegime, oldRegimeDeductions: d.oldRegimeDeductions, ytdTaxableEarnings: 0, ytdTds: 0, ytdProfessionalTax: 0, ytdEmployeePf: 0 },
      lopBasis: 'CALENDAR_DAYS',
    });
    return NextResponse.json({ ...structure, preview: { gross: slip.totals.gross, deductions: slip.totals.totalDeductions, netPay: slip.totals.netPay, employerCost: slip.totals.employerCost, lines: slip.deductions, warnings: slip.warnings } });
  } catch (e) {
    return payrollErrorResponse(e, 'ctc-preview');
  }
}
