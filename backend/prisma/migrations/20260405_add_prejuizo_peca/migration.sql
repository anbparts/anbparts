ALTER TABLE "Peca"
ADD COLUMN IF NOT EXISTS "emPrejuizo" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "Prejuizo"
ADD COLUMN IF NOT EXISTS "motivo" TEXT,
ADD COLUMN IF NOT EXISTS "pecaId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Prejuizo_pecaId_fkey'
  ) THEN
    ALTER TABLE "Prejuizo"
    ADD CONSTRAINT "Prejuizo_pecaId_fkey"
    FOREIGN KEY ("pecaId") REFERENCES "Peca"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Prejuizo_pecaId_key" ON "Prejuizo"("pecaId");
