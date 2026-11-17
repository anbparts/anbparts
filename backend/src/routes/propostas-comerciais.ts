// Propostas Comerciais (Bling por tras): lista/detalhe locais, sincronizacao, validacao de item, criacao e PDF.
import { Router } from 'express';
import {
  alterarSituacaoProposta, atualizarProposta, buscarClientes, criarProposta, definirClienteProposta, jobPropostas, propostaBrutaDoBling, lerProposta, listarPropostas, sincronizarPropostas, validarItemProposta,
} from '../lib/propostas-comerciais';
import { gerarPropostaPdf } from '../lib/proposta-pdf';
import { prisma } from '../lib/prisma';

export const propostasComerciaisRouter = Router();

// GET /propostas-comerciais?busca&situacao&de&ate&pagina&limite
propostasComerciaisRouter.get('/', async (req, res, next) => {
  try {
    const q: any = req.query;
    res.json({ ok: true, ...(await listarPropostas({ busca: q.busca, situacao: q.situacao, de: q.de, ate: q.ate, pagina: Number(q.pagina), limite: Number(q.limite) })) });
  } catch (e) { next(e); }
});

// POST /propostas-comerciais/sincronizar { tudo?: boolean } — traz do Bling (em segundo plano; acompanhe em /status)
propostasComerciaisRouter.post('/sincronizar', (req, res) => {
  if (jobPropostas.rodando) return res.json({ ok: true, rodando: true });
  void sincronizarPropostas({ tudo: !!req.body?.tudo }).catch((e) => { jobPropostas.ultimoErro = String(e?.message || e); });
  res.json({ ok: true, iniciado: true });
});
propostasComerciaisRouter.get('/status', (_req, res) => res.json({ ok: true, ...jobPropostas }));

// GET /propostas-comerciais/item/validar?sku=
propostasComerciaisRouter.get('/item/validar', async (req, res, next) => {
  try { res.json(await validarItemProposta(String(req.query.sku || ''))); } catch (e) { next(e); }
});

// GET /propostas-comerciais/clientes?q=
propostasComerciaisRouter.get('/clientes', async (req, res, next) => {
  try { res.json({ ok: true, clientes: await buscarClientes(String(req.query.q || '')) }); } catch (e) { next(e); }
});

// POST /propostas-comerciais — cria no Bling (Rascunho) e grava local
propostasComerciaisRouter.post('/', async (req, res) => {
  try {
    const user = (req as any).authUser || {};
    const r = await criarProposta(req.body || {}, String(user.username || ''));
    res.json({ ok: true, ...r });
  } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

propostasComerciaisRouter.get('/:id', async (req, res, next) => {
  try {
    const p = await lerProposta(String(req.params.id).replace(/\D/g, ''));
    if (!p) return res.status(404).json({ ok: false, error: 'Proposta nao encontrada.' });
    res.json({ ok: true, proposta: p });
  } catch (e) { next(e); }
});

// PUT /propostas-comerciais/:id — edita proposta em Rascunho (replica no Bling)
propostasComerciaisRouter.put('/:id', async (req, res) => {
  try { res.json({ ok: true, ...(await atualizarProposta(String(req.params.id).replace(/\D/g, ''), req.body || {})) }); }
  catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

// PATCH /propostas-comerciais/:id/cliente { nome } — preenche/corrige o cliente na proposta (local; aparece na lista e no PDF)
propostasComerciaisRouter.patch('/:id/cliente', async (req, res) => {
  try { await definirClienteProposta(String(req.params.id).replace(/\D/g, ''), String(req.body?.nome || '')); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

// GET /propostas-comerciais/:id/bling-bruto — o que o Bling devolve para essa proposta (diagnostico)
propostasComerciaisRouter.get('/:id/bling-bruto', async (req, res) => {
  try { res.json({ ok: true, bling: await propostaBrutaDoBling(String(req.params.id).replace(/\D/g, '')) }); }
  catch (e: any) { res.status(502).json({ ok: false, error: String(e?.message || e) }); }
});

// PATCH /propostas-comerciais/:id/situacao { situacao }
propostasComerciaisRouter.patch('/:id/situacao', async (req, res) => {
  try {
    await alterarSituacaoProposta(String(req.params.id).replace(/\D/g, ''), String(req.body?.situacao || ''));
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

// GET /propostas-comerciais/:id/pdf
propostasComerciaisRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    const p = await lerProposta(String(req.params.id).replace(/\D/g, ''));
    if (!p) return res.status(404).json({ ok: false, error: 'Proposta nao encontrada.' });
    let documentoCliente = '';
    if (p.clienteId) {
      const [c] = await prisma.$queryRawUnsafe<any[]>(`SELECT "documento","tipoPessoa" FROM "BlingCliente" WHERE "id" = $1::bigint`, p.clienteId).catch(() => [] as any[]);
      const d = String(c?.documento || '').replace(/\D/g, '');
      if (d.length === 11) documentoCliente = `CPF: ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
      else if (d.length === 14) documentoCliente = `CNPJ: ${d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
    }
    const pdf = await gerarPropostaPdf(p, { documentoCliente });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Proposta Comercial - ${p.numero ?? p.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});
