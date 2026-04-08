import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEDGER_META,
  parseLedgerInvoicesResponse,
  resolveLedgerErrorToastMessage,
  resolveLedgerMalformedJsonToastMessage,
} from "./fetch-invoices-response";

test("uses backend error and code for 401 diagnostics", () => {
  const message = resolveLedgerErrorToastMessage(401, {
    error: "Unauthorized",
    code: "AUTH_UNAUTHORIZED",
  });

  assert.equal(message, "Unauthorized (AUTH_UNAUTHORIZED)");
});

test("uses backend error and code for 500 diagnostics", () => {
  const message = resolveLedgerErrorToastMessage(500, {
    error: "Failed to fetch invoices",
    code: "INVOICES_FETCH_FAILED",
  });

  assert.equal(message, "Failed to fetch invoices (INVOICES_FETCH_FAILED)");
});

test("returns a specific message for malformed JSON", () => {
  assert.equal(
    resolveLedgerMalformedJsonToastMessage(),
    "Ledger response was not valid JSON. Please refresh and try again."
  );
});

test("parses serialized KPI money values and applies defaults for malformed meta fields", () => {
  const parsed = parseLedgerInvoicesResponse({
    data: [{ id: "inv-1" }],
    meta: {
      currentPage: "2",
      totalPages: null,
      kpis: {
        totalRevenue: "100.25",
        outstanding: "33.40",
        presumptiveIncome: "50.12",
      },
    },
  });

  assert.deepEqual(parsed, {
    data: [{ id: "inv-1" }],
    meta: {
      currentPage: DEFAULT_LEDGER_META.currentPage,
      totalPages: DEFAULT_LEDGER_META.totalPages,
      kpis: {
        totalRevenue: 100.25,
        outstanding: 33.4,
        presumptiveIncome: 50.12,
      },
    },
  });
});
