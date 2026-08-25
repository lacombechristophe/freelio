-- A historical production database was synchronized directly before the
-- versioned migration chain was enabled. Most of the operations migration was
-- already present there, except these technical-survey columns. Keep this
-- repair idempotent so fresh databases and correctly migrated databases remain
-- unchanged while the historical database converges to the same schema.
ALTER TABLE "ProjectTechnicalProfile"
ADD COLUMN IF NOT EXISTS "accessWidthMm" INTEGER,
ADD COLUMN IF NOT EXISTS "copingType" TEXT,
ADD COLUMN IF NOT EXISTS "coverColor" TEXT,
ADD COLUMN IF NOT EXISTS "coverModel" TEXT,
ADD COLUMN IF NOT EXISTS "deckMaterial" TEXT,
ADD COLUMN IF NOT EXISTS "diagonal1Mm" INTEGER,
ADD COLUMN IF NOT EXISTS "diagonal2Mm" INTEGER,
ADD COLUMN IF NOT EXISTS "installationConstraints" TEXT,
ADD COLUMN IF NOT EXISTS "measurementNotes" TEXT,
ADD COLUMN IF NOT EXISTS "obstacles" TEXT,
ADD COLUMN IF NOT EXISTS "poolDepthMm" INTEGER,
ADD COLUMN IF NOT EXISTS "poolLengthMm" INTEGER,
ADD COLUMN IF NOT EXISTS "poolShape" TEXT,
ADD COLUMN IF NOT EXISTS "poolWidthMm" INTEGER,
ADD COLUMN IF NOT EXISTS "powerSupply" TEXT,
ADD COLUMN IF NOT EXISTS "recommendedProduct" TEXT,
ADD COLUMN IF NOT EXISTS "surveyStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "surveyedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "surveyedBy" TEXT,
ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "validationNotes" TEXT;
