// Ajuste rapido do SKU na aba Anuncio: titulo, condicao (usado/novo) e texto — pra corrigir falha de
// cadastro sem voltar ao pre-cadastro. Grava no Bling (produto) e no cadastro/peca. A condicao tambem
// alimenta o anuncio (Magalu NEW/USED, ML via produto do Bling, tags da Nuvemshop).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { carregarAnuncioBase, skuBaseAnuncio } from '../lib/anuncioBase';
import { lerDadosBlingSku, ajustarProdutoNoBling } from '../lib/anuncioPreparar';

export const anuncioAjusteRouter = Router();

// GET /anuncio-ajuste/dados?sku= — valores atuais (Bling; se o Bling falhar, os do cadastro).
anuncioAjusteRouter.get('/dados', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.query.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });

    let bling: any = null;
    let erroBling = '';
    try {
      bling = await lerDadosBlingSku(base);
    } catch (e: any) {
      erroBling = e?.message || 'Falha ao ler o Bling';
    }
    res.json({
      ok: true,
      sku,
      origem: base.origem,
      titulo: bling?.titulo || base.descricao,
      descricao: bling?.descricao ?? '',
      condicao: bling?.condicao || (String(base.condicao || '').toLowerCase() === 'novo' ? 'novo' : 'usado'),
      situacaoBling: bling?.situacao || null,
      erroBling: erroBling || undefined,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao ler os dados do SKU' });
  }
});

// POST /anuncio-ajuste/salvar — body: { sku, titulo?, descricao?, condicao? }. So envia o que mudou.
anuncioAjusteRouter.post('/salvar', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.body?.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });

    const titulo = req.body?.titulo !== undefined ? String(req.body.titulo).trim() : undefined;
    const descricao = req.body?.descricao !== undefined ? String(req.body.descricao).replace(/\r\n/g, '\n').trim() : undefined;
    const condicao = req.body?.condicao !== undefined ? String(req.body.condicao).toLowerCase() : undefined;

    if (titulo !== undefined && (!titulo || titulo.length > 60)) return res.status(400).json({ error: 'Titulo obrigatorio e com no maximo 60 caracteres.' });
    if (condicao !== undefined && condicao !== 'usado' && condicao !== 'novo') return res.status(400).json({ error: 'Condicao deve ser "usado" ou "novo".' });
    if (titulo === undefined && descricao === undefined && condicao === undefined) return res.status(400).json({ error: 'Nada para alterar.' });

    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });

    // Bling PRIMEIRO: se falhar, nada e' gravado localmente (evita cadastro e Bling divergentes).
    await ajustarProdutoNoBling(base, {
      ...(titulo !== undefined ? { titulo } : {}),
      ...(descricao !== undefined ? { descricao } : {}),
      ...(condicao !== undefined ? { condicao: condicao as 'usado' | 'novo' } : {}),
    });

    const dadosCadastro: Record<string, any> = {};
    if (titulo !== undefined) dadosCadastro.descricao = titulo;
    if (descricao !== undefined) dadosCadastro.descricaoPeca = descricao.replace(/\n/g, '<br>');
    if (condicao !== undefined) dadosCadastro.condicao = condicao;
    if (Object.keys(dadosCadastro).length) {
      await (prisma as any).cadastroPeca.updateMany({ where: { idPeca: sku }, data: dadosCadastro });
    }
    if (titulo !== undefined) {
      await prisma.peca.updateMany({
        where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
        data: { descricao: titulo },
      });
    }

    res.json({ ok: true, sku, alterado: { titulo: titulo !== undefined, descricao: descricao !== undefined, condicao: condicao !== undefined } });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao salvar o ajuste' });
  }
});
