import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { DETRAN_TIPOS, NFE_VARIAVEIS } from '../lib/nfe-texto';

export const confTextoPecaRouter = Router();

// GET /conf-texto-peca — lista os 34 tipos, as variáveis disponíveis e os templates já salvos.
confTextoPecaRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRaw<{ tipo: string; template: string; ativo: boolean; updatedAt: Date }[]>`
      SELECT "tipo", "template", "ativo", "updatedAt" FROM "TextoTipoPeca"
    `;
    const templates: Record<string, { template: string; ativo: boolean; updatedAt: Date }> = {};
    for (const r of rows) {
      templates[String(r.tipo)] = { template: String(r.template || ''), ativo: !!r.ativo, updatedAt: r.updatedAt };
    }
    res.json({ ok: true, tipos: DETRAN_TIPOS, variaveis: NFE_VARIAVEIS, templates });
  } catch (e) {
    next(e);
  }
});

const saveSchema = z.object({
  tipo: z.string().trim().min(1),
  template: z.string().default(''),
  ativo: z.boolean().optional().default(true),
});

// POST /conf-texto-peca — salva (upsert) o template de um tipo de peça.
confTextoPecaRouter.post('/', async (req, res, next) => {
  try {
    const body = saveSchema.parse(req.body || {});
    if (!DETRAN_TIPOS.includes(body.tipo)) {
      return res.status(400).json({ ok: false, error: 'Tipo de peça inválido.' });
    }
    await prisma.$executeRaw`
      INSERT INTO "TextoTipoPeca" ("tipo", "template", "ativo", "updatedAt")
      VALUES (${body.tipo}, ${body.template}, ${body.ativo}, now())
      ON CONFLICT ("tipo") DO UPDATE
        SET "template" = EXCLUDED."template", "ativo" = EXCLUDED."ativo", "updatedAt" = now()
    `;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /conf-texto-peca/:tipo — remove o template de um tipo (volta a "sem texto").
confTextoPecaRouter.delete('/:tipo', async (req, res, next) => {
  try {
    const tipo = String(req.params.tipo || '');
    await prisma.$executeRaw`DELETE FROM "TextoTipoPeca" WHERE "tipo" = ${tipo}`;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
