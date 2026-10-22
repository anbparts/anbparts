// Preferencias de tela por usuario (ex.: grupos do menu lateral recolhidos). Tabela criada sob demanda, sem migration.
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const preferenciasRouter = Router();

let tabelaPronta: Promise<void> | null = null;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UsuarioPreferencia" ("usuario" TEXT NOT NULL, "chave" TEXT NOT NULL, "valor" TEXT NOT NULL, "atualizadoEm" TIMESTAMP NOT NULL DEFAULT now(), PRIMARY KEY ("usuario","chave"))`)
      .then(() => undefined).catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}
const usuarioDe = (req: any) => String(req.authUser?.username || '').trim().toLowerCase();

// GET /preferencias/menu -> { fechados: { "Financeiro": true, ... } }
preferenciasRouter.get('/menu', async (req, res, next) => {
  try {
    const usuario = usuarioDe(req);
    if (!usuario) return res.json({ ok: true, fechados: {} });
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(`SELECT "valor" FROM "UsuarioPreferencia" WHERE "usuario" = $1 AND "chave" = 'menu_grupos_fechados'`, usuario);
    let fechados: Record<string, boolean> = {};
    try { fechados = rows[0] ? JSON.parse(rows[0].valor) : {}; } catch { fechados = {}; }
    res.json({ ok: true, fechados });
  } catch (e) { next(e); }
});

// PUT /preferencias/menu { fechados: { "Financeiro": true } }
preferenciasRouter.put('/menu', async (req, res, next) => {
  try {
    const usuario = usuarioDe(req);
    if (!usuario) return res.status(401).json({ ok: false, error: 'Sem usuario.' });
    await garantirTabela();
    const entrada = req.body?.fechados && typeof req.body.fechados === 'object' ? req.body.fechados : {};
    const limpo: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(entrada).slice(0, 40)) if (v === true) limpo[String(k).slice(0, 60)] = true;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UsuarioPreferencia" ("usuario","chave","valor","atualizadoEm") VALUES ($1,'menu_grupos_fechados',$2,now())
       ON CONFLICT ("usuario","chave") DO UPDATE SET "valor"=EXCLUDED."valor","atualizadoEm"=now()`, usuario, JSON.stringify(limpo),
    );
    res.json({ ok: true, fechados: limpo });
  } catch (e) { next(e); }
});
