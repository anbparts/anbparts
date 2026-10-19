// Listagem de etiquetas Detran COMPRADAS pelo CNPJ (planilha dos distribuidores) + regras de uso:
//   1) toda etiqueta avulsa informada num SKU precisa constar nessa listagem (cartela da moto = base da moto + posicao 001..034);
//   2) a mesma etiqueta nunca pode estar em 2 SKUs diferentes (um SKU pode ter varias etiquetas).
// Tabela criada sob demanda (sem migration): "DetranEtiquetaComprada".
import { prisma } from './prisma';

const txt = (v: any) => String(v ?? '').trim();

export const normalizarEtiqueta = (v: any) => txt(v).toUpperCase().replace(/\s+/g, '');
export const etiquetasDoTexto = (v: any): string[] => txt(v).split('/').map(normalizarEtiqueta).filter(Boolean);
const skuBase = (v: any) => txt(v).toUpperCase().replace(/-\d+$/, '');

export type LinhaCompra = { numero: any; lote?: any; cnpj?: any; distribuidor?: any; criadoEm?: any; status?: any; tipoVeiculo?: any };

let tabelaPronta: Promise<void> | null = null;
export function garantirTabelaCompradas(): Promise<void> {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DetranEtiquetaComprada" (
        "numero" TEXT PRIMARY KEY,
        "lote" TEXT,
        "cnpj" TEXT,
        "distribuidor" TEXT,
        "criadoEm" TIMESTAMPTZ,
        "statusCartela" TEXT,
        "tipoVeiculo" TEXT,
        "importadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
    })().catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

// Importa/atualiza a listagem (idempotente: reimportar o mesmo arquivo so atualiza).
export async function importarCompradas(linhas: LinhaCompra[]) {
  await garantirTabelaCompradas();
  const existentes = new Set((await prisma.$queryRawUnsafe<any[]>(`SELECT "numero" FROM "DetranEtiquetaComprada"`)).map((r) => String(r.numero)));
  const validas = new Map<string, LinhaCompra & { numero: string }>();
  const invalidas: string[] = [];
  for (const l of linhas) {
    const numero = normalizarEtiqueta(l.numero);
    if (!numero) continue;
    if (!/^SP\d{11}$|^SP\d{14}$/.test(numero)) { invalidas.push(numero); continue; }
    validas.set(numero, { ...l, numero });
  }
  let novas = 0;
  let atualizadas = 0;
  const lista = Array.from(validas.values());
  for (let i = 0; i < lista.length; i += 200) {
    const lote = lista.slice(i, i + 200);
    const params: any[] = [];
    const valores = lote.map((l, idx) => {
      const b = idx * 7;
      const data = l.criadoEm ? new Date(l.criadoEm) : null;
      params.push(l.numero, txt(l.lote) || null, txt(l.cnpj) || null, txt(l.distribuidor) || null, data && !isNaN(data.getTime()) ? data : null, txt(l.status) || null, txt(l.tipoVeiculo).toUpperCase() || null);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DetranEtiquetaComprada" ("numero","lote","cnpj","distribuidor","criadoEm","statusCartela","tipoVeiculo")
       VALUES ${valores.join(',')}
       ON CONFLICT ("numero") DO UPDATE SET "lote"=EXCLUDED."lote","cnpj"=EXCLUDED."cnpj","distribuidor"=EXCLUDED."distribuidor",
         "criadoEm"=EXCLUDED."criadoEm","statusCartela"=EXCLUDED."statusCartela","tipoVeiculo"=EXCLUDED."tipoVeiculo","importadoEm"=now()`,
      ...params,
    );
    for (const l of lote) { if (existentes.has(l.numero)) atualizadas += 1; else novas += 1; }
  }
  const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "DetranEtiquetaComprada"`);
  return { recebidas: linhas.length, novas, atualizadas, invalidas: invalidas.slice(0, 30), totalInvalidas: invalidas.length, totalNaBase: Number(total[0]?.n || 0) };
}

// Todas as etiquetas hoje em uso no sistema (pecas, pre-cadastro e historico de devolucao) -> SKU base que as usa.
async function mapaEtiquetasEmUso() {
  const uso = new Map<string, string>();
  const [pecas, cadastros, historico] = await Promise.all([
    prisma.peca.findMany({ where: { detranEtiqueta: { not: null } }, select: { idPeca: true, detranEtiqueta: true } }),
    (prisma as any).cadastroPeca.findMany({ where: { detranEtiqueta: { not: null } }, select: { idPeca: true, detranEtiqueta: true } }),
    prisma.historicoDevolucao.findMany({ where: { etiquetasDetran: { not: null } }, select: { idPeca: true, etiquetasDetran: true } }),
  ]);
  for (const p of pecas) for (const e of etiquetasDoTexto(p.detranEtiqueta)) if (!uso.has(e)) uso.set(e, skuBase(p.idPeca));
  for (const p of cadastros as any[]) for (const e of etiquetasDoTexto(p.detranEtiqueta)) if (!uso.has(e)) uso.set(e, skuBase(p.idPeca));
  for (const h of historico) for (const e of etiquetasDoTexto(h.etiquetasDetran)) if (!uso.has(e)) uso.set(e, skuBase(h.idPeca));
  return uso;
}

export async function resumoCompradas() {
  await garantirTabelaCompradas();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "numero","tipoVeiculo","distribuidor","lote","criadoEm" FROM "DetranEtiquetaComprada"`);
  const uso = await mapaEtiquetasEmUso();
  const porTipo: Record<string, { total: number; emUso: number; livres: number }> = {};
  for (const r of rows) {
    const t = txt(r.tipoVeiculo) || 'SEM TIPO';
    porTipo[t] = porTipo[t] || { total: 0, emUso: 0, livres: 0 };
    porTipo[t].total += 1;
    if (uso.has(String(r.numero))) porTipo[t].emUso += 1; else porTipo[t].livres += 1;
  }
  const ultimaImportacao = await prisma.$queryRawUnsafe<any[]>(`SELECT MAX("importadoEm") AS d FROM "DetranEtiquetaComprada"`);
  return { total: rows.length, porTipo, ultimaImportacao: ultimaImportacao[0]?.d || null };
}

// Validacao de etiquetas NOVAS de um SKU. `jaTinha` = etiquetas que o SKU ja possuia (nao sao revalidadas: dado antigo nao trava edicao).
// Devolve a mensagem de erro (ou null se esta tudo certo).
export async function validarEtiquetasParaSku(o: { etiquetas: any[]; skuBase: string; motoId?: number | null; jaTinha?: any[] }): Promise<string | null> {
  await garantirTabelaCompradas();
  const todas = (o.etiquetas || []).map(normalizarEtiqueta).filter(Boolean);
  const repetida = todas.find((e, i) => todas.indexOf(e) !== i);
  if (repetida) return `A etiqueta ${repetida} foi informada mais de uma vez neste SKU.`;
  const jaTinha = new Set((o.jaTinha || []).map(normalizarEtiqueta));
  const alvo = todas.filter((e) => !jaTinha.has(e));
  if (!alvo.length) return null;
  const meuSku = skuBase(o.skuBase);

  // 1) precisa constar na listagem comprada (so cobra se a listagem ja foi importada)
  const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "DetranEtiquetaComprada"`);
  if (Number(total[0]?.n) > 0) {
    const compradas = new Set((await prisma.$queryRawUnsafe<any[]>(`SELECT "numero" FROM "DetranEtiquetaComprada" WHERE "numero" = ANY($1::text[])`, alvo)).map((r) => String(r.numero)));
    const cartelasMoto = new Set((await prisma.$queryRawUnsafe<any[]>(`SELECT "numero" FROM "DetranEtiquetaComprada" WHERE "tipoVeiculo" = 'MOTO'`)).map((r) => String(r.numero)));
    let baseMoto = '';
    if (o.motoId) {
      const m: any = await prisma.moto.findUnique({ where: { id: Number(o.motoId) }, select: { detranCartelaId: true } }).catch(() => null);
      baseMoto = normalizarEtiqueta(m?.detranCartelaId);
    }
    for (const e of alvo) {
      if (compradas.has(e)) continue;
      const pos = Number(e.slice(-3));
      const base = e.slice(0, -3);
      const ehPosicaoDeCartela = e.length > 3 && pos >= 1 && pos <= 34 && ((baseMoto && base === baseMoto) || cartelasMoto.has(base));
      if (ehPosicaoDeCartela) continue;
      return `A etiqueta ${e} nao consta na listagem de etiquetas compradas. Confira o numero ou importe a listagem atualizada em Etiquetas Detran.`;
    }
  }

  // 2) a mesma etiqueta nunca em 2 SKUs (considera pecas, pre-cadastro e historico de devolucao)
  for (const e of alvo) {
    const [pecas, cadastros, historico] = await Promise.all([
      prisma.peca.findMany({ where: { detranEtiqueta: { contains: e, mode: 'insensitive' } }, select: { idPeca: true, detranEtiqueta: true } }),
      (prisma as any).cadastroPeca.findMany({ where: { detranEtiqueta: { contains: e, mode: 'insensitive' } }, select: { idPeca: true, detranEtiqueta: true } }),
      prisma.historicoDevolucao.findMany({ where: { etiquetasDetran: { contains: e, mode: 'insensitive' } }, select: { idPeca: true, etiquetasDetran: true } }),
    ]);
    for (const p of pecas) if (etiquetasDoTexto(p.detranEtiqueta).includes(e) && skuBase(p.idPeca) !== meuSku) return `A etiqueta ${e} ja esta no SKU ${p.idPeca}. Uma etiqueta nao pode estar em dois SKUs.`;
    for (const p of cadastros as any[]) if (etiquetasDoTexto(p.detranEtiqueta).includes(e) && skuBase(p.idPeca) !== meuSku) return `A etiqueta ${e} ja esta no pre-cadastro do SKU ${p.idPeca}. Uma etiqueta nao pode estar em dois SKUs.`;
    for (const h of historico) if (etiquetasDoTexto(h.etiquetasDetran).includes(e) && skuBase(h.idPeca) !== meuSku) return `A etiqueta ${e} ja foi usada no SKU ${h.idPeca} (historico de devolucao). Uma etiqueta nao pode estar em dois SKUs.`;
  }
  return null;
}
