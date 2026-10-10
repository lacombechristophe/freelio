-- Do not infer an old reminder's original balance from today's invoice.
ALTER TABLE "InvoiceReminder" ADD COLUMN "remainingCents" INTEGER;
