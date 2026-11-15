-- PostgreSQL-only proposal normalization. Guard legacy plain-text decline reason.
UPDATE "Proposal" p SET "currency"=COALESCE(w."baseCurrency",'INR')
FROM "Workspace" w WHERE w."id"=p."workspaceId" AND p."currency"='INR';
UPDATE "Proposal" SET "taxRatePercent"=
ROUND(("estimatedTax"::numeric * 100) / NULLIF("subtotal"::numeric,0),2)
WHERE "taxRatePercent"=0 AND "subtotal">0 AND "estimatedTax">0;
UPDATE "Proposal" SET "sentAt"="dateCreated"
WHERE "sentAt" IS NULL AND "status" IN
('SENT','VIEWED','ACCEPTED','INVOICED','DECLINED','REVISION_REQUESTED');
UPDATE "Proposal"
SET "richMedia"=("declineReason"::jsonb->'richMedia')::text
WHERE "richMedia" IS NULL AND
 CASE WHEN pg_input_is_valid("declineReason",'jsonb') THEN
  jsonb_typeof("declineReason"::jsonb->'richMedia')='array' ELSE false END;
UPDATE "Proposal"
SET "declineReason"=NULLIF(("declineReason"::jsonb-'richMedia')::text,'{}')
WHERE "declineReason" IS NOT NULL AND
 CASE WHEN pg_input_is_valid("declineReason",'jsonb') THEN
  jsonb_typeof("declineReason"::jsonb->'richMedia')='array' ELSE false END;
