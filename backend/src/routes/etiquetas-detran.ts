import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { blingReq } from './bling';

export const etiquetasDetranRouter = Router();
const prisma = new PrismaClient();

const DETRAN_TIPOS = [
  'Balança', 'Banco', 'Bengala direita', 'Bengala esquerda', 'Bloco do motor',
  'Cabeçote', 'Carburador', 'Carenagem direita', 'Carenagem esquerda',
  'Carenagem frontal', 'Carenagem traseira', 'Estribo', 'Farol',
  'Guidão / semi-guidão', 'Lanterna', 'Mesa', 'Módulo de injeção/CDI',
  'Motor de arranque', 'Painel', 'Para-lama dianteiro', 'Para-lama traseiro',
  'Pedaleira direita', 'Pedaleira esquerda', 'Retrovisor direito',
  'Retrovisor esquerdo', 'Roda dianteira', 'Roda traseira', 'Tanque',
  'Cardã', 'Cavalete lateral', 'Corpo de injeção', 'Diferencial',
  'Escapamento', 'Radiador',
];

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

function isPreCadastroFilter(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'pre-cadastro';
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
    const soPreCadastro = isPreCadastroFilter(status);
    const detranBaixadaFilter = soPreCadastro ? null : parseDetranStatusFilter(status);

    const [pecas, historicoRows, preCadastros] = await Promise.all([
      soPreCadastro ? Promise.resolve([]) : prisma.peca.findMany({
        where: {
          detranEtiqueta: { not: null },
          ...(sku ? { idPeca: { contains: String(sku), mode: 'insensitive' } } : {}),
          ...(descricao ? { descricao: { contains: String(descricao), mode: 'insensitive' } } : {}),
          ...(detranBaixadaFilter !== null ? { detranBaixada: detranBaixadaFilter } : {}),
        },
        select: {
          id: true, idPeca: true, descricao: true, detranEtiqueta: true,
          detranStatus: true, detranBaixada: true, detranBaixadaAt: true,
          disponivel: true, blingPedidoId: true, blingPedidoNum: true,
          dataVenda: true, motoId: true, tipoPecaAvulsa: true,
        },
        orderBy: { idPeca: 'asc' },
      }),
      soPreCadastro ? Promise.resolve([]) : prisma.historicoDevolucao.findMany({
        where: {
          etiquetasDetran: { not: null },
          ...(sku ? { idPeca: { contains: String(sku), mode: 'insensitive' } } : {}),
          ...(descricao ? { descricao: { contains: String(descricao), mode: 'insensitive' } } : {}),
          ...(detranBaixadaFilter !== null ? { etiquetaBaixada: detranBaixadaFilter } : {}),
        },
        select: {
          pecaId: true, idPeca: true, descricao: true, motoId: true,
          etiquetasDetran: true, etiquetaBaixada: true,
          pedidoBlingId: true, pedidoBlingNum: true, dataVenda: true,
        },
        orderBy: { dataDevolucao: 'desc' },
      }),
      (!status || soPreCadastro) ? prisma.cadastroPeca.findMany({
        where: {
          status: 'pre_cadastro',
          detranEtiqueta: { not: null },
          ...(sku ? { idPeca: { contains: String(sku), mode: 'insensitive' } } : {}),
          ...(descricao ? { descricao: { contains: String(descricao), mode: 'insensitive' } } : {}),
        },
        select: {
          id: true, idPeca: true, descricao: true, motoId: true,
          detranEtiqueta: true, tipoPecaAvulsa: true, createdAt: true,
        },
        orderBy: { idPeca: 'asc' },
      }) : Promise.resolve([]),
    ]);

    const allMotoIds = [...new Set([...pecas.map((p) => p.motoId), ...historicoRows.map((h) => h.motoId)])];
    const posicoes = await prisma.motoDetranPosicao.findMany({
      where: { motoId: { in: allMotoIds }, idPeca: { not: null } },
      select: { motoId: true, idPeca: true, etiqueta: true, tipo: true },
    });

    const cartelaMap = new Map<string, string>();
    for (const pos of posicoes) {
      if (pos.idPeca && pos.etiqueta) {
        cartelaMap.set(`${pos.motoId}|${pos.idPeca}|${pos.etiqueta}`, pos.tipo);
      }
    }

    const linhas: any[] = [];
    const activeEtiquetas = new Set<string>();

    for (const peca of pecas) {
      const etiquetas = splitEtiquetas(peca.detranEtiqueta);
      const quantidadeEtiquetasSku = etiquetas.length;
      if (qtdeEtiquetasSku === 'unica' && quantidadeEtiquetasSku !== 1) continue;
      if (qtdeEtiquetasSku === 'multiplas' && quantidadeEtiquetasSku <= 1) continue;

      for (const etq of etiquetas) {
        activeEtiquetas.add(etq.toUpperCase());
        const cartelaTipo = cartelaMap.get(`${peca.motoId}|${peca.idPeca}|${etq}`);
        const matchCartela = etq.match(/^(.*?)(\d{3})$/);
        const posicaoCartela = matchCartela ? Number(matchCartela[2]) : 0;
        const isCartelaEtq = posicaoCartela >= 1 && posicaoCartela <= 34;
        const tipoEtq = (cartelaTipo || isCartelaEtq) ? 'Cartela' : 'Avulsa';
        const tipoPecaVal = cartelaTipo
          || (isCartelaEtq ? DETRAN_TIPOS[posicaoCartela - 1] : null)
          || (peca as any).tipoPecaAvulsa
          || 'Avulsa';

        if (!textIncludes(tipoEtq, tipoEtiqueta)) continue;
        if (!textIncludes(tipoPecaVal, tipoPeca)) continue;
        if (!textIncludes(etq, etiqueta)) continue;

        linhas.push({
          pecaId: peca.id, sku: peca.idPeca, descricao: peca.descricao,
          tipoEtiqueta: tipoEtq, tipoPeca: tipoPecaVal, etiqueta: etq,
          qtdeEtiquetasSku: quantidadeEtiquetasSku,
          status: getDetranStatusLabel(peca.detranBaixada),
          detranStatus: peca.detranStatus || null, detranBaixada: peca.detranBaixada,
          detranBaixadaAt: peca.detranBaixadaAt, disponivel: peca.disponivel,
          blingPedidoId: peca.blingPedidoId, blingPedidoNum: peca.blingPedidoNum,
          dataVenda: peca.dataVenda, fromHistorico: false, isPreCadastro: false,
        });
      }
    }

    // Etiquetas do histórico de devoluções que não estão mais ativas em nenhuma peça
    const seenHistorico = new Set<string>();
    for (const row of historicoRows) {
      const etqs = splitEtiquetas(row.etiquetasDetran);
      const quantidadeEtiquetasSku = etqs.length;
      if (qtdeEtiquetasSku === 'unica' && quantidadeEtiquetasSku !== 1) continue;
      if (qtdeEtiquetasSku === 'multiplas' && quantidadeEtiquetasSku <= 1) continue;

      for (const etq of etqs) {
        const key = etq.toUpperCase();
        if (activeEtiquetas.has(key) || seenHistorico.has(key)) continue;
        seenHistorico.add(key);

        if (!textIncludes(etq, etiqueta)) continue;

        const cartelaTipo = cartelaMap.get(`${row.motoId}|${row.idPeca}|${etq}`);
        const matchCartelaH = etq.match(/^(.*?)(\d{3})$/);
        const posicaoCartelaH = matchCartelaH ? Number(matchCartelaH[2]) : 0;
        const isCartelaEtqH = posicaoCartelaH >= 1 && posicaoCartelaH <= 34;
        const tipoEtq = (cartelaTipo || isCartelaEtqH) ? 'Cartela' : 'Avulsa';
        const tipoPecaVal = cartelaTipo
          || (isCartelaEtqH ? DETRAN_TIPOS[posicaoCartelaH - 1] : null)
          || 'Avulsa';

        if (!textIncludes(tipoEtq, tipoEtiqueta)) continue;
        if (!textIncludes(tipoPecaVal, tipoPeca)) continue;

        linhas.push({
          pecaId: row.pecaId, sku: row.idPeca, descricao: row.descricao,
          tipoEtiqueta: tipoEtq, tipoPeca: tipoPecaVal, etiqueta: etq,
          qtdeEtiquetasSku: quantidadeEtiquetasSku,
          status: getDetranStatusLabel(row.etiquetaBaixada),
          detranStatus: null, detranBaixada: row.etiquetaBaixada,
          detranBaixadaAt: null, disponivel: null,
          blingPedidoId: row.pedidoBlingId || null, blingPedidoNum: row.pedidoBlingNum || null,
          dataVenda: row.dataVenda, fromHistorico: true,
        });
      }
    }

    // Pré-cadastros com etiqueta
    for (const pc of preCadastros) {
      const etqs = splitEtiquetas(pc.detranEtiqueta);
      const quantidadeEtiquetasSku = etqs.length;
      if (qtdeEtiquetasSku === 'unica' && quantidadeEtiquetasSku !== 1) continue;
      if (qtdeEtiquetasSku === 'multiplas' && quantidadeEtiquetasSku <= 1) continue;

      for (const etq of etqs) {
        const matchCartela = etq.match(/^(.*?)(\d{3})$/);
        const posicao = matchCartela ? Number(matchCartela[2]) : 0;
        const isCartela = posicao >= 1 && posicao <= 34;
        const cartelaTipo = isCartela ? cartelaMap.get(`${pc.motoId}|${pc.idPeca}|${etq}`) : undefined;
        const tipoPecaVal = cartelaTipo
          || (isCartela ? DETRAN_TIPOS[posicao - 1] : null)
          || pc.tipoPecaAvulsa
          || 'Avulsa';
        const tipoEtq = isCartela ? 'Cartela' : 'Avulsa';

        if (!textIncludes(tipoEtq, tipoEtiqueta)) continue;
        if (tipoPeca && !textIncludes(tipoPecaVal || '', tipoPeca)) continue;
        if (!textIncludes(etq, etiqueta)) continue;

        linhas.push({
          pecaId: pc.id, sku: pc.idPeca, descricao: pc.descricao,
          tipoEtiqueta: tipoEtq, tipoPeca: tipoPecaVal || '-',
          etiqueta: etq, qtdeEtiquetasSku: quantidadeEtiquetasSku,
          status: 'Pré-Cadastro',
          detranStatus: null, detranBaixada: false, detranBaixadaAt: null,
          disponivel: null, blingPedidoId: null, blingPedidoNum: null,
          dataVenda: null, fromHistorico: false, isPreCadastro: true,
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

// POST /etiquetas-detran/validar
etiquetasDetranRouter.post('/validar', async (req, res, next) => {
  try {
    type DetranRow = { etiqueta: string; descricao?: string; saldo?: number; modelo?: string; placa?: string; chassis?: string; dtEntrada?: string };
    const linhasDetran: DetranRow[] = Array.isArray(req.body?.linhasDetran) ? req.body.linhasDetran : [];
    if (!linhasDetran.length) return res.status(400).json({ ok: false, error: 'Nenhuma linha do DETRAN enviada.' });

    const detranMap = new Map<string, DetranRow>();
    for (const row of linhasDetran) {
      const etq = String(row.etiqueta || '').trim().toUpperCase();
      if (etq) detranMap.set(etq, row);
    }

    const [pecas, historico, preCadastros] = await Promise.all([
      prisma.peca.findMany({
        where: { detranEtiqueta: { not: null } },
        select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, detranBaixada: true, motoId: true },
      }),
      prisma.historicoDevolucao.findMany({
        where: { etiquetasDetran: { not: null } },
        select: { pecaId: true, idPeca: true, descricao: true, etiquetasDetran: true, etiquetaBaixada: true, motoId: true },
      }),
      prisma.cadastroPeca.findMany({
        where: { status: 'pre_cadastro', detranEtiqueta: { not: null } },
        select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true },
      }),
    ]);

    type AnbEntry = { sku: string; descricao: string; baixada: boolean; fonte: string; motoId: number | null };
    const anbMap = new Map<string, AnbEntry>();

    for (const p of pecas) {
      for (const etq of splitEtiquetas(p.detranEtiqueta)) {
        anbMap.set(etq.toUpperCase(), { sku: p.idPeca, descricao: p.descricao, baixada: p.detranBaixada, fonte: 'peca', motoId: p.motoId });
      }
    }
    for (const h of historico) {
      for (const etq of splitEtiquetas(h.etiquetasDetran)) {
        const key = etq.toUpperCase();
        if (!anbMap.has(key)) anbMap.set(key, { sku: h.idPeca, descricao: h.descricao, baixada: h.etiquetaBaixada ?? false, fonte: 'historico', motoId: h.motoId });
      }
    }
    for (const pc of preCadastros) {
      for (const etq of splitEtiquetas(pc.detranEtiqueta)) {
        const key = etq.toUpperCase();
        if (!anbMap.has(key)) anbMap.set(key, { sku: pc.idPeca, descricao: pc.descricao, baixada: false, fonte: 'pre_cadastro', motoId: null });
      }
    }

    // Busca motos pela placa do DETRAN e pelo motoId do ANB
    // Normaliza placas: strip espaços/hifens, uppercase — para casar com o cadastro ANB
    const normPlaca = (s: string) => s.toUpperCase().replace(/[\s\-]/g, '').trim();
    const detranPlacasRaw = [...detranMap.values()].map(r => r.placa).filter((p): p is string => !!p);
    const anbMotoIds = [...anbMap.values()].map(e => e.motoId).filter((id): id is number => id != null);
    // Prisma não suporta mode:'insensitive' com 'in', então traz todas as motos necessárias
    // por id (exato) e filtra por placa em JS após normalizar ambos os lados
    const motosRaw = await prisma.moto.findMany({
      where: {
        OR: [
          ...(anbMotoIds.length ? [{ id: { in: anbMotoIds } }] : []),
          ...(detranPlacasRaw.length ? [{ placa: { not: null } }] : []),
        ],
      },
      select: { id: true, placa: true, detranCartelaId: true, modelo: true, marca: true },
    });
    const motoByPlaca = new Map<string, typeof motosRaw[0]>();
    const motoById = new Map<number, typeof motosRaw[0]>();
    const detranPlacasNorm = new Set(detranPlacasRaw.map(normPlaca));
    for (const m of motosRaw) {
      if (m.placa && detranPlacasNorm.has(normPlaca(m.placa))) motoByPlaca.set(normPlaca(m.placa), m);
      motoById.set(m.id, m);
    }
    const motos = motosRaw; // alias mantido para tipo

    type Linha = {
      etiqueta: string; situacao: 'ok' | 'so_detran' | 'so_anb' | 'divergencia'; detalhe?: string;
      anbSku?: string; anbDescricao?: string; anbStatus?: string; anbFonte?: string;
      motoAnbId?: number; motoPrefixo?: string; motoModelo?: string;
      detranDescricao?: string; detranSaldo?: number; detranModelo?: string; detranPlaca?: string;
    };

    const linhas: Linha[] = [];

    for (const [etq, row] of detranMap) {
      const anb = anbMap.get(etq);
      const saldo = Number(row.saldo ?? 1);
      const detranAtivo = saldo > 0;
      const motoFromPlaca = row.placa ? motoByPlaca.get(normPlaca(row.placa)) : undefined;
      const motoFromAnb = anb?.motoId ? motoById.get(anb.motoId) : undefined;
      const moto = motoFromPlaca || motoFromAnb;
      const motoFields = moto ? { motoAnbId: moto.id, motoPrefixo: moto.detranCartelaId ?? undefined, motoModelo: [moto.marca, moto.modelo].filter(Boolean).join(' ') } : {};
      const base = { etiqueta: etq, detranDescricao: row.descricao, detranSaldo: saldo, detranModelo: row.modelo, detranPlaca: row.placa, ...motoFields };

      if (!anb) {
        linhas.push({ ...base, situacao: 'so_detran' });
      } else {
        const anbStatus = anb.baixada ? 'Baixada' : anb.fonte === 'pre_cadastro' ? 'Pré-Cadastro' : 'Ativa';
        if (detranAtivo === !anb.baixada) {
          linhas.push({ ...base, situacao: 'ok', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus, anbFonte: anb.fonte });
        } else {
          linhas.push({ ...base, situacao: 'divergencia', detalhe: detranAtivo ? 'DETRAN ativo / ANB baixada' : 'DETRAN sem saldo / ANB ativa', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus, anbFonte: anb.fonte });
        }
      }
    }

    for (const [etq, anb] of anbMap) {
      if (!detranMap.has(etq) && !anb.baixada) {
        const moto = anb.motoId ? motoById.get(anb.motoId) : undefined;
        const motoFields = moto ? { motoAnbId: moto.id, motoPrefixo: moto.detranCartelaId ?? undefined, motoModelo: [moto.marca, moto.modelo].filter(Boolean).join(' ') } : {};
        linhas.push({ etiqueta: etq, situacao: 'so_anb', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus: anb.fonte === 'pre_cadastro' ? 'Pré-Cadastro' : 'Ativa', anbFonte: anb.fonte, ...motoFields });
      }
    }

    const resumo = {
      totalDetran: detranMap.size,
      totalAnb: anbMap.size,
      ok: linhas.filter(l => l.situacao === 'ok').length,
      soDetran: linhas.filter(l => l.situacao === 'so_detran').length,
      soAnb: linhas.filter(l => l.situacao === 'so_anb').length,
      divergencias: linhas.filter(l => l.situacao === 'divergencia').length,
    };

    res.json({ ok: true, resumo, linhas });
  } catch (e) { next(e); }
});

// POST /etiquetas-detran/:pecaId/confirmar-baixa
etiquetasDetranRouter.post('/:pecaId/confirmar-baixa', async (req, res, next) => {
  try {
    const { pecaId } = req.params;
    const { comprovanteNome, comprovanteArquivo } = req.body || {};

    const peca = await prisma.peca.findUnique({ where: { id: Number(pecaId) } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada' });

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        detranBaixada: true,
        detranBaixadaAt: new Date(),
        ...(comprovanteNome    ? { detranComprovanteNome:    comprovanteNome }    : {}),
        ...(comprovanteArquivo ? { detranComprovanteArquivo: comprovanteArquivo } : {}),
      },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /etiquetas-detran/:pecaId/tipo-peca
etiquetasDetranRouter.patch('/:pecaId/tipo-peca', async (req, res, next) => {
  try {
    const pecaId = Number(req.params.pecaId);
    const { tipoPeca, isPreCadastro } = req.body as { tipoPeca: string; isPreCadastro?: boolean };
    if (!tipoPeca || !DETRAN_TIPOS.includes(tipoPeca)) {
      return res.status(400).json({ error: 'Tipo de peça inválido' });
    }
    if (isPreCadastro) {
      await prisma.cadastroPeca.update({ where: { id: pecaId }, data: { tipoPecaAvulsa: tipoPeca } });
    } else {
      await prisma.peca.update({ where: { id: pecaId }, data: { tipoPecaAvulsa: tipoPeca } });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
