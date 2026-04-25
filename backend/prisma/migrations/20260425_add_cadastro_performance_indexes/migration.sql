CREATE INDEX "CadastroPeca_status_createdAt_idx"
ON "CadastroPeca"("status", "createdAt");

CREATE INDEX "CadastroPeca_motoId_status_createdAt_idx"
ON "CadastroPeca"("motoId", "status", "createdAt");
