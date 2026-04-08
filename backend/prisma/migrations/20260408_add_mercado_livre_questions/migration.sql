ALTER TABLE "ConfiguracaoGeral"
ADD COLUMN "mercadoLivrePerguntasAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mercadoLivrePerguntasIntervaloMin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "mercadoLivrePerguntasEmailDestinatario" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mercadoLivrePerguntasEmailTitulo" TEXT NOT NULL DEFAULT 'ALERTA ANB Parts - Perguntas Mercado Livre - Verifique',
ADD COLUMN "mercadoLivrePerguntasUltimaLeituraEm" TIMESTAMP(3);

CREATE TABLE "MercadoLivreConfig" (
  "id" SERIAL NOT NULL,
  "clientId" TEXT NOT NULL DEFAULT '',
  "clientSecret" TEXT NOT NULL DEFAULT '',
  "accessToken" TEXT NOT NULL DEFAULT '',
  "refreshToken" TEXT NOT NULL DEFAULT '',
  "connectedAt" TIMESTAMP(3),
  "sellerId" TEXT NOT NULL DEFAULT '',
  "nickname" TEXT NOT NULL DEFAULT '',
  "siteId" TEXT NOT NULL DEFAULT 'MLB',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivrePergunta" (
  "id" SERIAL NOT NULL,
  "questionId" TEXT NOT NULL,
  "itemId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNANSWERED',
  "texto" TEXT NOT NULL,
  "respostaTexto" TEXT,
  "dataPergunta" TIMESTAMP(3),
  "respondidaEm" TIMESTAMP(3),
  "clienteId" TEXT,
  "nomeCliente" TEXT,
  "sku" TEXT,
  "idPeca" TEXT,
  "pecaId" INTEGER,
  "descricao" TEXT,
  "tituloAnuncio" TEXT,
  "linkAnuncio" TEXT,
  "raw" JSONB NOT NULL DEFAULT '{}',
  "notificadaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MercadoLivrePergunta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivrePergunta_questionId_key" ON "MercadoLivrePergunta"("questionId");
CREATE INDEX "MercadoLivrePergunta_status_idx" ON "MercadoLivrePergunta"("status");
CREATE INDEX "MercadoLivrePergunta_dataPergunta_idx" ON "MercadoLivrePergunta"("dataPergunta");
CREATE INDEX "MercadoLivrePergunta_notificadaEm_idx" ON "MercadoLivrePergunta"("notificadaEm");
CREATE INDEX "MercadoLivrePergunta_sku_idx" ON "MercadoLivrePergunta"("sku");
CREATE INDEX "MercadoLivrePergunta_idPeca_idx" ON "MercadoLivrePergunta"("idPeca");
