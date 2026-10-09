import { Router } from 'express';
import { lerEstadoConexoes, registrarResultados, verificarConexoes } from '../lib/monitor-conexoes';

export const monitorConexoesRouter = Router();

// GET /monitor-conexoes — testa todas as integracoes agora (chamada real a cada API) e devolve o estado.
monitorConexoesRouter.get('/', async (_req, res, next) => {
  try {
    const resultados = await verificarConexoes();
    await registrarResultados(resultados); // o aviso por e-mail fica por conta da rotina automatica
    const estado = await lerEstadoConexoes();
    res.json({
      ok: true,
      verificadoEm: new Date().toISOString(),
      conexoes: resultados.map((r) => ({ ...r, caiuEm: estado[r.chave]?.caiuEm || null })),
    });
  } catch (e) { next(e); }
});
