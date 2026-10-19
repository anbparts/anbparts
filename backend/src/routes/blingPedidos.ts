// Rotas das paginas Bling ERP > Pedidos e Clientes (dados guardados em lib/bling-pedidos.ts).
import { Router } from 'express';
import {
  detalheCliente, detalhePedido, enriquecerCliente, iniciarCargaHistorica, listarClientes, listarPedidos,
  iniciarPeriodo, statusSincronizacao,
} from '../lib/bling-pedidos';

export const blingPedidosRouter = Router();

function podeSincronizar(req: any) {
  const user = req.authUser || {};
  if (user.isAdmin || String(user.username || '').trim().toLowerCase() === 'bruno') return true;
  const acoes = user.permissions?.bling_pedidos;
  return Array.isArray(acoes) && acoes.includes('sincronizar');
}

// GET /bling-pedidos/pedidos?busca&situacao&canal&de&ate&pagina&limite
blingPedidosRouter.get('/pedidos', async (req, res, next) => {
  try {
    const q: any = req.query;
    res.json({ ok: true, ...(await listarPedidos({ busca: q.busca, situacao: q.situacao, canal: q.canal, de: q.de, ate: q.ate, pagina: Number(q.pagina), limite: Number(q.limite) })) });
  } catch (e) { next(e); }
});

blingPedidosRouter.get('/pedidos/:id', async (req, res, next) => {
  try {
    const r = await detalhePedido(String(req.params.id).replace(/\D/g, ''));
    if (!r) return res.status(404).json({ ok: false, error: 'Pedido nao encontrado.' });
    res.json({ ok: true, pedido: r });
  } catch (e) { next(e); }
});

// GET /bling-pedidos/clientes?busca&filtro=todos|recorrentes|unica|inativos&ordem&pagina&limite
blingPedidosRouter.get('/clientes', async (req, res, next) => {
  try {
    const q: any = req.query;
    res.json({ ok: true, ...(await listarClientes({ busca: q.busca, filtro: q.filtro, ordem: q.ordem, pagina: Number(q.pagina), limite: Number(q.limite) })) });
  } catch (e) { next(e); }
});

blingPedidosRouter.get('/clientes/:id', async (req, res, next) => {
  try {
    const r = await detalheCliente(String(req.params.id).replace(/\D/g, ''));
    if (!r) return res.status(404).json({ ok: false, error: 'Cliente nao encontrado.' });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// POST /bling-pedidos/clientes/:id/atualizar — rele o contato no Bling (email, telefone, endereco).
blingPedidosRouter.post('/clientes/:id/atualizar', async (req, res) => {
  try {
    if (!podeSincronizar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para sincronizar.' });
    await enriquecerCliente(Number(String(req.params.id).replace(/\D/g, '')));
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ ok: false, error: e?.message || 'Erro ao atualizar o cliente' }); }
});

// GET /bling-pedidos/sincronizacao — situacao da base e do trabalho em andamento.
blingPedidosRouter.get('/sincronizacao', async (_req, res, next) => {
  try { res.json({ ok: true, ...(await statusSincronizacao()) }); } catch (e) { next(e); }
});

// POST /bling-pedidos/sincronizacao/historico { reprocessar? } — carga inicial pelos IDs de pedido das pecas (roda em segundo plano).
blingPedidosRouter.post('/sincronizacao/historico', async (req, res) => {
  try {
    if (!podeSincronizar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para sincronizar.' });
    const r = await iniciarCargaHistorica({ reprocessar: req.body?.reprocessar === true });
    if ((r as any).jaRodando) return res.status(409).json({ ok: false, error: 'A sincronizacao ja esta em andamento.' });
    res.json({ ...r, ok: true });
  } catch (e: any) { res.status(400).json({ ok: false, error: e?.message || 'Erro ao iniciar a sincronizacao' }); }
});

// POST /bling-pedidos/sincronizacao/periodo { de, ate } — traz os pedidos do periodo (todos, com ou sem peca vinculada).
blingPedidosRouter.post('/sincronizacao/periodo', async (req, res) => {
  try {
    if (!podeSincronizar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para sincronizar.' });
    const de = String(req.body?.de || '').trim();
    const ate = String(req.body?.ate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return res.status(400).json({ ok: false, error: 'Informe o periodo (de/ate) no formato AAAA-MM-DD.' });
    const r: any = await iniciarPeriodo(de, ate);
    if (r.jaRodando) return res.status(409).json({ ok: false, error: 'A sincronizacao ja esta em andamento.' });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ ok: false, error: e?.message || 'Erro ao sincronizar o periodo' }); }
});
