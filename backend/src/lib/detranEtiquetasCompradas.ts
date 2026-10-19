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
      // Etiqueta danificada/perdida: sai da lista de disponiveis e nao pode mais ser usada.
      await prisma.$executeRawUnsafe(`ALTER TABLE "DetranEtiquetaComprada" ADD COLUMN IF NOT EXISTS "descartadaEm" TIMESTAMPTZ`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "DetranEtiquetaComprada" ADD COLUMN IF NOT EXISTS "descarteMotivo" TEXT`);
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

// Cartelas de MOTO em uso: tabela "Cartela" (ativas e inativadas) + prefixo atual da moto.
async function mapaCartelasEmUso() {
  const uso = new Map<string, { ativa: boolean; moto: string }>();
  const cartelas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c."cartelaId", c."ativa", m."marca", m."modelo", m."ano" FROM "Cartela" c JOIN "Moto" m ON m."id" = c."motoId"`,
  ).catch(() => [] as any[]);
  for (const c of cartelas) uso.set(normalizarEtiqueta(c.cartelaId), { ativa: c.ativa !== false, moto: [c.marca, c.modelo, c.ano].filter(Boolean).join(' ') });
  const motos = await prisma.moto.findMany({ where: { detranCartelaId: { not: null } }, select: { detranCartelaId: true, marca: true, modelo: true, ano: true } });
  for (const m of motos) {
    const n = normalizarEtiqueta(m.detranCartelaId);
    if (n && !uso.has(n)) uso.set(n, { ativa: true, moto: [m.marca, m.modelo, m.ano].filter(Boolean).join(' ') });
  }
  return uso;
}

export type SituacaoEtiqueta = 'disponivel' | 'em_uso' | 'descartada';

// Lista da listagem comprada com a situacao de cada etiqueta (disponivel / em uso / descartada) e onde esta sendo usada.
export async function listarCompradas(f: { situacao?: string; tipo?: string; busca?: string } = {}) {
  await garantirTabelaCompradas();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "numero","lote","cnpj","distribuidor","criadoEm","statusCartela","tipoVeiculo","descartadaEm","descarteMotivo" FROM "DetranEtiquetaComprada" ORDER BY "numero" ASC`,
  );
  const [usoSku, usoCartela] = await Promise.all([mapaEtiquetasEmUso(), mapaCartelasEmUso()]);
  const todas = rows.map((r) => {
    const numero = String(r.numero);
    const tipo = txt(r.tipoVeiculo) || 'SEM TIPO';
    let situacao: SituacaoEtiqueta = 'disponivel';
    let detalhe = '';
    if (r.descartadaEm) { situacao = 'descartada'; detalhe = txt(r.descarteMotivo); }
    else if (tipo === 'MOTO' && usoCartela.has(numero)) {
      const c = usoCartela.get(numero)!;
      situacao = 'em_uso';
      detalhe = `${c.moto}${c.ativa ? '' : ' (cartela inativada)'}`;
    } else if (tipo !== 'MOTO' && usoSku.has(numero)) { situacao = 'em_uso'; detalhe = `SKU ${usoSku.get(numero)}`; }
    return {
      numero, tipo, lote: txt(r.lote), distribuidor: txt(r.distribuidor), cnpj: txt(r.cnpj), criadoEm: r.criadoEm, statusCartela: txt(r.statusCartela),
      situacao, detalhe, descartadaEm: r.descartadaEm || null,
    };
  });
  const resumo: Record<string, { total: number; disponiveis: number; emUso: number; descartadas: number }> = {};
  for (const e of todas) {
    const x = (resumo[e.tipo] = resumo[e.tipo] || { total: 0, disponiveis: 0, emUso: 0, descartadas: 0 });
    x.total += 1;
    if (e.situacao === 'disponivel') x.disponiveis += 1; else if (e.situacao === 'em_uso') x.emUso += 1; else x.descartadas += 1;
  }
  const q = txt(f.busca).toUpperCase();
  const itens = todas.filter((e) => {
    if (f.tipo && f.tipo !== 'todas' && e.tipo !== f.tipo) return false;
    if (f.situacao && f.situacao !== 'todas' && e.situacao !== f.situacao) return false;
    if (q && !(e.numero.includes(q) || e.lote.toUpperCase().includes(q) || e.detalhe.toUpperCase().includes(q))) return false;
    return true;
  });
  return { resumo, itens, total: todas.length };
}

export async function resumoCompradas() {
  const { resumo, total } = await listarCompradas();
  const ultima = await prisma.$queryRawUnsafe<any[]>(`SELECT MAX("importadoEm") AS d FROM "DetranEtiquetaComprada"`);
  return { total, porTipo: resumo, ultimaImportacao: ultima[0]?.d || null };
}

// Marca como danificada/perdida (sai dos disponiveis). Nao permite se a etiqueta ja esta em uso.
export async function descartarComprada(numeroBruto: any, motivo: any) {
  const numero = normalizarEtiqueta(numeroBruto);
  const { itens } = await listarCompradas({ busca: numero });
  const e = itens.find((x) => x.numero === numero);
  if (!e) throw new Error('Etiqueta nao encontrada na listagem comprada.');
  if (e.situacao === 'em_uso') throw new Error(`Essa etiqueta ja esta em uso (${e.detalhe}). So etiquetas disponiveis podem ser marcadas como danificadas.`);
  await prisma.$executeRawUnsafe(`UPDATE "DetranEtiquetaComprada" SET "descartadaEm" = now(), "descarteMotivo" = $2 WHERE "numero" = $1`, numero, txt(motivo) || 'Danificada');
}

export async function restaurarComprada(numeroBruto: any) {
  await garantirTabelaCompradas();
  await prisma.$executeRawUnsafe(`UPDATE "DetranEtiquetaComprada" SET "descartadaEm" = NULL, "descarteMotivo" = NULL WHERE "numero" = $1`, normalizarEtiqueta(numeroBruto));
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
    const linhasCompradas = await prisma.$queryRawUnsafe<any[]>(`SELECT "numero","descartadaEm","descarteMotivo" FROM "DetranEtiquetaComprada" WHERE "numero" = ANY($1::text[])`, alvo);
    const compradas = new Set(linhasCompradas.map((r) => String(r.numero)));
    const descartada = linhasCompradas.find((r) => r.descartadaEm);
    if (descartada) return `A etiqueta ${descartada.numero} foi marcada como danificada${txt(descartada.descarteMotivo) ? ` (${txt(descartada.descarteMotivo)})` : ''} e nao pode ser usada.`;
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
