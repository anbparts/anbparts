-- Índices compostos para filtros mais comuns
CREATE INDEX IF NOT EXISTS "Peca_motoId_disponivel_emPrejuizo_idx" ON "Peca"("motoId", "disponivel", "emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_disponivel_emPrejuizo_idx" ON "Peca"("disponivel", "emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_disponivel_emPrejuizo_cadastro_idx" ON "Peca"("disponivel", "emPrejuizo", "cadastro");
CREATE INDEX IF NOT EXISTS "Peca_motoId_disponivel_emPrejuizo_cadastro_idx" ON "Peca"("motoId", "disponivel", "emPrejuizo", "cadastro");

-- Índices simples
CREATE INDEX IF NOT EXISTS "Peca_blingPedidoNum_idx" ON "Peca"("blingPedidoNum");
CREATE INDEX IF NOT EXISTS "Peca_dataVenda_idx" ON "Peca"("dataVenda");
CREATE INDEX IF NOT EXISTS "Peca_emPrejuizo_idx" ON "Peca"("emPrejuizo");
CREATE INDEX IF NOT EXISTS "Peca_numeroPeca_idx" ON "Peca"("numeroPeca");
CREATE INDEX IF NOT EXISTS "Peca_detranStatus_idx" ON "Peca"("detranStatus");
