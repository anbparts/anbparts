-- Habilita extensão para busca por trigrama (LIKE % %)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices compostos para filtros mais comuns
CREATE INDEX IF NOT EXISTS "Peca_motoId_disponivel_emPrejuizo_idx" ON "Peca"("motoId", "disponivel", "emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_disponivel_emPrejuizo_idx" ON "Peca"("disponivel", "emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_disponivel_emPrejuizo_cadastro_idx" ON "Peca"("disponivel", "emPrejuizo", "cadastro");
CREATE INDEX IF NOT EXISTS "Peca_motoId_disponivel_emPrejuizo_cadastro_idx" ON "Peca"("motoId", "disponivel", "emPrejuizo", "cadastro");

-- Índices simples para filtros individuais
CREATE INDEX IF NOT EXISTS "Peca_blingPedidoNum_idx" ON "Peca"("blingPedidoNum");
CREATE INDEX IF NOT EXISTS "Peca_dataVenda_idx" ON "Peca"("dataVenda");
CREATE INDEX IF NOT EXISTS "Peca_emPrejuizo_idx" ON "Peca"("emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_numeroPeca_idx" ON "Peca"("numeroPeca");
CREATE INDEX IF NOT EXISTS "Peca_detranStatus_idx" ON "Peca"("detranStatus");

-- Índices GIN para busca textual com LIKE
CREATE INDEX IF NOT EXISTS "Peca_idPeca_trgm_idx" ON "Peca" USING gin("idPeca" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Peca_descricao_trgm_idx" ON "Peca" USING gin("descricao" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Peca_blingPedidoNum_trgm_idx" ON "Peca" USING gin("blingPedidoNum" gin_trgm_ops);
