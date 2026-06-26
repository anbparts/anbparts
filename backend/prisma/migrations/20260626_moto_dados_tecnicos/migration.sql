-- Dados técnicos da moto usados no texto da NF-e (cilindros, combustível, cilindrada, potência).
ALTER TABLE "Moto"
  ADD COLUMN IF NOT EXISTS "cilindros" TEXT,
  ADD COLUMN IF NOT EXISTS "combustivel" TEXT,
  ADD COLUMN IF NOT EXISTS "cilindrada" TEXT,
  ADD COLUMN IF NOT EXISTS "potencia" TEXT;
