// Historico unico de cancelamentos e devolucoes (Estoque > Devolucoes) e lista padronizada de motivos.
// Tabelas criadas sob demanda (sem migration). Registrar nunca pode quebrar o cancelamento: quem chama envolve em try/catch.
import { prisma } from './prisma';

let tabelasPromise: Promise<void> | null = null;

export const MOTIVOS_PADRAO = [
  'Desistência do cliente',
  'Peça incompatível com a moto',
  'Peça com defeito',
  'Avaria no transporte',
  'Extravio / não entregue',
  'Cancelado pelo marketplace',
  'Venda duplicada / erro de cadastro',
  'Outros',
];

export function garantirTabelasDevolucao(): Promise<void> {
  if (!tabelasPromise) {
    tabelasPromise = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DevolucaoMotivo" (
        "id" SERIAL PRIMARY KEY, "nome" TEXT NOT NULL, "ativo" BOOLEAN NOT NULL DEFAULT true, "ordem" INTEGER NOT NULL DEFAULT 0, "criadoEm" TIMESTAMP NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DevolucaoMotivo_nome_uq" ON "DevolucaoMotivo" (lower("nome"))`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DevolucaoRegistro" (
        "id" SERIAL PRIMARY KEY, "pecaId" INTEGER, "idPeca" TEXT, "descricao" TEXT,
        "pedidoNum" TEXT, "pedidoId" TEXT, "dataVenda" DATE,
        "dataDevolucao" DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
        "motoId" INTEGER, "motoNome" TEXT, "motoLabel" TEXT,
        "valor" NUMERIC(14,2), "valorLiq" NUMERIC(14,2), "canal" TEXT,
        "motivoId" INTEGER, "observacao" TEXT, "origem" TEXT,
        "criadoEm" TIMESTAMP NOT NULL DEFAULT now(), "atualizadoEm" TIMESTAMP, "atualizadoPor" TEXT)`);
      for (const col of ['"frete" NUMERIC(14,2)', '"taxas" NUMERIC(14,2)', '"nfVenda" TEXT', '"nfDevolucao" TEXT', '"clienteNome" TEXT', '"nfDevolucaoData" DATE']) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "DevolucaoRegistro" ADD COLUMN IF NOT EXISTS ${col}`);
      }
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DevolucaoRegistro_dedupe_uq" ON "DevolucaoRegistro" ("pecaId", COALESCE("pedidoNum", ''), "dataDevolucao")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DevolucaoRegistro_peca_idx" ON "DevolucaoRegistro" ("pecaId")`);
      const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "DevolucaoMotivo"`);
      if (!n) {
        for (let i = 0; i < MOTIVOS_PADRAO.length; i++) {
          await prisma.$executeRawUnsafe(`INSERT INTO "DevolucaoMotivo" ("nome","ordem") VALUES ($1,$2) ON CONFLICT DO NOTHING`, MOTIVOS_PADRAO[i], i + 1);
        }
      }
      await importarHistoricoAntigo();
      await completarDoHistoricoAntigo();
    })().catch((e) => { tabelasPromise = null; throw e; });
  }
  return tabelasPromise;
}

// Na primeira vez traz o que ja existia (devolucoes antigas e pecas hoje em revisao) para o historico nao comecar vazio.
async function importarHistoricoAntigo() {
  const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "DevolucaoRegistro"`);
  if (n) return;
  try {
    await prisma.$executeRawUnsafe(`INSERT INTO "DevolucaoRegistro" ("pecaId","idPeca","descricao","pedidoNum","pedidoId","dataVenda","dataDevolucao","motoId","motoNome","motoLabel","valor","valorLiq","origem","criadoEm")
      SELECT h."pecaId", max(h."idPeca"), max(h."descricao"), h."pedidoBlingNum", max(h."pedidoBlingId"), max(h."dataVenda")::date, (h."dataDevolucao" AT TIME ZONE 'America/Sao_Paulo')::date,
             max(h."motoId"), max(h."motoNome"), max(m."etiquetaSkuLabel"), max(h."precoML"), max(h."valorLiq"), 'historico_antigo', min(h."dataDevolucao")
      FROM "HistoricoDevolucao" h LEFT JOIN "Moto" m ON m."id" = h."motoId"
      GROUP BY h."pecaId", h."pedidoBlingNum", (h."dataDevolucao" AT TIME ZONE 'America/Sao_Paulo')::date
      ON CONFLICT DO NOTHING`);
  } catch { /* historico antigo indisponivel: segue sem ele */ }
  try {
    const { garantirTabelaRevisao } = await import('./pecas-revisao');
    await garantirTabelaRevisao();
    await prisma.$executeRawUnsafe(`INSERT INTO "DevolucaoRegistro" ("pecaId","idPeca","descricao","pedidoNum","pedidoId","dataVenda","dataDevolucao","motoId","motoNome","motoLabel","valor","valorLiq","origem","criadoEm")
      SELECT r."pecaId", p."idPeca", p."descricao", r."pedidoNum", r."pedidoId", r."dataVenda", (r."criadoEm" AT TIME ZONE 'America/Sao_Paulo')::date,
             p."motoId", NULLIF(trim(concat_ws(' ', m."marca", m."modelo", m."ano")), ''), m."etiquetaSkuLabel", r."precoML", r."valorLiq", 'cancelamento_importado', r."criadoEm"
      FROM "PecaEmRevisao" r JOIN "Peca" p ON p."id" = r."pecaId" LEFT JOIN "Moto" m ON m."id" = p."motoId"
      ON CONFLICT DO NOTHING`);
  } catch { /* sem revisoes: segue */ }
  await completarCanais();
}

// Traz frete, taxas, NFs e observacao do historico antigo para registros que ainda nao tem (idempotente)
async function completarDoHistoricoAntigo() {
  try {
    await prisma.$executeRawUnsafe(`UPDATE "DevolucaoRegistro" d SET "frete" = COALESCE(d."frete", x.frete), "taxas" = COALESCE(d."taxas", x.taxas),
        "nfVenda" = COALESCE(d."nfVenda", x.nfv), "nfDevolucao" = COALESCE(d."nfDevolucao", x.nfd), "observacao" = COALESCE(d."observacao", x.obs)
      FROM (SELECT h."pecaId", COALESCE(h."pedidoBlingNum", '') AS ped, (h."dataDevolucao" AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
                   max(h."valorFrete") AS frete, max(h."valorTaxas") AS taxas, max(NULLIF(h."nfVendaNumero", '')) AS nfv, max(NULLIF(h."nfDevolucaoNumero", '')) AS nfd, max(NULLIF(h."observacoes", '')) AS obs
            FROM "HistoricoDevolucao" h GROUP BY 1, 2, 3) x
      WHERE d."pecaId" = x."pecaId" AND COALESCE(d."pedidoNum", '') = x.ped AND d."dataDevolucao" = x.dia
        AND (d."frete" IS NULL OR d."taxas" IS NULL OR d."nfVenda" IS NULL OR d."nfDevolucao" IS NULL OR d."observacao" IS NULL)`);
  } catch { /* historico antigo indisponivel */ }
}

// Preenche o marketplace pelos pedidos ja importados (best-effort)
export async function completarCanais() {
  try {
    await prisma.$executeRawUnsafe(`UPDATE "DevolucaoRegistro" d SET "canal" = b."canal"
      FROM "BlingPedido" b WHERE d."canal" IS NULL AND d."pedidoId" ~ '^[0-9]+$' AND b."id" = d."pedidoId"::bigint AND b."canal" IS NOT NULL`);
  } catch { /* tabela de pedidos ainda nao existe */ }
}

export type NovoRegistroDevolucao = {
  pecaId: number; idPeca?: string | null; descricao?: string | null;
  pedidoNum?: string | null; pedidoId?: string | null; dataVenda?: Date | string | null; dataDevolucao?: Date | string | null;
  motoId?: number | null; motoNome?: string | null; motoLabel?: string | null;
  valor?: number | null; valorLiq?: number | null; frete?: number | null; taxas?: number | null; nfVenda?: string | null; nfDevolucao?: string | null;
  origem: string; observacao?: string | null;
};

const dia = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function registrarDevolucoes(itens: NovoRegistroDevolucao[]) {
  if (!itens.length) return;
  await garantirTabelasDevolucao();
  try { await (await import('./bling-pedidos')).garantirTabelasPedidos(); } catch { /* sem canal */ }
  const n = (v: any) => (v == null || v === '' ? null : Number(v));
  for (const i of itens) {
    const pedidoId = i.pedidoId ? String(i.pedidoId) : null;
    const valores = [
      i.pecaId, i.idPeca || null, i.descricao || null, i.pedidoNum ? String(i.pedidoNum) : null, pedidoId, dia(i.dataVenda), dia(i.dataDevolucao),
      i.motoId ?? null, i.motoNome || null, i.motoLabel || null, n(i.valor), n(i.valorLiq), n(i.frete), n(i.taxas),
      i.nfVenda || null, i.nfDevolucao || null, i.observacao || null, i.origem,
    ];
    const colunas = '"pecaId","idPeca","descricao","pedidoNum","pedidoId","dataVenda","dataDevolucao","motoId","motoNome","motoLabel","valor","valorLiq","frete","taxas","nfVenda","nfDevolucao","observacao","origem"';
    const base = `$1,$2,$3,$4,$5::text,$6::date,COALESCE($7::date,(now() AT TIME ZONE 'America/Sao_Paulo')::date),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18`;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DevolucaoRegistro" (${colunas},"canal") VALUES (${base}, CASE WHEN $5::text ~ '^[0-9]+$' THEN (SELECT "canal" FROM "BlingPedido" WHERE "id" = ($5::text)::bigint) END) ON CONFLICT DO NOTHING`,
        ...valores,
      );
    } catch {
      // canal depende da tabela de pedidos; se falhar, grava sem ele
      await prisma.$executeRawUnsafe(`INSERT INTO "DevolucaoRegistro" (${colunas}) VALUES (${base}) ON CONFLICT DO NOTHING`, ...valores);
    }
  }
}

// Monta o registro a partir da peca (com moto) antes dos dados de venda serem limpos
export function registroDePeca(peca: any, origem: string, observacao?: string | null): NovoRegistroDevolucao {
  const moto = peca?.moto || {};
  return {
    pecaId: peca.id, idPeca: peca.idPeca, descricao: peca.descricao,
    pedidoNum: peca.blingPedidoNum || null, pedidoId: peca.blingPedidoId || null, dataVenda: peca.dataVenda || null,
    motoId: peca.motoId ?? null, motoNome: [moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ').trim() || null,
    motoLabel: moto.etiquetaSkuLabel || null, valor: peca.precoML == null ? null : Number(peca.precoML), valorLiq: peca.valorLiq == null ? null : Number(peca.valorLiq),
    frete: peca.valorFrete == null ? null : Number(peca.valorFrete), taxas: peca.valorTaxas == null ? null : Number(peca.valorTaxas),
    origem, observacao: observacao || null,
  };
}

// NF de entrada (retorno) da peca: usada por Pendencias > Devolucoes para exigir a nota antes de liberar a revisao
export async function nfEntradaDaPeca(pecaId: number): Promise<string | null> {
  await garantirTabelasDevolucao();
  const [r] = await prisma.$queryRawUnsafe<any[]>(`SELECT "nfDevolucao" FROM "DevolucaoRegistro" WHERE "pecaId" = $1::int ORDER BY "dataDevolucao" DESC, "id" DESC LIMIT 1`, pecaId);
  return r?.nfDevolucao ? String(r.nfDevolucao) : null;
}

// NF de entrada usada na ativacao da etiqueta avulsa de uma peca DEVOLVIDA: e a NF de entrada (retorno) lancada na devolucao,
// com a data de emissao buscada no Bling (e guardada no registro pra nao consultar de novo).
// Peca sem devolucao/NF de retorno devolve null (quem chama usa a NF de entrada da moto).
export async function nfEntradaDevolucaoParaAtivacao(pecaId: number): Promise<{ numero: string; data: string | null } | null> {
  await garantirTabelasDevolucao();
  const [r] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id", "nfDevolucao", "nfDevolucaoData"::text AS "data", "dataDevolucao"::text AS "dia" FROM "DevolucaoRegistro" WHERE "pecaId" = $1::int AND NULLIF(trim("nfDevolucao"), '') IS NOT NULL ORDER BY "dataDevolucao" DESC, "id" DESC LIMIT 1`, pecaId);
  if (!r) return null;
  const numero = String(r.nfDevolucao).trim();
  if (r.data) return { numero, data: r.data };
  let data: string | null = null;
  try {
    const { blingReq } = await import('../routes/bling');
    const igual = (a: any) => { const x = String(a ?? '').trim(); return x === numero || (/^\d+$/.test(x) && /^\d+$/.test(numero) && Number(x) === Number(numero)); };
    const diaDe = (nota: any) => { const d = String(nota?.dataEmissao || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; };
    // o filtro por numero nem sempre e aceito pelo Bling: tenta, mas o caminho garantido e listar as notas por periodo e achar o numero aqui.
    for (const filtro of [`numero=${encodeURIComponent(numero)}`, `numeroNota=${encodeURIComponent(numero)}`]) {
      let linhas: any[] = [];
      try { linhas = ((await blingReq(`/nfe?pagina=1&limite=20&${filtro}`)) as any)?.data || []; } catch { continue; }
      const achadas = linhas.filter((l) => igual(l?.numero));
      const nota = achadas.find((l) => Number(l?.tipo) === 0) || achadas[0];
      if (diaDe(nota)) { data = diaDe(nota); break; }
    }
    if (!data) {
      // notas de ENTRADA (tipo 0) emitidas de ~4 meses antes ate ~1 mes depois da devolucao
      const base = r.dia ? new Date(`${r.dia}T12:00:00Z`) : new Date();
      const ini = new Date(base.getTime() - 120 * 86400000).toISOString().slice(0, 10);
      const fim = new Date(Math.min(base.getTime() + 30 * 86400000, Date.now() + 86400000)).toISOString().slice(0, 10);
      for (const tipo of ['&tipo=0', '']) {
        for (let pagina = 1; pagina <= 6 && !data; pagina++) {
          let linhas: any[] = [];
          try {
            linhas = ((await blingReq(`/nfe?pagina=${pagina}&limite=100${tipo}&dataEmissaoInicial=${encodeURIComponent(`${ini} 00:00:00`)}&dataEmissaoFinal=${encodeURIComponent(`${fim} 23:59:59`)}`)) as any)?.data || [];
          } catch { break; }
          const achadas = linhas.filter((l) => igual(l?.numero));
          const nota = achadas.find((l) => Number(l?.tipo) === 0) || achadas[0];
          if (diaDe(nota)) data = diaDe(nota);
          if (linhas.length < 100) break;
        }
        if (data) break;
      }
    }
    if (!data) console.warn(`[nf-entrada-devolucao] Bling nao retornou a data de emissao da NF ${numero} (peca ${pecaId})`);
  } catch { /* Bling indisponivel: mostra so o numero e tenta de novo na proxima */ }
  if (data) {
    try { await prisma.$executeRawUnsafe(`UPDATE "DevolucaoRegistro" SET "nfDevolucaoData" = $2::date WHERE "id" = $1::int`, r.id, data); } catch { /* sem cache */ }
  }
  return { numero, data };
}

export async function salvarNfEntrada(pecaId: number, nf: string, por: string | null): Promise<boolean> {
  await garantirTabelasDevolucao();
  const atualizar = () => prisma.$executeRawUnsafe(
    `UPDATE "DevolucaoRegistro" SET "nfDevolucao" = $2, "atualizadoEm" = now(), "atualizadoPor" = $3
     WHERE "id" = (SELECT "id" FROM "DevolucaoRegistro" WHERE "pecaId" = $1::int ORDER BY "dataDevolucao" DESC, "id" DESC LIMIT 1)`, pecaId, nf, por);
  if (await atualizar()) return true;
  // peca sem registro no historico (revisao antiga): cria a partir dos dados da revisao
  const { garantirTabelaRevisao } = await import('./pecas-revisao');
  await garantirTabelaRevisao();
  const [p] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."idPeca", p."descricao", p."motoId", NULLIF(trim(concat_ws(' ', m."marca", m."modelo", m."ano")), '') AS "motoNome", m."etiquetaSkuLabel" AS "motoLabel",
            r."pedidoNum", r."pedidoId", r."dataVenda"::text AS "dataVenda", r."precoML", r."valorLiq", r."valorFrete", r."valorTaxas"
     FROM "PecaEmRevisao" r JOIN "Peca" p ON p."id" = r."pecaId" LEFT JOIN "Moto" m ON m."id" = p."motoId" WHERE r."pecaId" = $1::int`, pecaId);
  if (!p) return false;
  const n = (v: any) => (v == null ? null : Number(v));
  await registrarDevolucoes([{ pecaId, idPeca: p.idPeca, descricao: p.descricao, pedidoNum: p.pedidoNum, pedidoId: p.pedidoId, dataVenda: p.dataVenda, motoId: p.motoId, motoNome: p.motoNome, motoLabel: p.motoLabel,
    valor: n(p.precoML), valorLiq: n(p.valorLiq), frete: n(p.valorFrete), taxas: n(p.valorTaxas), nfDevolucao: nf, origem: 'cancelamento_importado' }]);
  return (await atualizar()) > 0;
}

// Depois do cancelamento: busca no Bling (em segundo plano) o cliente e a NF de saida de cada pedido e grava nos registros.
// Sequencial para respeitar o limite do Bling; qualquer falha so deixa o campo vazio (ha o botao "Buscar no Bling" na aba Devolucoes).
export async function completarDoBling(itens: NovoRegistroDevolucao[]) {
  let loadBlingVendaInfo: any;
  try { ({ loadBlingVendaInfo } = await import('../routes/etiquetas-detran')); } catch { return; }
  const cache = new Map<string, { cliente: string; nf: string; pedidoId: string } | null>();
  for (const i of itens) {
    const num = i.pedidoNum ? String(i.pedidoNum) : '';
    const pid = i.pedidoId ? String(i.pedidoId) : '';
    if (!num && !pid) continue;
    const chave = num || pid;
    try {
      if (!cache.has(chave)) {
        const info: any = await loadBlingVendaInfo({ pedidoNum: num, pedidoId: pid });
        cache.set(chave, info ? { cliente: String(info.clienteNome || '').trim(), nf: String(info.nfNumero || '').trim(), pedidoId: String(info.pedidoId || '').trim() } : null);
      }
      const r = cache.get(chave);
      if (!r || (!r.cliente && !r.nf && !r.pedidoId)) continue;
      await prisma.$executeRawUnsafe(
        `UPDATE "DevolucaoRegistro" SET "clienteNome" = COALESCE(NULLIF($3, ''), "clienteNome"), "nfVenda" = COALESCE("nfVenda", NULLIF($4, '')), "pedidoId" = COALESCE("pedidoId", NULLIF($5, ''))
         WHERE "pecaId" = $1::int AND COALESCE("pedidoNum", '') = $2`, i.pecaId, num, r.cliente, r.nf, r.pedidoId);
    } catch { /* Bling indisponivel para esse pedido: fica para o botao manual */ }
  }
}
