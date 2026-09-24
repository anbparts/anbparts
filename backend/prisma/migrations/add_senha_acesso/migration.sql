CREATE TABLE IF NOT EXISTS "SenhaAcesso" (
  "id"         SERIAL PRIMARY KEY,
  "servico"    TEXT NOT NULL,
  "usuario"    TEXT NOT NULL DEFAULT '',
  "senha"      TEXT NOT NULL DEFAULT '',
  "observacao" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT now()
);
