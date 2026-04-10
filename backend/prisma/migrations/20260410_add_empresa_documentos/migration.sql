ALTER TABLE "ConfiguracaoGeral"
ADD COLUMN "empresaRazaoSocial" TEXT NOT NULL DEFAULT '',
ADD COLUMN "empresaCnpj" TEXT NOT NULL DEFAULT '',
ADD COLUMN "empresaEnderecoCompleto" TEXT NOT NULL DEFAULT '',
ADD COLUMN "empresaTelefoneWhats" TEXT NOT NULL DEFAULT '',
ADD COLUMN "empresaAnexos" JSONB NOT NULL DEFAULT '{}';
