import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { blingReq } from './bling';

export const etiquetasDetranRouter = Router();
const prisma = new PrismaClient();

type BlingVendaRef = {
  pedidoId?: string | null;
  pedidoNum?: string | null;
};

function splitEtiquetas(value: unknown) {
  return String(value || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFilterText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function textIncludes(value: unknown, filter: unknown) {
  const normalizedFilter = normalizeFilterText(filter);
  if (!normalizedFilter) return true;
  return normalizeFilterText(value).includes(normalizedFilter);
}

function getDetranStatusLabel(detranBaixada: boolean) {
  return detranBaixada ? 'Baixada' : 'Ativa';
}

function parseDetranStatusFilter(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'ativa' || normalized === 'ativo') return false;
  if (normalized === 'baixada' || normalized === 'baixado') return true;
  return null;
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function pickNotaNumero(value: any) {
  if (!value) return '';
  return firstText(
    value.numero,
    value.numeroNota,
    value.numeroNFe,
    value.numeroNfe,
    value.notaFiscal?.numero,
    value.nfe?.numero,
  );
}

function pickNotaId(value: any) {
  if (!value) return '';
  return firstText(
    value.id,
    value.idNotaFiscal,
    value.notaFiscal?.id,
    value.nfe?.id,
  );
}

function pickContatoNome(value: any) {
  return firstText(value?.nome, value?.contato?.nome, value?.destinatario?.nome);
}

function pickContatoDocumento(value: any) {
  return firstText(
    value?.numeroDocumento,
    value?.cpfCnpj,
    value?.cpf,
    value?.cnpj,
    value?.contato?.numeroDocumento,
    value?.contato?.cpfCnpj,
    value?.destinatario?.numeroDocumento,
    value?.destinatario?.cpfCnpj,
  );
}

async function safeBlingReq(pathUrl: string) {
  try {
    return await blingReq(pathUrl);
  } catch {
    return null;
  }
}

async function findPedidoVendaByNumero(pedidoNum: string) {
  if (!pedidoNum) return null;

  const encoded = encodeURIComponent(pedidoNum);
  const attempts = [
    `/pedidos/vendas?pagina=1&limite=10&numero=${encoded}`,
    `/pedidos/vendas?pagina=1&limite=10&numeroLoja=${encoded}`,
  ];

  for (const pathUrl of attempts) {
    const resp = await safeBlingReq(pathUrl);
    const rows = Array.isArray(resp?.data) ? resp.data : [];
    const exact = rows.find((row: any) => String(row?.numero || row?.numeroLoja || '').trim() === pedidoNum);
    if (exact || rows[0]) return exact || rows[0];
  }

  return null;
}

async function loadContatoDetalhe(contatoId: string) {
  if (!contatoId) return null;
  const resp = await safeBlingReq(`/contatos/${encodeURIComponent(contatoId)}`);
  return resp?.data || null;
}

async function loadNotaFiscalDetalhe(notaId: string) {
  if (!notaId) return null;
  const resp = await safeBlingReq(`/nfe/${encodeURIComponent(notaId)}`);
  return resp?.data || null;
}

async function findNotaFiscalByPedido(pedido: any, pedidoNum: string) {
  const directNota = pedido?.notaFiscal || pedido?.nfe || null;
  const directNumero = pickNotaNumero(directNota);
  if (directNumero) return directNota;

  const directId = pickNotaId(directNota);
  const detail = await loadNotaFiscalDetalhe(directId);
  if (detail) return detail;

  const possiblePedidoNumbers = [
    pedido?.numeroPedidoLoja,
    pedido?.numeroLoja,
    pedido?.numero,
    pedidoNum,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const number of Array.from(new Set(possiblePedidoNumbers))) {
    const encoded = encodeURIComponent(number);
    const attempts = [
      `/nfe?pagina=1&limite=10&numeroPedidoLoja=${encoded}`,
      `/nfe?pagina=1&limite=10&numeroLoja=${encoded}`,
    ];

    for (const pathUrl of attempts) {
      const resp = await safeBlingReq(pathUrl);
      const rows = Array.isArray(resp?.data) ? resp.data : [];
      if (rows[0]) return rows[0];
    }
  }

  return null;
}

async function loadBlingVendaInfo(ref: BlingVendaRef) {
  const pedidoNum = String(ref.pedidoNum || '').trim();
  let pedidoId = String(ref.pedidoId || '').trim();
  let pedido: any = null;

  if (pedidoId) {
    const resp = await safeBlingReq(`/pedidos/vendas/${encodeURIComponent(pedidoId)}`);
    pedido = resp?.data || null;
  }

  if (!pedido && pedidoNum) {
    const listRow = await findPedidoVendaByNumero(pedidoNum);
    pedidoId = firstText(listRow?.id, pedidoId);
    if (pedidoId) {
      const resp = await safeBlingReq(`/pedidos/vendas/${encodeURIComponent(pedidoId)}`);
      pedido = resp?.data || listRow || null;
    } else {
      pedido = listRow;
    }
  }

  const contatoId = firstText(pedido?.contato?.id);
  const contatoDetalhe = await loadContatoDetalhe(contatoId);
  const notaFiscal = pedido ? await findNotaFiscalByPedido(pedido, pedidoNum) : null;

  return {
    pedidoId,
    pedidoNum: firstText(pedido?.numero, pedidoNum),
    nfNumero: pickNotaNumero(notaFiscal),
    clienteNome: firstText(pickContatoNome(pedido?.contato), pickContatoNome(contatoDetalhe), pickContatoNome(notaFiscal)),
    clienteDoc: firstText(pickContatoDocumento(pedido?.contato), pickContatoDocumento(contatoDetalhe), pickContatoDocumento(notaFiscal)),
  };
}

// GET /etiquetas-detran
etiquetasDetranRouter.get('/', async (req, res, next) => {
  try {
    const { sku, descricao, tipoEtiqueta, tipoPeca, etiqueta, status, qtdeEtiquetasSku } = req.query as any;
    const detranBaixadaFilter = parseDetranStatusFilter(status);

    const pecas = await prisma.peca.findMany({
      where: {
        detranEtiqueta: { not: null },
        ...(sku ? { idPeca: { contains: String(sku), mode: 'insensitive' } } : {}),
        ...(descricao ? { descricao: { contains: String(descricao), mode: 'insensitive' } } : {}),
        ...(detranBaixadaFilter !== null ? { detranBaixada: detranBaixadaFilter } : {}),
      },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranStatus: true,
        detranBaixada: true,
        detranBaixadaAt: true,
        disponivel: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        dataVenda: true,
        motoId: true,
      },
      orderBy: { idPeca: 'asc' },
    });

    const motoIds = [...new Set(pecas.map((p) => p.motoId))];
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

    const linhas: any[] = [];
    for (const peca of pecas) {
      const etiquetas = splitEtiquetas(peca.detranEtiqueta);
      const quantidadeEtiquetasSku = etiquetas.length;
      if (qtdeEtiquetasSku === 'unica' && quantidadeEtiquetasSku !== 1) continue;
      if (qtdeEtiquetasSku === 'multiplas' && quantidadeEtiquetasSku <= 1) continue;

      for (const etq of etiquetas) {
        const cartelaTipo = cartelaMap.get(`${peca.motoId}|${peca.idPeca}|${etq}`);
        const tipoEtq = cartelaTipo ? 'Cartela' : 'Avulsa';
        const tipoPecaVal = cartelaTipo || 'Avulsa';

        if (!textIncludes(tipoEtq, tipoEtiqueta)) continue;
        if (!textIncludes(tipoPecaVal, tipoPeca)) continue;
        if (!textIncludes(etq, etiqueta)) continue;

        linhas.push({
          pecaId: peca.id,
          sku: peca.idPeca,
          descricao: peca.descricao,
          tipoEtiqueta: tipoEtq,
          tipoPeca: tipoPecaVal,
          etiqueta: etq,
          qtdeEtiquetasSku: quantidadeEtiquetasSku,
          status: getDetranStatusLabel(peca.detranBaixada),
          detranStatus: peca.detranStatus || null,
          detranBaixada: peca.detranBaixada,
          detranBaixadaAt: peca.detranBaixadaAt,
          disponivel: peca.disponivel,
          blingPedidoId: peca.blingPedidoId,
          blingPedidoNum: peca.blingPedidoNum,
          dataVenda: peca.dataVenda,
        });
      }
    }

    res.json({ ok: true, total: linhas.length, linhas });
  } catch (e) { next(e); }
});

// GET /etiquetas-detran/pendencias-baixa
etiquetasDetranRouter.get('/pendencias-baixa', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: {
        detranEtiqueta: { not: null },
        detranBaixada: false,
        disponivel: false,
        OR: [
          { blingPedidoId: { not: null } },
          { blingPedidoNum: { not: null } },
        ],
      },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranStatus: true,
        detranBaixada: true,
        detranBaixadaAt: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        dataVenda: true,
        motoId: true,
      },
      orderBy: { dataVenda: 'desc' },
    });

    const motoIds = [...new Set(pecas.map((p) => p.motoId))];
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

    const pedidosUnicos = new Map<string, BlingVendaRef>();
    for (const peca of pecas) {
      const pedidoId = peca.blingPedidoId ? String(peca.blingPedidoId) : null;
      const pedidoNum = peca.blingPedidoNum ? String(peca.blingPedidoNum) : null;
      const key = pedidoId ? `id:${pedidoId}` : `num:${pedidoNum}`;
      if (!pedidosUnicos.has(key)) pedidosUnicos.set(key, { pedidoId, pedidoNum });
    }

    const blingCache = new Map<string, Awaited<ReturnType<typeof loadBlingVendaInfo>>>();
    const pedidosRefs = Array.from(pedidosUnicos.entries());
    const chunks: Array<Array<[string, BlingVendaRef]>> = [];
    for (let i = 0; i < pedidosRefs.length; i += 5) chunks.push(pedidosRefs.slice(i, i + 5));

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async ([key, ref]) => {
        blingCache.set(key, await loadBlingVendaInfo(ref));
      }));
    }

    const linhas: any[] = [];
    for (const peca of pecas) {
      const etiquetas = splitEtiquetas(peca.detranEtiqueta);
      const pedidoKey = peca.blingPedidoId ? `id:${peca.blingPedidoId}` : `num:${peca.blingPedidoNum}`;
      const bling = blingCache.get(pedidoKey) || {
        pedidoId: '',
        pedidoNum: '',
        nfNumero: '',
        clienteNome: '',
        clienteDoc: '',
      };

      for (const etq of etiquetas) {
        const cartelaTipo = cartelaMap.get(`${peca.motoId}|${peca.idPeca}|${etq}`);
        linhas.push({
          pecaId: peca.id,
          sku: peca.idPeca,
          descricao: peca.descricao,
          tipoEtiqueta: cartelaTipo ? 'Cartela' : 'Avulsa',
          tipoPeca: cartelaTipo || 'Avulsa',
          etiqueta: etq,
          status: getDetranStatusLabel(peca.detranBaixada),
          detranStatus: peca.detranStatus || null,
          detranBaixada: peca.detranBaixada,
          detranBaixadaAt: peca.detranBaixadaAt,
          blingPedidoId: peca.blingPedidoId || bling.pedidoId,
          blingPedidoNum: peca.blingPedidoNum || bling.pedidoNum,
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

// POST /etiquetas-detran/:pecaId/confirmar-baixa
etiquetasDetranRouter.post('/:pecaId/confirmar-baixa', async (req, res, next) => {
  try {
    const { pecaId } = req.params;

    const peca = await prisma.peca.findUnique({ where: { id: Number(pecaId) } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada' });

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        detranBaixada: true,
        detranBaixadaAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});
