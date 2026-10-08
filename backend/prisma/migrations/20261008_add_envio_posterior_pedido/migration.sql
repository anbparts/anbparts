-- Envio posterior: pedido separado agora com data de envio futura (relatorio de separacao).
CREATE TABLE IF NOT EXISTS "BlingPedidoEnvioPosterior" (
  "pedidoId" BIGINT NOT NULL,
  "envioPrevisto" DATE NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlingPedidoEnvioPosterior_pkey" PRIMARY KEY ("pedidoId")
);
