ALTER TABLE "Peca"
ADD COLUMN "localizacao" TEXT;

CREATE INDEX "Peca_localizacao_idx" ON "Peca"("localizacao");

CREATE TABLE "Inventario" (
  "id" SERIAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'em_andamento',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventarioCaixa" (
  "id" SERIAL NOT NULL,
  "inventarioId" INTEGER NOT NULL,
  "caixa" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventarioCaixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventarioItem" (
  "id" SERIAL NOT NULL,
  "inventarioId" INTEGER NOT NULL,
  "caixa" TEXT NOT NULL,
  "skuBase" TEXT NOT NULL,
  "motoId" INTEGER,
  "idPecaReferencia" TEXT,
  "descricao" TEXT NOT NULL,
  "quantidadeEstoque" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "tipoDiferenca" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventarioCaixa_inventarioId_caixa_key" ON "InventarioCaixa"("inventarioId", "caixa");
CREATE UNIQUE INDEX "InventarioItem_inventarioId_caixa_skuBase_key" ON "InventarioItem"("inventarioId", "caixa", "skuBase");

CREATE INDEX "Inventario_status_idx" ON "Inventario"("status");
CREATE INDEX "Inventario_startedAt_idx" ON "Inventario"("startedAt");
CREATE INDEX "Inventario_finishedAt_idx" ON "Inventario"("finishedAt");
CREATE INDEX "InventarioCaixa_caixa_idx" ON "InventarioCaixa"("caixa");
CREATE INDEX "InventarioCaixa_status_idx" ON "InventarioCaixa"("status");
CREATE INDEX "InventarioItem_inventarioId_caixa_status_idx" ON "InventarioItem"("inventarioId", "caixa", "status");
CREATE INDEX "InventarioItem_status_idx" ON "InventarioItem"("status");
CREATE INDEX "InventarioItem_tipoDiferenca_idx" ON "InventarioItem"("tipoDiferenca");

ALTER TABLE "InventarioCaixa"
ADD CONSTRAINT "InventarioCaixa_inventarioId_fkey"
FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventarioItem"
ADD CONSTRAINT "InventarioItem_inventarioId_fkey"
FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
