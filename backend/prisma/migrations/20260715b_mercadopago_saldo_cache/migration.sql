-- Saldo do Mercado Pago persistido (calculado 1x/dia pelo job das 7:30). Dashboard só lê daqui.
CREATE TABLE IF NOT EXISTS "MercadoPagoSaldoCache" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "resumoJson" TEXT NOT NULL DEFAULT '',
  "atualizadoEm" TIMESTAMP(3),
  CONSTRAINT "MercadoPagoSaldoCache_pkey" PRIMARY KEY ("id")
);
