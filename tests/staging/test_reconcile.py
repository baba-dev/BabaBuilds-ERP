"""Financial invariant unit tests use only synthetic records."""
import importlib.util
from pathlib import Path
import unittest

module = Path(__file__).resolve().parents[2] / "scripts/staging/reconcile.py"
spec = importlib.util.spec_from_file_location("reconcile", module)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class FinancialInvariantsTest(unittest.TestCase):
    def invoice(self, **over):
        row = dict(id="inv", workspaceId="w1", amountReceived="20.00",
                   grandTotal="100", status="PARTIALLY_PAID")
        row.update(over)
        return row

    def payment(self, **over):
        row = dict(id="p1", workspaceId="w1", invoiceId="inv", amount="20.00")
        row.update(over)
        return row

    def test_clean(self):
        self.assertEqual(r.financial_invariants([self.invoice()], [self.payment()], []), {})

    def test_payment_mismatch(self):
        mismatches = r.financial_invariants([self.invoice()], [self.payment(amount="19")], [])
        self.assertEqual(mismatches["INVOICE_PAYMENT_MISMATCH"], 1)

    def test_cross_workspace(self):
        mismatches = r.financial_invariants([self.invoice()], [self.payment(workspaceId="other")], [])
        self.assertEqual(mismatches["CROSS_WORKSPACE_PAYMENT"], 1)

    def test_payroll_mismatch(self):
        rows = [dict(totalEarnings="1000", totalDeductions="300", totalNetPay="701")]
        self.assertEqual(r.financial_invariants([], [], rows)["PAYROLL_NET_MISMATCH"], 1)


if __name__ == "__main__":
    unittest.main()
