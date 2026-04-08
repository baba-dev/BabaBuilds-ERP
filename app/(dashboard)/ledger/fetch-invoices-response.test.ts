import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEDGER_META,
  parseLedgerInvoicesResponse,
  resolveLedgerErrorToastKey,
  resolveLedgerMalformedJsonToastKey,
} from "./fetch-invoices-response";

test("uses backend error and code for 401 diagnostics", () => {
  const message = resolveLedgerErrorToastKey(401, {
    error: "Unauthorized",
    code: "AUTH_UNAUTHORIZED",
  });

  assert.equal(message, "Unauthorized (AUTH_UNAUTHORIZED)");
});

test("uses backend error and code for 500 diagnostics", () => {
  const message = resolveLedgerErrorToastKey(500, {
    error: "Failed to fetch invoices",
    code: "INVOICES_FETCH_FAILED",
  });

  assert.equal(message, "Failed to fetch invoices (INVOICES_FETCH_FAILED)");
});

test("returns a specific message for malformed JSON", () => {
  assert.equal(
    resolveLedgerMalformedJsonToastKey(),
    "toast.error.malformed_json"
  );
});

test("applies defensive defaults for malformed KPI and meta fields", () => {
  const parsed = parseLedgerInvoicesResponse({
    data: [{ id: "inv-1" }],
    meta: {
      currentPage: "2",
      totalPages: null,
      kpis: {
        totalRevenue: "100",
        outstanding: NaN,
      },
    },
  });

  assert.deepEqual(parsed, {
    data: [{ id: "inv-1" }],
    meta: {
      currentPage: DEFAULT_LEDGER_META.currentPage,
      totalPages: DEFAULT_LEDGER_META.totalPages,
      kpis: DEFAULT_LEDGER_META.kpis,
    },
  });
});
