import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { blingReq } from './bling';

export const etiquetasDetranRouter = Router();
const prisma = new PrismaClient();

// ─── GET /etiquetas-detran ───────────────────────────────────────────────────
// Lista todas as etiquetas detran com tipo (Cartela ou Avulsa)
etiquetasDetranRouter.get('/', async (req, res, next) => {
  try {
    const { sku, descricao, tipoEtiqueta, tipoPeca, etiqueta, status } = req.query as any;

    // 1. Busca todas as peças com etiqueta detran
    const pecas = await prisma.peca.findMany({
      where: {
        detranEtiqueta: { not: null },
        ...(sku ? { idPeca: { contains: String(sku), mode: 'insensitive' } } : {}),
        ...(descricao ? { descricao: { contains: String(descricao), mode: 'insensitive' } } : {}),
        ...(status ? { detranStatus: String(status) } : {}),
      },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranStatus: true,
        disponivel: true,
        blingPedidoNum: true,
        dataVenda: true,
        motoId: true,
      },
      orderBy: { idPeca: 'asc' },
    });

    // 2. Busca todas as posições de cartela para cruzar
    const motoIds = [...new Set(pecas.map((p: any) => p.motoId))];
    const posicoes = await prisma.motoDetranPosicao.findMany({
      where: { motoId: { in: motoIds }, idPeca: { not: null } },
      select: { motoId: true, idPeca: true, etiqueta: true, tipo: true },
    });

    // Map: "motoId|idPeca|etiqueta" → tipoPeca da cartela
    const cartelaMap = new Map<string, string>();
    for (const pos of posicoes) {
      if (pos.idPeca && pos.etiqueta) {
        cartelaMap.set(`${pos.motoId}|${pos.idPeca}|${pos.etiqueta}`, pos.tipo);
      }
    }

    // 3. Expande peças com múltiplas etiquetas em linhas separadas
    const linhas: any[] = [];
    for (const peca of pecas) {
      const etiquetas = (peca.detranEtiqueta || '').split('/').map((e: any) => e.trim()).filter(Boolean);
      for (const etq of etiquetas) {
        const cartelaTipo = cartelaMap.get(`${peca.motoId}|${peca.idPeca}|${etq}`);
        const tipoEtq = cartelaTipo ? 'Cartela' : 'Avulsa';
        const tipoPecaVal = cartelaTipo || 'Avulsa';

        // Filtros opcionais
        if (tipoEtiqueta && tipoEtq !== tipoEtiqueta) continue;
        if (tipoPeca && tipoPecaVal.toLowerCase() !== String(tipoPeca).toLowerCase()) continue;
        if (etiqueta && !etq.includes(String(etiqueta).toUpperCase())) continue;

        linhas.push({
          pecaId: peca.id,
          sku: peca.idPeca,
          descricao: peca.descricao,
          tipoEtiqueta: tipoEtq,
          tipoPeca: tipoPecaVal,
          etiqueta: etq,
          status: peca.detranStatus || '—',
          disponivel: peca.disponivel,
          blingPedidoNum: peca.blingPedidoNum,
          dataVenda: peca.dataVenda,
        });
      }
    }

    res.json({ ok: true, total: linhas.length, linhas });
  } catch (e) { next(e); }
});

// ─── GET /etiquetas-detran/pendencias-baixa ──────────────────────────────────
// Etiquetas ativas cujo SKU já foi vendido (disponivel=false, blingPedidoNum)
etiquetasDetranRouter.get('/pendencias-baixa', async (req, res, next) => {
  try {
    // Peças vendidas que têm etiqueta detran ativa (Reutilizavel ou Sucata)
    const pecas = await prisma.peca.findMany({
      where: {
        detranEtiqueta: { not: null },
        detranStatus: { in: ['Reutilizavel', 'Sucata'] },
        disponivel: false,
        blingPedidoNum: { not: null },
      },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranStatus: true,
        blingPedidoNum: true,
        dataVenda: true,
        motoId: true,
      },
      orderBy: { dataVenda: 'desc' },
    });

    // Busca posições de cartela
    const motoIds = [...new Set(pecas.map((p: any) => p.motoId))];
    const posicoes = await prisma.motoDetranPosicao.findMany({
      where: { motoId: { in: motoIds }, idPeca: { not: null } },
      select: { motoId: true, idPeca: true, etiqueta: true, tipo: true },
    });
    const cartelaMap = new Map<string, string>();
    for (const pos of posicoes) {
      if (pos.idPeca && pos.etiqueta) {
        cartelaMap.set(`${pos.motoId}|${pos.idPeca}|${pos.etiqueta}`, pos.tipo);
      }
    }

    // Agrupa pedidos únicos para buscar NF/cliente no Bling
    const pedidosUnicos = [...new Set(pecas.map((p: any) => p.blingPedidoNum).filter(Boolean))];

    // Busca dados do pedido no Bling (NF + cliente) em paralelo, máx 5 por vez
    const blingCache = new Map<string, { nfNumero: string; clienteNome: string; clienteDoc: string }>();
    const chunks = [];
    for (let i = 0; i < pedidosUnicos.length; i += 5) chunks.push(pedidosUnicos.slice(i, i + 5));

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (pedidoNum) => {
        try {
          const resp = await blingReq(`/pedidos/vendas/${pedidoNum}`);
          const data = resp?.data;
          const nfNumero = data?.notaFiscal?.numero || data?.nfe?.numero || '';
          const clienteNome = data?.contato?.nome || '';
          const clienteDoc = data?.contato?.numeroDocumento || data?.contato?.cpfCnpj || '';
          blingCache.set(String(pedidoNum), { nfNumero: String(nfNumero), clienteNome, clienteDoc });
        } catch { blingCache.set(String(pedidoNum), { nfNumero: '', clienteNome: '', clienteDoc: '' }); }
      }));
    }

    // Expande em linhas por etiqueta
    const linhas: any[] = [];
    for (const peca of pecas) {
      const etiquetas = (peca.detranEtiqueta || '').split('/').map((e: any) => e.trim()).filter(Boolean);
      const bling = blingCache.get(String(peca.blingPedidoNum)) || { nfNumero: '', clienteNome: '', clienteDoc: '' };
      for (const etq of etiquetas) {
        const cartelaTipo = cartelaMap.get(`${peca.motoId}|${peca.idPeca}|${etq}`);
        linhas.push({
          pecaId: peca.id,
          sku: peca.idPeca,
          descricao: peca.descricao,
          tipoEtiqueta: cartelaTipo ? 'Cartela' : 'Avulsa',
          tipoPeca: cartelaTipo || 'Avulsa',
          etiqueta: etq,
          status: peca.detranStatus,
          blingPedidoNum: peca.blingPedidoNum,
          dataVenda: peca.dataVenda,
          nfNumero: bling.nfNumero,
          clienteNome: bling.clienteNome,
          clienteDoc: bling.clienteDoc,
        });
      }
    }

    res.json({ ok: true, total: linhas.length, linhas });
  } catch (e) { next(e); }
});

// ─── POST /etiquetas-detran/:pecaId/confirmar-baixa ──────────────────────────
// Confirma baixa de uma etiqueta individual (mesma lógica do fluxo por moto)
etiquetasDetranRouter.post('/:pecaId/confirmar-baixa', async (req, res, next) => {
  try {
    const { pecaId } = req.params;
    const { etiqueta } = req.body;

    const peca = await prisma.peca.findUnique({ where: { id: Number(pecaId) } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peça não encontrada' });

    // Remove a etiqueta específica do campo (se tiver múltiplas)
    const etiquetasAtuais = (peca.detranEtiqueta || '').split('/').map((e: any) => e.trim()).filter(Boolean);
    const restantes = etiquetasAtuais.filter((e: string) => e !== etiqueta);

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        detranEtiqueta: restantes.length > 0 ? restantes.join(' / ') : null,
        detranStatus: restantes.length > 0 ? peca.detranStatus : 'Baixada',
      },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});
