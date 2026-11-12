import { Router } from 'express';
import { LIMITES_MONITOR, lerConfigMonitor, lerEstadoConexoes, registrarResultados, salvarConfigMonitor, verificarConexoes } from '../lib/monitor-conexoes';

export const monitorConexoesRouter = Router();

// GET /monitor-conexoes/config — regras dos alertas por e-mail (tentativas antes de avisar, intervalo, reaviso).
monitorConexoesRouter.get('/config', async (_req, res, next) => {
  try {
    res.json({ ok: true, config: await lerConfigMonitor(), limites: LIMITES_MONITOR });
  } catch (e) { next(e); }
});

// PUT /monitor-conexoes/config — salva as regras (valores fora do limite sao ajustados).
monitorConexoesRouter.put('/config', async (req, res, next) => {
  try {
    res.json({ ok: true, config: await salvarConfigMonitor(req.body || {}), limites: LIMITES_MONITOR });
  } catch (e) { next(e); }
});

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
