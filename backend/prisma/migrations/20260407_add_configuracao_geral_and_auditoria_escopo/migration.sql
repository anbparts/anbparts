ALTER TABLE "BlingConfig"
ADD COLUMN "auditoriaEscopo" TEXT NOT NULL DEFAULT 'full';

CREATE TABLE "ConfiguracaoGeral" (
  "id" SERIAL NOT NULL,
  "resendApiKey" TEXT NOT NULL DEFAULT '',
  "emailRemetente" TEXT NOT NULL DEFAULT 'alertas@mail.anbparts.com.br',
  "auditoriaEmailDestinatario" TEXT NOT NULL DEFAULT '',
  "auditoriaEmailTitulo" TEXT NOT NULL DEFAULT 'ALERTA ANB Parts - Divergência de Produtos / Anúncios - Verifique',
  "detranEmailDestinatario" TEXT NOT NULL DEFAULT '',
  "detranEmailTitulo" TEXT NOT NULL DEFAULT 'ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConfiguracaoGeral_pkey" PRIMARY KEY ("id")
);
