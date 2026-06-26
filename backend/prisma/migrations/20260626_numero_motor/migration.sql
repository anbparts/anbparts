-- Número do Motor (peças do tipo Bloco do motor): obrigatório no pré-cadastro, carregado para a peça.
ALTER TABLE "CadastroPeca" ADD COLUMN IF NOT EXISTS "numeroMotor" TEXT;
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "numeroMotor" TEXT;
