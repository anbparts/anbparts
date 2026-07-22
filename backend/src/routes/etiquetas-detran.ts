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

// Etiqueta é de cartela quando: termina em 001..034 (posição) E a base (sem os 3 dígitos)
// é exatamente o prefixo da cartela da moto (detranCartelaId). Só a posição não basta —
// uma avulsa pode coincidir nos últimos 3 dígitos; precisa bater a base da moto.
function ehEtiquetaCartelaDaMoto(etq: unknown, cartelaBase: unknown) {
  const s = String(etq || '').trim();
  const base = String(cartelaBase || '').trim();
  if (!base || s.length <= 3) return false;
  const pos = Number(s.slice(-3));
  return pos >= 1 && pos <= 34 && s.slice(0, -3) === base;
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

// Tipo de peça por etiqueta: usa a cartela da moto (MotoDetranPosicao, chave motoId|etiqueta,
// sem exigir SKU já vinculado) com fallback pela posição (001-034) do numero da etiqueta e,
// por ultimo, o tipo informado manualmente na peca/pre-cadastro avulso. Compartilhada entre
// /validar (etiquetas ativas) e /validar-baixa (etiquetas baixadas).
function calcularTipoPeca(etq: string, motoId: number | null | undefined, cartelaMap: Map<string, string>, tipoAvulsaFallback?: string | null) {
  const cartelaTipo = motoId != null ? cartelaMap.get(`${motoId}|${etq.toUpperCase()}`) : undefined;
  const match = etq.match(/^(.*?)(\d{3})$/);
  const posicao = match ? Number(match[2]) : 0;
  const isCartela = posicao >= 1 && posicao <= 34;
  return cartelaTipo || (isCartela ? DETRAN_TIPOS[posicao - 1] : null) || tipoAvulsaFallback || null;
}

async function carregarCartelaMap(motoIds: number[]) {
  const posicoesCartela = motoIds.length
    ? await prisma.motoDetranPosicao.findMany({
        where: { motoId: { in: motoIds } },
        select: { motoId: true, etiqueta: true, tipo: true },
      })
    : [];
  const cartelaMap = new Map<string, string>();
  for (const pos of posicoesCartela) {
    if (pos.etiqueta) cartelaMap.set(`${pos.motoId}|${pos.etiqueta.toUpperCase()}`, pos.tipo);
  }
  return cartelaMap;
}

// Carrega o status de baixa POR etiqueta (tabela DetranEtiquetaBaixa) para um conjunto de peças.
// Retorna Map "pecaId|etiqueta" -> { baixadaEm }. Tolera tabela ainda não migrada (cai no fallback peca.detranBaixada).
async function loadBaixasPorEtiqueta(pecaIds: number[]) {
  const map = new Map<string, { baixadaEm: Date }>();
  const ids = Array.from(new Set(pecaIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) return map;
  try {
    const rows = await prisma.$queryRawUnsafe<{ pecaId: number; etiqueta: string; baixadaEm: Date }[]>(
      `SELECT "pecaId", "etiqueta", "baixadaEm" FROM "DetranEtiquetaBaixa" WHERE "pecaId" IN (${ids.join(',')})`,
    );
    for (const r of rows) map.set(`${Number(r.pecaId)}|${String(r.etiqueta).trim()}`, { baixadaEm: r.baixadaEm });
  } catch {
    // tabela ainda não migrada — segue com o fallback
  }
  return map;
}

// Janela de pendência de ativação: etiqueta avulsa com cadastro nos últimos 30 dias e sem ativação.
// Acima de 30 dias é assumida ativa por idade.
const ATIVACAO_JANELA_DIAS = 30;
function ativacaoCutoff() {
  return new Date(Date.now() - ATIVACAO_JANELA_DIAS * 24 * 60 * 60 * 1000);
}

// Carrega a ativação POR etiqueta (tabela DetranEtiquetaAtivacao). Map "pecaId|etiqueta" -> { ativadaEm }.
async function loadAtivacoesPorEtiqueta(pecaIds: number[]) {
  const map = new Map<string, { ativadaEm: Date }>();
  const ids = Array.from(new Set(pecaIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) return map;
  try {
    const rows = await prisma.$queryRawUnsafe<{ pecaId: number; etiqueta: string; ativadaEm: Date }[]>(
      `SELECT "pecaId", "etiqueta", "ativadaEm" FROM "DetranEtiquetaAtivacao" WHERE "pecaId" IN (${ids.join(',')})`,
    );
    for (const r of rows) map.set(`${Number(r.pecaId)}|${String(r.etiqueta).trim()}`, { ativadaEm: r.ativadaEm });
  } catch {
    // tabela ainda não migrada — segue com o fallback (tudo ativo)
  }
  return map;
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
          // status (Ativa/Baixada) é filtrado por etiqueta mais abaixo, não pela flag da peça,
          // pois uma peça "Par" pode ter 1 etiqueta baixada e outra ativa.
        },
        select: {
          id: true, idPeca: true, descricao: true, detranEtiqueta: true,
          detranStatus: true, detranBaixada: true, detranBaixadaAt: true,
          disponivel: true, blingPedidoId: true, blingPedidoNum: true,
          dataVenda: true, motoId: true, tipoPecaAvulsa: true, cadastro: true,
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

    const motosCartela = allMotoIds.length
      ? await (prisma as any).moto.findMany({ where: { id: { in: allMotoIds } }, select: { id: true, detranCartelaId: true } })
      : [];
    const cartelaBaseByMoto = new Map<number, string>((motosCartela as any[]).map((m: any) => [m.id, String(m.detranCartelaId || '')]));

    const baixasMap = await loadBaixasPorEtiqueta(pecas.map((p) => p.id));
    const ativacoesMap = await loadAtivacoesPorEtiqueta(pecas.map((p) => p.id));
    const cutoffAtivacao = ativacaoCutoff();

    const linhas: any[] = [];
    const activeEtiquetas = new Set<string>();

    for (const peca of pecas) {
      const etiquetas = splitEtiquetas(peca.detranEtiqueta);
      const quantidadeEtiquetasSku = etiquetas.length;
      if (qtdeEtiquetasSku === 'unica' && quantidadeEtiquetasSku !== 1) continue;
      if (qtdeEtiquetasSku === 'multiplas' && quantidadeEtiquetasSku <= 1) continue;

      for (const etq of etiquetas) {
        activeEtiquetas.add(etq.toUpperCase());
        // Status por etiqueta: baixada se houver registro na tabela; senão cai na flag da peça.
        const baixaEtq = baixasMap.get(`${peca.id}|${etq}`);
        const etqBaixada = !!baixaEtq || peca.detranBaixada;
        if (detranBaixadaFilter !== null && etqBaixada !== detranBaixadaFilter) continue;
        const etqBaixadaAt = baixaEtq?.baixadaEm ?? (etqBaixada ? peca.detranBaixadaAt : null);
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

        // Etiqueta avulsa (sem cartela) com tipo definido, cadastro <= 30 dias e sem ativação = Pendente Ativação.
        // Acima de 30 dias ou já ativada = Ativa (a menos que esteja baixada).
        const ehAvulsaPendente = !etqBaixada
          && !cartelaTipo
          && !ehEtiquetaCartelaDaMoto(etq, cartelaBaseByMoto.get(peca.motoId))
          && !!(peca as any).tipoPecaAvulsa
          && !ativacoesMap.has(`${peca.id}|${etq}`)
          && !!peca.cadastro && new Date(peca.cadastro) >= cutoffAtivacao;
        const statusLabel = etqBaixada ? 'Baixada' : (ehAvulsaPendente ? 'Pendente Ativação' : 'Ativa');

        linhas.push({
          pecaId: peca.id, sku: peca.idPeca, descricao: peca.descricao,
          tipoEtiqueta: tipoEtq, tipoPeca: tipoPecaVal, etiqueta: etq,
          qtdeEtiquetasSku: quantidadeEtiquetasSku,
          status: statusLabel,
          pendenteAtivacao: ehAvulsaPendente,
          detranStatus: peca.detranStatus || null, detranBaixada: etqBaixada,
          detranBaixadaAt: etqBaixadaAt, disponivel: peca.disponivel,
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

    const baixasMap = await loadBaixasPorEtiqueta(pecas.map((p) => p.id));

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
        // Pendência é por etiqueta: pula as que já foram baixadas individualmente.
        if (baixasMap.has(`${peca.id}|${etq}`)) continue;
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
        select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, detranBaixada: true, motoId: true, tipoPecaAvulsa: true },
      }),
      prisma.historicoDevolucao.findMany({
        where: { etiquetasDetran: { not: null } },
        select: { pecaId: true, idPeca: true, descricao: true, etiquetasDetran: true, etiquetaBaixada: true, motoId: true },
      }),
      prisma.cadastroPeca.findMany({
        where: { status: 'pre_cadastro', detranEtiqueta: { not: null } },
        select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, motoId: true, tipoPecaAvulsa: true },
      }),
    ]);

    type AnbEntry = { sku: string; descricao: string; baixada: boolean; fonte: string; motoId: number | null; tipoPecaAvulsa?: string | null };
    const anbMap = new Map<string, AnbEntry>();

    const baixasMap = await loadBaixasPorEtiqueta(pecas.map((p) => p.id));
    for (const p of pecas) {
      for (const etq of splitEtiquetas(p.detranEtiqueta)) {
        // Baixa por etiqueta: usa a tabela; cai na flag da peça se não houver registro.
        const baixada = baixasMap.has(`${p.id}|${etq}`) || p.detranBaixada;
        anbMap.set(etq.toUpperCase(), { sku: p.idPeca, descricao: p.descricao, baixada, fonte: 'peca', motoId: p.motoId, tipoPecaAvulsa: p.tipoPecaAvulsa });
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
        if (!anbMap.has(key)) anbMap.set(key, { sku: pc.idPeca, descricao: pc.descricao, baixada: false, fonte: 'pre_cadastro', motoId: pc.motoId, tipoPecaAvulsa: pc.tipoPecaAvulsa });
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

    // Tipo de peça por etiqueta: cartela da moto (cobre tambem "Só DETRAN", sem SKU vinculado
    // ainda) + fallback por posição (001-034) + fallback do tipo avulso cadastrado na peça.
    const cartelaMap = await carregarCartelaMap(motosRaw.map((m) => m.id));

    type Linha = {
      etiqueta: string; situacao: 'ok' | 'so_detran' | 'so_anb' | 'divergencia'; detalhe?: string;
      anbSku?: string; anbDescricao?: string; anbStatus?: string; anbFonte?: string; tipoPeca?: string | null;
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
        const tipoPeca = calcularTipoPeca(etq, moto?.id, cartelaMap);
        linhas.push({ ...base, situacao: 'so_detran', tipoPeca });
      } else {
        const anbStatus = anb.baixada ? 'Baixada' : anb.fonte === 'pre_cadastro' ? 'Pré-Cadastro' : 'Ativa';
        const tipoPeca = calcularTipoPeca(etq, moto?.id, cartelaMap, anb.tipoPecaAvulsa);
        if (detranAtivo === !anb.baixada) {
          linhas.push({ ...base, situacao: 'ok', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus, anbFonte: anb.fonte, tipoPeca });
        } else {
          linhas.push({ ...base, situacao: 'divergencia', detalhe: detranAtivo ? 'DETRAN ativo / ANB baixada' : 'DETRAN sem saldo / ANB ativa', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus, anbFonte: anb.fonte, tipoPeca });
        }
      }
    }

    for (const [etq, anb] of anbMap) {
      if (!detranMap.has(etq) && !anb.baixada) {
        const moto = anb.motoId ? motoById.get(anb.motoId) : undefined;
        const motoFields = moto ? { motoAnbId: moto.id, motoPrefixo: moto.detranCartelaId ?? undefined, motoModelo: [moto.marca, moto.modelo].filter(Boolean).join(' ') } : {};
        const tipoPeca = calcularTipoPeca(etq, anb.motoId, cartelaMap, anb.tipoPecaAvulsa);
        linhas.push({ etiqueta: etq, situacao: 'so_anb', anbSku: anb.sku, anbDescricao: anb.descricao, anbStatus: anb.fonte === 'pre_cadastro' ? 'Pré-Cadastro' : 'Ativa', anbFonte: anb.fonte, tipoPeca, ...motoFields });
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

// ── POST /etiquetas-detran/validar-baixa ───────────────────────────────────────
// Confronta a planilha de baixas JA CONFIRMADAS no DETRAN (uma linha por etiqueta baixada:
// Documento do Comprador, Nome/Razao Social, Etiqueta, Peca, Quantidade, Data, Realizado Por,
// E Peca Fusao) contra as etiquetas que o ANB marca como baixadas (DetranEtiquetaBaixa/
// Peca.detranBaixada + HistoricoDevolucao.etiquetaBaixada). Nao persiste nada, so compara.
etiquetasDetranRouter.post('/validar-baixa', async (req, res, next) => {
  try {
    type BaixaRow = {
      etiqueta: string; documentoComprador?: string; nomeComprador?: string;
      pecaDescricao?: string; quantidade?: number; data?: string; realizadoPor?: string; pecaFusao?: string;
    };
    const linhasBaixa: BaixaRow[] = Array.isArray(req.body?.linhasBaixa) ? req.body.linhasBaixa : [];
    if (!linhasBaixa.length) return res.status(400).json({ ok: false, error: 'Nenhuma linha da planilha de baixa enviada.' });

    const planilhaMap = new Map<string, BaixaRow>();
    for (const row of linhasBaixa) {
      const etq = String(row.etiqueta || '').trim().toUpperCase();
      if (etq) planilhaMap.set(etq, row);
    }

    const [pecas, historico] = await Promise.all([
      prisma.peca.findMany({
        where: { detranEtiqueta: { not: null } },
        select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, detranBaixada: true, motoId: true, tipoPecaAvulsa: true },
      }),
      prisma.historicoDevolucao.findMany({
        where: { etiquetasDetran: { not: null }, etiquetaBaixada: true },
        select: { pecaId: true, idPeca: true, descricao: true, etiquetasDetran: true, motoId: true },
      }),
    ]);

    type AnbBaixaEntry = { sku: string; descricao: string; motoId: number | null; baixadaEm: Date | null; fonte: string; tipoPecaAvulsa?: string | null };
    const anbBaixadasMap = new Map<string, AnbBaixaEntry>();

    const baixasMap = await loadBaixasPorEtiqueta(pecas.map((p) => p.id));
    for (const p of pecas) {
      for (const etq of splitEtiquetas(p.detranEtiqueta)) {
        const baixaEtq = baixasMap.get(`${p.id}|${etq}`);
        const baixada = !!baixaEtq || p.detranBaixada;
        if (!baixada) continue;
        anbBaixadasMap.set(etq.toUpperCase(), {
          sku: p.idPeca, descricao: p.descricao, motoId: p.motoId,
          baixadaEm: baixaEtq?.baixadaEm ?? null, fonte: 'peca', tipoPecaAvulsa: p.tipoPecaAvulsa,
        });
      }
    }
    for (const h of historico) {
      for (const etq of splitEtiquetas(h.etiquetasDetran)) {
        const key = etq.toUpperCase();
        if (!anbBaixadasMap.has(key)) anbBaixadasMap.set(key, { sku: h.idPeca, descricao: h.descricao, motoId: h.motoId, baixadaEm: null, fonte: 'historico' });
      }
    }

    const motoIds = [...new Set([...anbBaixadasMap.values()].map((e) => e.motoId).filter((id): id is number => id != null))];
    const motosRaw = motoIds.length
      ? await prisma.moto.findMany({ where: { id: { in: motoIds } }, select: { id: true, detranCartelaId: true, modelo: true, marca: true } })
      : [];
    const motoById = new Map(motosRaw.map((m) => [m.id, m]));
    const cartelaMap = await carregarCartelaMap(motoIds);

    // Melhor esforço: a descricao da planilha vem como "Peca Desmonte, <Tipo>, <Moto>, <ano>, <ano>".
    function tipoPecaDaDescricaoPlanilha(descricao?: string) {
      const partes = String(descricao || '').split(',').map((p) => p.trim()).filter(Boolean);
      return partes[1] || null;
    }

    type LinhaBaixa = {
      etiqueta: string; situacao: 'ok' | 'so_planilha' | 'so_anb'; tipoPeca?: string | null;
      anbSku?: string; anbDescricao?: string; anbFonte?: string; anbBaixadaEm?: Date | null;
      motoAnbId?: number; motoPrefixo?: string; motoModelo?: string;
      planilhaDocumentoComprador?: string; planilhaNomeComprador?: string; planilhaPecaDescricao?: string;
      planilhaQuantidade?: number; planilhaData?: string; planilhaRealizadoPor?: string; planilhaPecaFusao?: string;
    };
    const linhas: LinhaBaixa[] = [];

    for (const [etq, row] of planilhaMap) {
      const anb = anbBaixadasMap.get(etq);
      const planilhaFields = {
        planilhaDocumentoComprador: row.documentoComprador, planilhaNomeComprador: row.nomeComprador,
        planilhaPecaDescricao: row.pecaDescricao, planilhaQuantidade: row.quantidade,
        planilhaData: row.data, planilhaRealizadoPor: row.realizadoPor, planilhaPecaFusao: row.pecaFusao,
      };

      if (!anb) {
        const tipoPeca = tipoPecaDaDescricaoPlanilha(row.pecaDescricao) || calcularTipoPeca(etq, null, cartelaMap);
        linhas.push({ etiqueta: etq, situacao: 'so_planilha', tipoPeca, ...planilhaFields });
      } else {
        const moto = anb.motoId ? motoById.get(anb.motoId) : undefined;
        const motoFields = moto ? { motoAnbId: moto.id, motoPrefixo: moto.detranCartelaId ?? undefined, motoModelo: [moto.marca, moto.modelo].filter(Boolean).join(' ') } : {};
        const tipoPeca = calcularTipoPeca(etq, anb.motoId, cartelaMap, anb.tipoPecaAvulsa);
        linhas.push({
          etiqueta: etq, situacao: 'ok', tipoPeca,
          anbSku: anb.sku, anbDescricao: anb.descricao, anbFonte: anb.fonte, anbBaixadaEm: anb.baixadaEm,
          ...motoFields, ...planilhaFields,
        });
      }
    }

    for (const [etq, anb] of anbBaixadasMap) {
      if (!planilhaMap.has(etq)) {
        const moto = anb.motoId ? motoById.get(anb.motoId) : undefined;
        const motoFields = moto ? { motoAnbId: moto.id, motoPrefixo: moto.detranCartelaId ?? undefined, motoModelo: [moto.marca, moto.modelo].filter(Boolean).join(' ') } : {};
        const tipoPeca = calcularTipoPeca(etq, anb.motoId, cartelaMap, anb.tipoPecaAvulsa);
        linhas.push({ etiqueta: etq, situacao: 'so_anb', tipoPeca, anbSku: anb.sku, anbDescricao: anb.descricao, anbFonte: anb.fonte, anbBaixadaEm: anb.baixadaEm, ...motoFields });
      }
    }

    const resumo = {
      totalPlanilha: planilhaMap.size,
      totalAnb: anbBaixadasMap.size,
      ok: linhas.filter((l) => l.situacao === 'ok').length,
      soPlanilha: linhas.filter((l) => l.situacao === 'so_planilha').length,
      soAnb: linhas.filter((l) => l.situacao === 'so_anb').length,
    };

    res.json({ ok: true, resumo, linhas });
  } catch (e) { next(e); }
});

// POST /etiquetas-detran/:pecaId/confirmar-baixa
etiquetasDetranRouter.post('/:pecaId/confirmar-baixa', async (req, res, next) => {
  try {
    const pecaIdNum = Number(req.params.pecaId);
    const { etiqueta, comprovanteNome, comprovanteArquivo } = req.body || {};

    const peca = await prisma.peca.findUnique({ where: { id: pecaIdNum } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada' });

    const todasEtiquetas = splitEtiquetas(peca.detranEtiqueta);
    const etiquetaInformada = String(etiqueta || '').trim();
    // Baixa só a etiqueta informada; sem etiqueta (compat), baixa todas as da peça.
    const alvos = etiquetaInformada
      ? (todasEtiquetas.includes(etiquetaInformada) ? [etiquetaInformada] : [etiquetaInformada])
      : todasEtiquetas;

    const comprovNome = comprovanteNome || null;
    const comprovArq = comprovanteArquivo || null;

    for (const etq of alvos) {
      await prisma.$executeRaw`
        INSERT INTO "DetranEtiquetaBaixa" ("pecaId", "etiqueta", "baixadaEm", "comprovanteNome", "comprovanteArquivo")
        VALUES (${pecaIdNum}, ${etq}, now(), ${comprovNome}, ${comprovArq})
        ON CONFLICT ("pecaId", "etiqueta") DO UPDATE SET
          "baixadaEm" = now(),
          "comprovanteNome" = COALESCE(EXCLUDED."comprovanteNome", "DetranEtiquetaBaixa"."comprovanteNome"),
          "comprovanteArquivo" = COALESCE(EXCLUDED."comprovanteArquivo", "DetranEtiquetaBaixa"."comprovanteArquivo")
      `;
    }

    // A peça só fica "Baixada" quando TODAS as etiquetas dela tiverem baixa registrada.
    const baixadasRows = await prisma.$queryRaw<{ etiqueta: string }[]>`
      SELECT "etiqueta" FROM "DetranEtiquetaBaixa" WHERE "pecaId" = ${pecaIdNum}
    `;
    const baixadasSet = new Set(baixadasRows.map((r) => String(r.etiqueta).trim()));
    const todasBaixadas = todasEtiquetas.length > 0 && todasEtiquetas.every((e) => baixadasSet.has(e));

    await prisma.peca.update({
      where: { id: pecaIdNum },
      data: {
        detranBaixada: todasBaixadas,
        detranBaixadaAt: todasBaixadas ? new Date() : null,
        ...(comprovNome ? { detranComprovanteNome: comprovNome } : {}),
        ...(comprovArq ? { detranComprovanteArquivo: comprovArq } : {}),
      },
    });

    res.json({ ok: true, etiquetaBaixada: etiquetaInformada || null, pecaBaixadaCompleta: todasBaixadas });
  } catch (e) { next(e); }
});

// GET /etiquetas-detran/pendencias-ativacao
// Lista etiquetas AVULSAS (não-cartela) pendentes de ativação: peças com tipoPecaAvulsa,
// cadastro nos últimos 30 dias e sem ativação registrada. Traz dados da moto p/ a "Entrada de Peças Avulsas".
etiquetasDetranRouter.get('/pendencias-ativacao', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: {
        tipoPecaAvulsa: { not: null },
        detranEtiqueta: { not: null },
        emPrejuizo: false,
        cadastro: { gte: ativacaoCutoff() },
      },
      select: {
        id: true, idPeca: true, descricao: true, detranEtiqueta: true,
        tipoPecaAvulsa: true, cadastro: true, motoId: true,
        disponivel: true, blingPedidoNum: true,
      },
      orderBy: { cadastro: 'desc' },
    });

    if (!pecas.length) return res.json({ ok: true, total: 0, linhas: [] });

    const motoIds = [...new Set(pecas.map((p) => p.motoId))];
    const [motos, posicoes, ativacoesMap] = await Promise.all([
      (prisma as any).moto.findMany({
        where: { id: { in: motoIds } },
        select: { id: true, marca: true, modelo: true, renavam: true, placa: true, chassi: true, notaFiscalEntrada: true, detranCartelaId: true },
      }),
      prisma.motoDetranPosicao.findMany({
        where: { motoId: { in: motoIds }, idPeca: { not: null } },
        select: { motoId: true, idPeca: true, etiqueta: true },
      }),
      loadAtivacoesPorEtiqueta(pecas.map((p) => p.id)),
    ]);

    const motoById = new Map((motos as any[]).map((m: any) => [m.id, m]));
    const cartelaSet = new Set<string>();
    for (const pos of posicoes) {
      if (pos.idPeca && pos.etiqueta) cartelaSet.add(`${pos.motoId}|${pos.idPeca}|${pos.etiqueta}`);
    }

    const linhas: any[] = [];
    for (const peca of pecas) {
      const moto: any = motoById.get(peca.motoId) || {};
      for (const etq of splitEtiquetas(peca.detranEtiqueta)) {
        // Só etiquetas avulsas: nem cadastradas na cartela (MotoDetranPosicao),
        // nem cuja base bate com a cartela da moto (detranCartelaId) + posição 001-034.
        if (cartelaSet.has(`${peca.motoId}|${peca.idPeca}|${etq}`)) continue;
        if (ehEtiquetaCartelaDaMoto(etq, moto.detranCartelaId)) continue;
        // Já ativada → não é pendência.
        if (ativacoesMap.has(`${peca.id}|${etq}`)) continue;
        linhas.push({
          pecaId: peca.id,
          sku: peca.idPeca,
          descricao: peca.descricao,
          etiqueta: etq,                          // Número da Peça Avulsa
          tipoPeca: peca.tipoPecaAvulsa,          // Tipo de Peça
          renavam: moto.renavam || null,
          placa: moto.placa || null,
          chassi: moto.chassi || null,
          notaFiscalEntrada: moto.notaFiscalEntrada || null,
          motoLabel: [moto.marca, moto.modelo].filter(Boolean).join(' ') || null,
          cadastro: peca.cadastro,
          disponivel: peca.disponivel,
          blingPedidoNum: peca.blingPedidoNum || null,
        });
      }
    }

    res.json({ ok: true, total: linhas.length, linhas });
  } catch (e) { next(e); }
});

// POST /etiquetas-detran/:pecaId/confirmar-ativacao
// Confirma a ativação de UMA etiqueta avulsa (comprovante opcional).
etiquetasDetranRouter.post('/:pecaId/confirmar-ativacao', async (req, res, next) => {
  try {
    const pecaIdNum = Number(req.params.pecaId);
    const { etiqueta, comprovanteNome, comprovanteArquivo } = req.body || {};

    const peca = await prisma.peca.findUnique({ where: { id: pecaIdNum } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada' });

    const todasEtiquetas = splitEtiquetas(peca.detranEtiqueta);
    const etiquetaInformada = String(etiqueta || '').trim();
    const alvos = etiquetaInformada ? [etiquetaInformada] : todasEtiquetas;

    const comprovNome = comprovanteNome || null;
    const comprovArq = comprovanteArquivo || null;

    for (const etq of alvos) {
      await prisma.$executeRaw`
        INSERT INTO "DetranEtiquetaAtivacao" ("pecaId", "etiqueta", "ativadaEm", "comprovanteNome", "comprovanteArquivo")
        VALUES (${pecaIdNum}, ${etq}, now(), ${comprovNome}, ${comprovArq})
        ON CONFLICT ("pecaId", "etiqueta") DO UPDATE SET
          "ativadaEm" = now(),
          "comprovanteNome" = COALESCE(EXCLUDED."comprovanteNome", "DetranEtiquetaAtivacao"."comprovanteNome"),
          "comprovanteArquivo" = COALESCE(EXCLUDED."comprovanteArquivo", "DetranEtiquetaAtivacao"."comprovanteArquivo")
      `;
    }

    res.json({ ok: true, etiquetaAtivada: etiquetaInformada || null });
  } catch (e) { next(e); }
});

// GET /etiquetas-detran/pendencias-resumo
// Agrega as 3 pendencias (baixa, ativacao de avulsa, devolucao) num resumo unico e rapido (sem Bling).
etiquetasDetranRouter.get('/pendencias-resumo', async (_req, res, next) => {
  try {
    const itens: { tipo: 'baixa' | 'ativacao' | 'devolucao'; pecaId: number; sku: string; descricao: string; etiqueta: string; info: string }[] = [];

    // 1) BAIXA — peca vendida com etiqueta ainda nao baixada.
    const pecasBaixa = await prisma.peca.findMany({
      where: {
        detranEtiqueta: { not: null }, detranBaixada: false, disponivel: false, emPrejuizo: false,
        OR: [{ blingPedidoId: { not: null } }, { blingPedidoNum: { not: null } }],
      },
      select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, blingPedidoNum: true },
    });
    const baixasMap = await loadBaixasPorEtiqueta(pecasBaixa.map((p) => p.id));
    for (const p of pecasBaixa) {
      for (const etq of splitEtiquetas(p.detranEtiqueta)) {
        if (baixasMap.has(`${p.id}|${etq}`)) continue;
        itens.push({ tipo: 'baixa', pecaId: p.id, sku: p.idPeca, descricao: p.descricao, etiqueta: etq, info: p.blingPedidoNum ? `Pedido ${p.blingPedidoNum}` : '' });
      }
    }

    // 2) ATIVACAO — etiqueta avulsa (≤30 dias) ainda nao ativada.
    const pecasAtiv = await prisma.peca.findMany({
      where: { tipoPecaAvulsa: { not: null }, detranEtiqueta: { not: null }, emPrejuizo: false, cadastro: { gte: ativacaoCutoff() } },
      select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, tipoPecaAvulsa: true, motoId: true },
    });
    if (pecasAtiv.length) {
      const motoIds = [...new Set(pecasAtiv.map((p) => p.motoId))];
      const [motos, posicoes, ativMap] = await Promise.all([
        (prisma as any).moto.findMany({ where: { id: { in: motoIds } }, select: { id: true, detranCartelaId: true } }),
        prisma.motoDetranPosicao.findMany({ where: { motoId: { in: motoIds }, idPeca: { not: null } }, select: { motoId: true, idPeca: true, etiqueta: true } }),
        loadAtivacoesPorEtiqueta(pecasAtiv.map((p) => p.id)),
      ]);
      const cartelaBaseByMoto = new Map<number, string>((motos as any[]).map((m: any) => [m.id, String(m.detranCartelaId || '')]));
      const cartelaSet = new Set<string>();
      for (const pos of posicoes) if (pos.idPeca && pos.etiqueta) cartelaSet.add(`${pos.motoId}|${pos.idPeca}|${pos.etiqueta}`);
      for (const p of pecasAtiv) {
        for (const etq of splitEtiquetas(p.detranEtiqueta)) {
          if (cartelaSet.has(`${p.motoId}|${p.idPeca}|${etq}`)) continue;
          if (ehEtiquetaCartelaDaMoto(etq, cartelaBaseByMoto.get(p.motoId))) continue;
          if (ativMap.has(`${p.id}|${etq}`)) continue;
          itens.push({ tipo: 'ativacao', pecaId: p.id, sku: p.idPeca, descricao: p.descricao, etiqueta: etq, info: p.tipoPecaAvulsa || '' });
        }
      }
    }

    // 3) DEVOLUCAO — peca com etiquetaPendente (aguarda nova etiqueta).
    const pecasDev = await prisma.peca.findMany({
      where: { etiquetaPendente: true, disponivel: true },
      select: {
        id: true, idPeca: true, descricao: true,
        devolucoes: { orderBy: { dataDevolucao: 'desc' }, take: 1, select: { etiquetasDetran: true } },
      },
    });
    for (const p of pecasDev) {
      const etqAntiga = splitEtiquetas(p.devolucoes?.[0]?.etiquetasDetran)[0] || '';
      itens.push({ tipo: 'devolucao', pecaId: p.id, sku: p.idPeca, descricao: p.descricao, etiqueta: etqAntiga || '—', info: 'Aguarda nova etiqueta' });
    }

    const totais = {
      baixa: itens.filter((i) => i.tipo === 'baixa').length,
      ativacao: itens.filter((i) => i.tipo === 'ativacao').length,
      devolucao: itens.filter((i) => i.tipo === 'devolucao').length,
      total: itens.length,
    };
    res.json({ ok: true, totais, itens });
  } catch (e) { next(e); }
});

// GET /etiquetas-detran/comprovante?pecaId=&etiqueta=&tipo=ativacao|baixa
// Serve o comprovante anexado (imagem/PDF) inline para abrir em nova aba.
// Baixa: tabela por etiqueta (novo) com fallback no campo legado da peca.
etiquetasDetranRouter.get('/comprovante', async (req, res, next) => {
  try {
    const pecaId = Number(req.query?.pecaId);
    const etiqueta = String(req.query?.etiqueta || '').trim();
    const tipo = String(req.query?.tipo || '').trim();
    if (!pecaId || !tipo) return res.status(400).json({ ok: false, error: 'pecaId e tipo sao obrigatorios' });

    let nome = '';
    let arquivo = '';

    if (tipo === 'ativacao') {
      try {
        const rows = await prisma.$queryRaw<{ comprovanteNome: string | null; comprovanteArquivo: string | null }[]>`
          SELECT "comprovanteNome", "comprovanteArquivo" FROM "DetranEtiquetaAtivacao"
          WHERE "pecaId" = ${pecaId} AND "etiqueta" = ${etiqueta}
        `;
        nome = String(rows?.[0]?.comprovanteNome || '');
        arquivo = String(rows?.[0]?.comprovanteArquivo || '');
      } catch { /* tabela ainda nao migrada */ }
    } else if (tipo === 'baixa') {
      try {
        const rows = await prisma.$queryRaw<{ comprovanteNome: string | null; comprovanteArquivo: string | null }[]>`
          SELECT "comprovanteNome", "comprovanteArquivo" FROM "DetranEtiquetaBaixa"
          WHERE "pecaId" = ${pecaId} AND "etiqueta" = ${etiqueta}
        `;
        nome = String(rows?.[0]?.comprovanteNome || '');
        arquivo = String(rows?.[0]?.comprovanteArquivo || '');
      } catch { /* tabela ainda nao migrada */ }
      if (!arquivo) {
        // Fallback: comprovante legado gravado direto na peca (baixas antigas, por peca).
        const peca = await prisma.peca.findUnique({
          where: { id: pecaId },
          select: { detranComprovanteNome: true, detranComprovanteArquivo: true },
        });
        nome = String(peca?.detranComprovanteNome || '');
        arquivo = String(peca?.detranComprovanteArquivo || '');
      }
    } else {
      return res.status(400).json({ ok: false, error: 'tipo invalido (ativacao|baixa)' });
    }

    if (!arquivo) return res.status(404).json({ ok: false, error: 'Nenhum comprovante anexado' });

    // Arquivo gravado como data URL ("data:<mime>;base64,<dados>").
    const match = arquivo.match(/^data:([^;]+);base64,(.+)$/s);
    const mime = match?.[1] || 'application/octet-stream';
    const base64 = match?.[2] || arquivo;
    const buffer = Buffer.from(base64, 'base64');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${(nome || `comprovante-${tipo}`).replace(/[^\w.\-]+/g, '_')}"`);
    res.send(buffer);
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
