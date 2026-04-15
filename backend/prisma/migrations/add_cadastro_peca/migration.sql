-- Adiciona campo descricaoModelo na tabela Moto
ALTER TABLE "Moto" ADD COLUMN IF NOT EXISTS "descricaoModelo" TEXT;

-- Cria tabela CadastroPeca
CREATE TABLE IF NOT EXISTS "CadastroPeca" (
  "id"              SERIAL PRIMARY KEY,
  "motoId"          INTEGER NOT NULL REFERENCES "Moto"("id"),
  "idPeca"          TEXT NOT NULL UNIQUE,
  "descricao"       TEXT NOT NULL,
  "descricaoPeca"   TEXT,
  "precoVenda"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "condicao"        TEXT NOT NULL DEFAULT 'usado',
  "peso"            DECIMAL(10,3),
  "largura"         DECIMAL(10,2),
  "altura"          DECIMAL(10,2),
  "profundidade"    DECIMAL(10,2),
  "numeroPeca"      TEXT,
  "detranEtiqueta"  TEXT,
  "localizacao"     TEXT,
  "estoque"         INTEGER NOT NULL DEFAULT 1,
  "categoriaMLId"   TEXT,
  "categoriaMLNome" TEXT,
  "fotoCapa"        TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pre_cadastro',
  "blingProdutoId"  TEXT,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW()
);
