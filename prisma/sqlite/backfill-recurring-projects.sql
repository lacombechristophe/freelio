-- Run after adding the nullable project relation; safe to repeat.
UPDATE "RecurringInvoice" AS r
SET "projectId" = (
  SELECT p."id" FROM "Project" AS p
  WHERE p."id" = json_extract(r."template", '$.projectId')
    AND p."companyId" = r."companyId"
    AND p."clientId" = r."clientId"
)
WHERE r."projectId" IS NULL
  AND json_type(r."template", '$.projectId') = 'text';
