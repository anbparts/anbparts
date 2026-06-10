CREATE TABLE IF NOT EXISTS "BlingPedidoSeparacao" (
  "pedidoId" BIGINT NOT NULL,
  "separadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlingPedidoSeparacao_pkey" PRIMARY KEY ("pedidoId")
);
