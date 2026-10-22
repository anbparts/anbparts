// Configuracoes > Conf. Anthropic: chave da API guardada no sistema, teste da chave e relatorio de uso de tokens.
import { Router } from 'express';
import { relatorioUsoAnthropic, salvarChaveAnthropic, statusChaveAnthropic, testarChaveAnthropic } from '../lib/anthropic';

export const anthropicConfigRouter = Router();

function podeEditar(req: any) {
  const user = req.authUser || {};
  if (user.isAdmin || String(user.username || '').trim().toLowerCase() === 'bruno') return true;
  const acoes = user.permissions?.conf_anthropic;
  return Array.isArray(acoes) && acoes.includes('editar');
}

// GET /anthropic/status — situacao da chave (nunca devolve a chave, so os 4 ultimos caracteres)
anthropicConfigRouter.get('/status', async (req, res, next) => {
  try { res.json({ ok: true, ...(await statusChaveAnthropic()), podeEditar: podeEditar(req) }); } catch (e) { next(e); }
});

// POST /anthropic/chave { chave } — salva a nova chave (valida antes com a Anthropic)
anthropicConfigRouter.post('/chave', async (req, res) => {
  try {
    if (!podeEditar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para trocar a chave.' });
    const chave = String(req.body?.chave || '').trim();
    const teste = await testarChaveAnthropic(chave);
    if (!teste.ok) return res.status(400).json({ ok: false, error: `Chave nao salva. ${teste.mensagem}` });
    await salvarChaveAnthropic(chave, String((req as any).authUser?.username || '').trim() || null);
    res.json({ ok: true, mensagem: teste.mensagem, ...(await statusChaveAnthropic()) });
  } catch (e: any) { res.status(400).json({ ok: false, error: e?.message || 'Erro ao salvar a chave' }); }
});

// POST /anthropic/testar — testa a chave em uso
anthropicConfigRouter.post('/testar', async (_req, res, next) => {
  try { res.json(await testarChaveAnthropic()); } catch (e) { next(e); }
});

// GET /anthropic/uso?dias=30 — relatorio de tokens por recurso, usuario e dia
anthropicConfigRouter.get('/uso', async (req, res, next) => {
  try { res.json({ ok: true, ...(await relatorioUsoAnthropic(Number(req.query.dias) || 30)) }); } catch (e) { next(e); }
});
