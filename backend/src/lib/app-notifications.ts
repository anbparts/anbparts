import { prisma } from './prisma';
import { canProcessAction, canAccessPage } from './app-permissions';

export type NotificationType = {
  key: string;
  label: string;
  description: string;
  pageKey: string;
  href: string;
  actionKey?: string;
};

export const APP_NOTIFICATION_CATALOG: NotificationType[] = [
  {
    key: 'ml_questions',
    label: 'Novas perguntas ML',
    description: 'Avisa quando existem perguntas do Mercado Livre aguardando resposta.',
    pageKey: 'mercado_livre_perguntas',
    actionKey: 'responder',
    href: '/mercado-livre/perguntas',
  },
  {
    key: 'cadastro_pre_cadastro',
    label: 'SKUs em pre-cadastro',
    description: 'Avisa quando existem SKUs com pre-cadastro aguardando cadastro final.',
    pageKey: 'cadastro',
    actionKey: 'criar_bling',
    href: '/cadastro',
  },
  {
    key: 'pagamentos_dia',
    label: 'Pagamentos do dia',
    description: 'Avisa despesas pendentes com vencimento no dia atual.',
    pageKey: 'despesas',
    href: '/despesas',
  },
  {
    key: 'detran_baixa',
    label: 'Etiqueta Detran',
    description: 'Avisa etiquetas Detran pendentes de baixa (venda) e de ativação (etiqueta avulsa nova).',
    pageKey: 'etiquetas_detran',
    actionKey: 'processar_baixa',
    href: '/etiquetas-detran',
  },
  {
    key: 'fotos_pendentes_whatsapp',
    label: 'Fotos pendentes (WhatsApp)',
    description: 'Recebe no WhatsApp os SKUs com fotos pendentes de tratamento no Drive (precisa do telefone preenchido).',
    pageKey: 'cadastro',
    href: '/cadastro',
  },
];

export function normalizeNotificationTypes(value: any) {
  const allowed = new Set(APP_NOTIFICATION_CATALOG.map((item) => item.key));
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list.map((item) => String(item || '').trim()).filter((item) => allowed.has(item))));
}

export function canReceiveNotification(user: any, notification: NotificationType) {
  const permissions = user?.permissions || {};
  if (user?.isAdmin || String(user?.username || '').toLowerCase() === 'bruno') return true;
  if (!canAccessPage(permissions, notification.pageKey)) return false;
  return notification.actionKey ? canProcessAction(permissions, notification.pageKey, notification.actionKey) : true;
}

function dateKeyInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dateOnlyUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function shortText(value: any, max = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

async function collectMlQuestions(limit: number) {
  const rows = await prisma.mercadoLivrePergunta.findMany({
    where: { status: 'UNANSWERED' },
    orderBy: [{ dataPergunta: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  return rows.map((row) => ({
    type: 'ml_questions',
    itemKey: row.questionId,
    title: `Pergunta ML${row.sku ? ` - ${row.sku}` : ''}`,
    description: shortText(row.texto),
    href: '/mercado-livre/perguntas',
    createdAt: row.dataPergunta || row.createdAt,
    meta: row.nomeCliente || row.tituloAnuncio || '',
  }));
}

async function collectPreCadastros(limit: number) {
  const rows = await prisma.cadastroPeca.findMany({
    where: {
      status: { not: 'cadastrado' },
      fotoCadastroVerificada: true,
      peso: { not: null },
      largura: { not: null },
      altura: { not: null },
      profundidade: { not: null },
      numeroPeca: { not: null },
      localizacao: { not: null },
      precoVenda: { gt: 0 },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: { moto: { select: { marca: true, modelo: true, ano: true } } },
  });

  return rows.map((row) => ({
    type: 'cadastro_pre_cadastro',
    itemKey: row.idPeca,
    title: `Pre-cadastro - ${row.idPeca}`,
    description: shortText(row.descricao),
    href: '/cadastro',
    createdAt: row.createdAt,
    meta: [row.moto?.marca, row.moto?.modelo, row.moto?.ano].filter(Boolean).join(' '),
  }));
}

async function collectPagamentosDia(limit: number) {
  const today = dateOnlyUtc(dateKeyInSaoPaulo());
  const tomorrow = addUtcDays(today, 1);
  const rows = await prisma.despesa.findMany({
    where: { statusPagamento: 'pendente', data: { gte: today, lt: tomorrow } },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    type: 'pagamentos_dia',
    itemKey: String(row.id),
    title: `Pagamento pendente - ${row.categoria || 'Outros'}`,
    description: shortText(row.detalhes),
    href: '/despesas',
    createdAt: row.data,
    meta: Number(row.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  }));
}

async function collectDetranBaixa(limit: number) {
  const rows = await prisma.peca.findMany({
    where: {
      detranEtiqueta: { not: null },
      detranBaixada: false,
      disponivel: false,
      emPrejuizo: false,
    },
    orderBy: [{ dataVenda: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  return rows.map((row) => ({
    type: 'detran_baixa',
    itemKey: String(row.id),
    title: `Baixa Detran - ${row.idPeca}`,
    description: shortText(row.descricao),
    href: '/etiquetas-detran',
    createdAt: row.dataVenda || row.updatedAt,
    meta: row.blingPedidoNum ? `Pedido ${row.blingPedidoNum}` : '',
  }));
}

// Etiquetas avulsas pendentes de ativação: tipoPecaAvulsa, cadastro <= 30 dias e com ao menos
// uma etiqueta sem ativação registrada. Acima de 30 dias é assumida ativa.
async function collectDetranAtivacao(limit: number) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidatas = await prisma.peca.findMany({
    where: {
      tipoPecaAvulsa: { not: null },
      detranEtiqueta: { not: null },
      emPrejuizo: false,
      cadastro: { gte: cutoff },
    },
    select: { id: true, idPeca: true, descricao: true, detranEtiqueta: true, tipoPecaAvulsa: true, cadastro: true, motoId: true },
    orderBy: { cadastro: 'desc' },
    take: limit * 4,
  });
  if (!candidatas.length) return [];

  // Etiquetas já ativadas (para excluir peças cujas etiquetas estão todas ativadas).
  let ativadas = new Set<string>();
  try {
    const ids = candidatas.map((c) => c.id);
    const rows = await prisma.$queryRawUnsafe<{ pecaId: number; etiqueta: string }[]>(
      `SELECT "pecaId", "etiqueta" FROM "DetranEtiquetaAtivacao" WHERE "pecaId" IN (${ids.join(',')})`,
    );
    ativadas = new Set(rows.map((r) => `${Number(r.pecaId)}|${String(r.etiqueta).trim()}`));
  } catch { /* tabela ainda não migrada */ }

  // Base da cartela de cada moto (para distinguir cartela de avulsa corretamente).
  const motoIds = [...new Set(candidatas.map((c) => c.motoId))];
  const motos = await prisma.moto.findMany({ where: { id: { in: motoIds } }, select: { id: true, detranCartelaId: true } });
  const cartelaBaseByMoto = new Map<number, string>(motos.map((m) => [m.id, String(m.detranCartelaId || '')]));

  // Cartela = posição 001-034 E base == prefixo da cartela da moto. Só avulsa precisa de ativação.
  const ehCartelaDaMoto = (etq: string, base: string) => {
    const s = String(etq || '').trim();
    if (!base || s.length <= 3) return false;
    const pos = Number(s.slice(-3));
    return pos >= 1 && pos <= 34 && s.slice(0, -3) === base;
  };
  const pendentes = candidatas.filter((c) => {
    const base = cartelaBaseByMoto.get(c.motoId) || '';
    const avulsas = String(c.detranEtiqueta || '').split('/').map((e) => e.trim()).filter(Boolean).filter((e) => !ehCartelaDaMoto(e, base));
    return avulsas.some((etq) => !ativadas.has(`${c.id}|${etq}`));
  }).slice(0, limit);

  return pendentes.map((row) => ({
    type: 'detran_baixa',
    itemKey: `ativacao-${row.id}`,
    title: `Ativar etiqueta - ${row.idPeca}`,
    description: shortText(row.descricao),
    href: '/etiquetas-detran',
    createdAt: row.cadastro,
    meta: row.tipoPecaAvulsa ? String(row.tipoPecaAvulsa) : 'Etiqueta avulsa',
  }));
}

async function collectDetranBaixaEAtivacao(limit: number) {
  const [baixa, ativacao] = await Promise.all([
    collectDetranBaixa(limit),
    collectDetranAtivacao(limit),
  ]);
  return [...baixa, ...ativacao];
}

export async function collectNotificationsForTypes(types: string[], limitPerType = 20) {
  const enabled = new Set(types);
  const groups = await Promise.all([
    enabled.has('ml_questions') ? collectMlQuestions(limitPerType) : [],
    enabled.has('cadastro_pre_cadastro') ? collectPreCadastros(limitPerType) : [],
    enabled.has('pagamentos_dia') ? collectPagamentosDia(limitPerType) : [],
    enabled.has('detran_baixa') ? collectDetranBaixaEAtivacao(limitPerType) : [],
  ]);

  return groups.flat().sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}
