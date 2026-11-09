// Solicitacoes de pecas (aba "Solicitacoes" da pagina Empresa): clientes/oficinas pedindo pecas que a gente procura/nao tem.
// Alimenta o painel de vendas perdidas (receita oculta, ticket medio, % de ruptura). Tabelas criadas sob demanda (sem migration):
//   "SolicitacaoPeca"      — uma linha por peca solicitada.
//   "SolicitacaoPecaMes"   — pecas vendidas no mes informadas manualmente (denominador do % de ruptura). Quando nao ha valor manual,
//                            o painel usa as pecas vendidas do proprio sistema (itens dos pedidos do Bling, sem cancelados).
//   "SolicitacaoMeta"      — marcadores internos (carga inicial da planilha "ANB - Contato de Oficinas.xlsx").
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { garantirTabelasPedidos } from '../lib/bling-pedidos';

export const solicitacoesRouter = Router();

const txt = (v: any) => String(v ?? '').trim();
const STATUS = ['perdida', 'em_busca', 'atendida'] as const;
type Status = typeof STATUS[number];

// [data, montadora, moto, ano, peca, valor, solicitante, telefone, canal, tipoCliente, referenciaInterna, observacao]
type Seed = [string, string, string, string, string, number, string, string, string, string, string, string];
const SEED: Seed[] = [
  ['2026-07-16', 'BMW', 'F800 GS', '2012', 'Carcaça do punho esquerdo', 200, 'Eric Henrique', '34 9911-8750', 'Whatsapp', 'Consumidor Final', '', 'Esse cliente nos procurou 2x para peças de F800'],
  ['2026-07-29', 'Harley Davidson', 'Fat Boy', '2018', 'Modulo BCM', 1400, '', '', 'Whatsapp', '', '', ''],
  ['2026-08-13', 'Harley Davidson', 'Fat Bob', '2019', 'Motor de Arranque', 500, 'Pedro da Pdm Motorcycle', '11 96059-6859', 'Whatsapp', 'Oficina', '', ''],
  ['2026-08-13', 'Harley Davidson', '883R', '', 'Central Velocimetro', 450, 'Pavilhão Acessórios', '51 9443-9256', 'Whatsapp', 'Oficina', '', ''],
  ['2026-08-13', 'Harley Davidson', '883R', '', 'Chave de Punho Luz (esquerdo)', 450, '', '', 'Whatsapp', '', '', ''],
  ['2026-08-20', 'Harley Davidson', 'Road king', '2008', 'Cubo da Embreagem', 800, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-21', 'Harley Davidson', 'Touring', '2021', 'Amortecedor Traseiro', 1500, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-22', 'BMW', 'F800R', '2012', 'Bloco do Motor', 1500, 'Rafael', '(19) 98270-0096', 'Whatsapp', 'Consumidor Final', '', ''],
  ['2026-09-25', 'Harley Davidson', 'Ultra Electra glide', '2002 - 2006', 'Ferragens do Tourpak', 450, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-25', 'Harley Davidson', 'Ultra Electra glide', '2002 - 2006', 'Acabamento paralama dianteiro', 250, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-25', 'Harley Davidson', 'Ultra Electra glide', '2002 - 2006', 'Paralama dianteiro', 650, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-25', 'Harley Davidson', 'Ultra Electra glide', '2002 - 2006', 'Retrovisor', 250, '', '', 'Whatsapp', '', '', ''],
  ['2026-09-28', 'Harley Davidson', 'Sportster', '', 'Polia', 600, 'Mendes', '(85) 99173-8038', 'Whatsapp', 'Oficina', 'HD03_0072', ''],
  ['2026-09-28', 'Harley Davidson', 'Sportster', '', 'Correia 137 Dentes', 800, 'Mendes', '(85) 99173-8038', 'Whatsapp', 'Oficina', 'HD03_0066', ''],
  ['2026-10-14', 'Triumph', 'Bobber', '2020', 'Luz de placa', 200, '', '', 'Whatsapp', '', '', ''],
  ['2026-10-14', 'Harley Davidson', 'Sportster', '2008', 'Suporte Módulo ECM', 99, 'Pavilhão Acessórios', '(55) 99443-9256', 'Whatsapp', 'Oficina', 'HD03_0055', ''],
  ['2026-10-15', 'Harley Davidson', 'Linha Touring', '', 'Correia 140 Dentes', 800, 'Jhon', '(11) 99659-3628', 'Whatsapp', 'Oficina', 'HD02_0041', ''],
  ['2026-10-15', 'Harley Davidson', 'Todas', '', 'FOB', 450, 'Jhon', '(11) 99659-3628', 'Whatsapp', 'Oficina', 'HD03_0138', ''],
  ['2026-10-15', 'Harley Davidson', 'Sportster', '', 'Acabamento do reservatório de freio', 200, 'Pavilhão Acessórios', '(55) 99443-9256', 'Whatsapp', 'Oficina', '', ''],
  ['2026-10-19', 'Yamaha', 'R1', '2006', 'Magneto', 959, 'LUIZ CLAUDIO DA FONSECA SILVA', '', 'OLX', 'Consumidor Final', 'YM01_0143', ''],
  ['2026-10-20', 'Harley Davidson', 'Touring', '', 'Lanterna Tourpack', 850, 'Lino', '(12) 9.9182-1983', 'Whatsapp', 'Consumidor Final', '', ''],
  ['2026-10-27', 'Harley Davidson', 'Forth Eight', '', 'Par Pneus', 950, 'Daniel', '(11) 96840-3233', 'Whatsapp', 'Oficina', 'HD03_0094 / HD03_0095', 'Comprou muitas peças da Street'],
  ['2026-10-28', 'BMW', 'R 1200 RT', '2010', 'Lanterna Traseira', 450, 'Via Michele', '', 'Whatsapp', 'Consumidor Final', '', ''],
];
// Pecas vendidas no mes (coluna "Total de Pecas Vendidas no Mes" da planilha)
const SEED_MESES: Array<[string, number]> = [['2026-07', 23], ['2026-08', 28], ['2026-09', 36], ['2026-10', 26]];

let tabelasProntas: Promise<void> | null = null;
function garantirTabelas(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SolicitacaoPeca" (
        "id" SERIAL PRIMARY KEY,
        "data" DATE NOT NULL DEFAULT CURRENT_DATE,
        "montadora" TEXT,
        "moto" TEXT,
        "ano" TEXT,
        "peca" TEXT NOT NULL,
        "valorEstimado" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "solicitante" TEXT,
        "telefone" TEXT,
        "canal" TEXT,
        "tipoCliente" TEXT,
        "referenciaInterna" TEXT,
        "observacao" TEXT,
        "status" TEXT NOT NULL DEFAULT 'perdida',
        "criadoPor" TEXT,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SolicitacaoPeca_data_idx" ON "SolicitacaoPeca" ("data")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SolicitacaoPecaMes" ("mes" TEXT PRIMARY KEY, "pecasVendidas" INTEGER NOT NULL)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SolicitacaoMeta" ("chave" TEXT PRIMARY KEY)`);
      const jaSemeado = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "SolicitacaoMeta" WHERE "chave" = 'seed_xlsx'`);
      if (!jaSemeado.length) {
        const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "SolicitacaoPeca"`);
        if (!Number(total[0]?.n)) {
          for (const [data, montadora, moto, ano, peca, valor, solicitante, telefone, canal, tipo, ref, obs] of SEED) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "SolicitacaoPeca" ("data","montadora","moto","ano","peca","valorEstimado","solicitante","telefone","canal","tipoCliente","referenciaInterna","observacao","status","criadoPor")
               VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'perdida','planilha')`,
              data, montadora || null, moto || null, ano || null, peca, valor, solicitante || null, telefone || null, canal || null, tipo || null, ref || null, obs || null,
            );
          }
          for (const [mes, n] of SEED_MESES) {
            await prisma.$executeRawUnsafe(`INSERT INTO "SolicitacaoPecaMes" ("mes","pecasVendidas") VALUES ($1,$2) ON CONFLICT DO NOTHING`, mes, n);
          }
        }
        await prisma.$executeRawUnsafe(`INSERT INTO "SolicitacaoMeta" ("chave") VALUES ('seed_xlsx') ON CONFLICT DO NOTHING`);
      }
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

function paraRegistro(r: any) {
  return {
    id: Number(r.id),
    data: txt(r.data).slice(0, 10),
    montadora: txt(r.montadora), moto: txt(r.moto), ano: txt(r.ano), peca: txt(r.peca),
    valorEstimado: Number(r.valorEstimado || 0),
    solicitante: txt(r.solicitante), telefone: txt(r.telefone), canal: txt(r.canal), tipoCliente: txt(r.tipoCliente),
    referenciaInterna: txt(r.referenciaInterna), observacao: txt(r.observacao),
    status: (STATUS as readonly string[]).includes(txt(r.status)) ? (txt(r.status) as Status) : 'perdida',
    criadoPor: txt(r.criadoPor), criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm,
  };
}

function lerCorpo(b: any) {
  const valor = Number(String(b?.valorEstimado ?? '').replace(',', '.'));
  const data = /^\d{4}-\d{2}-\d{2}$/.test(txt(b?.data)) ? txt(b.data) : new Date().toISOString().slice(0, 10);
  const status = (STATUS as readonly string[]).includes(txt(b?.status)) ? txt(b.status) : 'perdida';
  return {
    data, montadora: txt(b?.montadora) || null, moto: txt(b?.moto) || null, ano: txt(b?.ano) || null, peca: txt(b?.peca),
    valorEstimado: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : 0,
    solicitante: txt(b?.solicitante) || null, telefone: txt(b?.telefone) || null, canal: txt(b?.canal) || null,
    tipoCliente: txt(b?.tipoCliente) || null, referenciaInterna: txt(b?.referenciaInterna) || null, observacao: txt(b?.observacao) || null, status,
  };
}

const SELECT = `SELECT "id","data"::text AS "data","montadora","moto","ano","peca","valorEstimado"::float8 AS "valorEstimado","solicitante","telefone","canal","tipoCliente","referenciaInterna","observacao","status","criadoPor","criadoEm","atualizadoEm" FROM "SolicitacaoPeca"`;

// GET /solicitacoes — todas as solicitacoes + pecas vendidas por mes (manual > sistema) pro painel
solicitacoesRouter.get('/', async (_req, res, next) => {
  try {
    await garantirTabelas();
    const rows = await prisma.$queryRawUnsafe<any[]>(`${SELECT} ORDER BY "data" DESC, "id" DESC`);
    const itens = rows.map(paraRegistro);

    const vendidos: Record<string, { manual: number | null; sistema: number }> = {};
    const manuais = await prisma.$queryRawUnsafe<any[]>(`SELECT "mes","pecasVendidas" FROM "SolicitacaoPecaMes"`);
    for (const m of manuais) vendidos[txt(m.mes)] = { manual: Number(m.pecasVendidas), sistema: 0 };
    try {
      await garantirTabelasPedidos();
      const sis = await prisma.$queryRawUnsafe<any[]>(
        `SELECT to_char(p."data",'YYYY-MM') AS mes, COALESCE(SUM(i."quantidade"),0)::float8 AS n
         FROM "BlingPedido" p JOIN "BlingPedidoItem" i ON i."pedidoId" = p."id"
         WHERE p."cancelado" = false AND p."data" IS NOT NULL GROUP BY 1`);
      for (const s of sis) {
        const mes = txt(s.mes);
        vendidos[mes] = { manual: vendidos[mes]?.manual ?? null, sistema: Math.round(Number(s.n || 0)) };
      }
    } catch { /* sem pedidos sincronizados: so os valores manuais */ }

    res.json({ ok: true, itens, vendidos });
  } catch (e) { next(e); }
});

// PUT /solicitacoes/pecas-vendidas { mes: 'YYYY-MM', quantidade } — ajuste manual do denominador do mes (quantidade vazia remove o ajuste)
solicitacoesRouter.put('/pecas-vendidas', async (req, res, next) => {
  try {
    await garantirTabelas();
    const mes = txt(req.body?.mes);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ ok: false, error: 'Mes invalido.' });
    const bruto = txt(req.body?.quantidade);
    if (!bruto) {
      await prisma.$executeRawUnsafe(`DELETE FROM "SolicitacaoPecaMes" WHERE "mes" = $1`, mes);
      return res.json({ ok: true });
    }
    const n = Math.round(Number(bruto));
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'Quantidade invalida.' });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SolicitacaoPecaMes" ("mes","pecasVendidas") VALUES ($1,$2) ON CONFLICT ("mes") DO UPDATE SET "pecasVendidas" = EXCLUDED."pecasVendidas"`, mes, n);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /solicitacoes
solicitacoesRouter.post('/', async (req, res, next) => {
  try {
    await garantirTabelas();
    const d = lerCorpo(req.body);
    if (!d.peca) return res.status(400).json({ ok: false, error: 'Informe a peça solicitada.' });
    const autor = txt((req as any).authUser?.username) || null;
    const r = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "SolicitacaoPeca" ("data","montadora","moto","ano","peca","valorEstimado","solicitante","telefone","canal","tipoCliente","referenciaInterna","observacao","status","criadoPor")
       VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING "id","data"::text AS "data","montadora","moto","ano","peca","valorEstimado"::float8 AS "valorEstimado","solicitante","telefone","canal","tipoCliente","referenciaInterna","observacao","status","criadoPor","criadoEm","atualizadoEm"`,
      d.data, d.montadora, d.moto, d.ano, d.peca, d.valorEstimado, d.solicitante, d.telefone, d.canal, d.tipoCliente, d.referenciaInterna, d.observacao, d.status, autor,
    );
    res.status(201).json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// PUT /solicitacoes/:id
solicitacoesRouter.put('/:id(\\d+)', async (req, res, next) => {
  try {
    await garantirTabelas();
    const d = lerCorpo(req.body);
    if (!d.peca) return res.status(400).json({ ok: false, error: 'Informe a peça solicitada.' });
    const r = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE "SolicitacaoPeca" SET "data"=$1::date,"montadora"=$2,"moto"=$3,"ano"=$4,"peca"=$5,"valorEstimado"=$6,"solicitante"=$7,"telefone"=$8,"canal"=$9,"tipoCliente"=$10,"referenciaInterna"=$11,"observacao"=$12,"status"=$13,"atualizadoEm"=now()
       WHERE "id"=$14
       RETURNING "id","data"::text AS "data","montadora","moto","ano","peca","valorEstimado"::float8 AS "valorEstimado","solicitante","telefone","canal","tipoCliente","referenciaInterna","observacao","status","criadoPor","criadoEm","atualizadoEm"`,
      d.data, d.montadora, d.moto, d.ano, d.peca, d.valorEstimado, d.solicitante, d.telefone, d.canal, d.tipoCliente, d.referenciaInterna, d.observacao, d.status, Number(req.params.id),
    );
    if (!r.length) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada.' });
    res.json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// PATCH /solicitacoes/:id/status { status }
solicitacoesRouter.patch('/:id(\\d+)/status', async (req, res, next) => {
  try {
    await garantirTabelas();
    const status = txt(req.body?.status);
    if (!(STATUS as readonly string[]).includes(status)) return res.status(400).json({ ok: false, error: 'Status invalido.' });
    const r = await prisma.$executeRawUnsafe(`UPDATE "SolicitacaoPeca" SET "status"=$1,"atualizadoEm"=now() WHERE "id"=$2`, status, Number(req.params.id));
    if (!r) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /solicitacoes/:id
solicitacoesRouter.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    await garantirTabelas();
    await prisma.$executeRawUnsafe(`DELETE FROM "SolicitacaoPeca" WHERE "id"=$1`, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
