-- Idempotent data backfill for the proposals rework (draft-first lifecycle, frozen pricing context, richMedia column).
-- Applied (a) at the end of the 20261109100000_proposal_rework migration and (b) by `npm run backfill`
-- for `prisma db push` databases (production). Safe to run repeatedly.

-- Pricing context: proposals existed only in the workspace base currency.
UPDATE "Proposal" SET "currency" = COALESCE((SELECT "baseCurrency" FROM "Workspace" WHERE "Workspace"."id" = "Proposal"."workspaceId"), 'INR') WHERE "currency" = 'INR';

-- Recover the tax rate the proposal was priced with, from its stored amounts.
UPDATE "Proposal" SET "taxRatePercent" = ROUND(CAST("estimatedTax" AS REAL) * 100.0 / CAST("subtotal" AS REAL), 2) WHERE "taxRatePercent" = 0 AND CAST("subtotal" AS REAL) > 0 AND CAST("estimatedTax" AS REAL) > 0;

-- Before the draft-first flow every saved proposal was treated as sent at creation.
UPDATE "Proposal" SET "sentAt" = "dateCreated" WHERE "sentAt" IS NULL AND "status" IN ('SENT', 'VIEWED', 'ACCEPTED', 'INVOICED', 'DECLINED', 'REVISION_REQUESTED');

-- The media list was stored inside the free-text `declineReason` JSON; move it to its own column.
UPDATE "Proposal" SET "richMedia" = json_extract("declineReason", '$.richMedia') WHERE "richMedia" IS NULL AND "declineReason" IS NOT NULL AND CASE WHEN json_valid("declineReason") THEN json_type("declineReason", '$.richMedia') = 'array' ELSE 0 END;
UPDATE "Proposal" SET "declineReason" = CASE WHEN json_remove("declineReason", '$.richMedia') = '{}' THEN NULL ELSE json_remove("declineReason", '$.richMedia') END WHERE "declineReason" IS NOT NULL AND CASE WHEN json_valid("declineReason") THEN json_type("declineReason", '$.richMedia') = 'array' ELSE 0 END;
