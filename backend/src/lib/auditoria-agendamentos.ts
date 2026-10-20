// Configuracao do que cada execucao da auditoria verifica e de quando/como a conferencia rapida roda.
// Guardada numa tabelinha propria (criada sob demanda, sem migration). A rotina da madrugada continua usando os campos
// existentes (ativo, horario, escopo, lote, pausa); aqui ficam so "o que verificar" e e-mail dela, e tudo da conferencia rapida.
import { prisma } from './prisma';

// O que conferir em cada canal: 'estoque' (anuncio ativo x estoque), 'status' (existencia/situacao do anuncio) ou 'completo' (os dois).
// Shopee e Magalu so tem 'estoque' (status de bloqueado/excluido nao e analisado de proposito).
export type Modo = 'desligado' | 'estoque' | 'status' | 'completo';
export type Verificar = { anbBling: boolean; ml: Modo; nuvemshop: Modo; shopee: Modo; magalu: Modo };
export type PeriodoRapida = { tipo: 'dias' | 'mes_atual' | 'mes_anterior'; dias: number };
export type Conferencia = { id: string; nome: string; ativo: boolean; horarios: string[]; periodo: PeriodoRapida; verificar: Verificar; enviarEmail: boolean };
export type AgendamentosConfig = {
  madrugada: { verificar: Verificar; enviarEmail: boolean };
  conferencias: Conferencia[]; // conferencias menores (durante o dia): pode haver varias, cada uma com seus horarios/periodo/canais
};
export const MAX_CONFERENCIAS = 8;

const verificarPadrao = (): Verificar => ({ anbBling: true, ml: 'completo', nuvemshop: 'completo', shopee: 'estoque', magalu: 'estoque' });

export function conferenciaPadrao(id = 'c1', nome = 'Conferência menor'): Conferencia {
  return { id, nome, ativo: true, horarios: ['11:00', '16:00'], periodo: { tipo: 'dias', dias: 3 }, verificar: verificarPadrao(), enviarEmail: true };
}

export function agendamentosPadrao(): AgendamentosConfig {
  return { madrugada: { verificar: verificarPadrao(), enviarEmail: true }, conferencias: [conferenciaPadrao()] };
}

function limparModo(x: any, padrao: Modo, somenteEstoque = false): Modo {
  // aceita o formato antigo (booleano): true = padrao do canal, false = desligado
  let m: Modo = x === true ? padrao : x === false ? 'desligado' : (['desligado', 'estoque', 'status', 'completo'].includes(String(x)) ? (x as Modo) : padrao);
  if (somenteEstoque) m = m === 'completo' ? 'estoque' : m === 'status' ? 'desligado' : m;
  return m;
}

function limparVerificar(v: any, base: Verificar): Verificar {
  return {
    anbBling: typeof v?.anbBling === 'boolean' ? v.anbBling : base.anbBling,
    ml: limparModo(v?.ml, base.ml),
    nuvemshop: limparModo(v?.nuvemshop, base.nuvemshop),
    shopee: limparModo(v?.shopee, base.shopee, true),
    magalu: limparModo(v?.magalu, base.magalu, true),
  };
}

function limparHorarios(h: any, base: string[]): string[] {
  const lista = Array.isArray(h) ? h : base;
  const ok = Array.from(new Set(lista.map((x) => String(x || '').trim()).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)))).sort();
  return ok.slice(0, 8);
}

function limparConferencia(c: any, idx: number, idsUsados: Set<string>): Conferencia {
  const base = conferenciaPadrao();
  const tipo = ['dias', 'mes_atual', 'mes_anterior'].includes(String(c?.periodo?.tipo)) ? c.periodo.tipo : base.periodo.tipo;
  const dias = Math.max(1, Math.min(365, Math.round(Number(c?.periodo?.dias) || base.periodo.dias)));
  let id = String(c?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'c' + (idx + 1);
  while (idsUsados.has(id)) id = id + 'x';
  idsUsados.add(id);
  return {
    id,
    nome: String(c?.nome || '').trim().slice(0, 60) || 'Conferência ' + (idx + 1),
    ativo: typeof c?.ativo === 'boolean' ? c.ativo : true,
    horarios: Array.isArray(c?.horarios) ? limparHorarios(c.horarios, []) : base.horarios,
    periodo: { tipo, dias },
    verificar: limparVerificar(c?.verificar, base.verificar),
    enviarEmail: typeof c?.enviarEmail === 'boolean' ? c.enviarEmail : true,
  };
}

export function limparAgendamentos(entrada: any): AgendamentosConfig {
  const base = agendamentosPadrao();
  // formato antigo: uma unica conferencia em "rapida"
  const lista: any[] = Array.isArray(entrada?.conferencias) ? entrada.conferencias : entrada?.rapida ? [{ ...entrada.rapida, id: 'c1', nome: 'Conferência menor' }] : base.conferencias;
  const usados = new Set<string>();
  return {
    madrugada: {
      verificar: limparVerificar(entrada?.madrugada?.verificar, base.madrugada.verificar),
      enviarEmail: typeof entrada?.madrugada?.enviarEmail === 'boolean' ? entrada.madrugada.enviarEmail : base.madrugada.enviarEmail,
    },
    conferencias: lista.slice(0, MAX_CONFERENCIAS).map((c, i) => limparConferencia(c, i, usados)),
  };
}

let tabelaPronta: Promise<void> | null = null;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AuditoriaAgendamento" ("id" TEXT PRIMARY KEY, "config" TEXT NOT NULL, "atualizadoEm" TIMESTAMP NOT NULL DEFAULT now())`)
      .then(() => undefined)
      .catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

export async function carregarAgendamentos(): Promise<AgendamentosConfig> {
  await garantirTabela();
  const rows = await prisma.$queryRawUnsafe<Array<{ config: string }>>(`SELECT "config" FROM "AuditoriaAgendamento" WHERE "id" = 'principal'`);
  if (!rows.length) return agendamentosPadrao();
  try { return limparAgendamentos(JSON.parse(rows[0].config)); } catch { return agendamentosPadrao(); }
}

export async function salvarAgendamentos(entrada: any): Promise<AgendamentosConfig> {
  await garantirTabela();
  const limpo = limparAgendamentos(entrada);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuditoriaAgendamento" ("id","config","atualizadoEm") VALUES ('principal',$1,now()) ON CONFLICT ("id") DO UPDATE SET "config"=EXCLUDED."config","atualizadoEm"=now()`,
    JSON.stringify(limpo),
  );
  return limpo;
}

// ───────────── Filtro por tipo de divergencia ─────────────
const TIPOS_ANB_BLING = new Set(['estoque_anb_maior', 'estoque_bling_maior', 'estoque_bling_acima_maximo', 'nao_encontrado_bling', 'nao_encontrado_anb', 'peca_em_prejuizo']);

const incluiEstoque = (m: Modo) => m === 'estoque' || m === 'completo';
const incluiStatus = (m: Modo) => m === 'status' || m === 'completo';

export function tipoPermitido(tipo: string, v: Verificar): boolean {
  const t = String(tipo || '');
  if (TIPOS_ANB_BLING.has(t)) return v.anbBling;
  // Mercado Livre
  if (t === 'status_ml_publicado_sem_estoque') return incluiEstoque(v.ml); // anuncio ativo sem estoque
  if (t === 'status_ml_nao_ativo') return incluiStatus(v.ml); // tem estoque, anuncio nao ativo
  // Nuvemshop
  if (t === 'nuvemshop_anuncio_ativo_sem_estoque' || t === 'nuvemshop_anuncio_ativo_prejuizo') return incluiEstoque(v.nuvemshop);
  if (t === 'sem_anuncio_nuvemshop' || t === 'nuvemshop_anuncio_inativo') return incluiStatus(v.nuvemshop);
  if (t.includes('nuvemshop')) return v.nuvemshop !== 'desligado';
  // Shopee / Magalu (so estoque)
  if (t.startsWith('shopee_')) return incluiEstoque(v.shopee);
  if (t.startsWith('magalu_')) return incluiEstoque(v.magalu);
  return true;
}

export function aplicarVerificar(resultado: any, v: Verificar) {
  const todas: any[] = Array.isArray(resultado?.divergencias) ? resultado.divergencias : [];
  const mantidas = todas.filter((d) => tipoPermitido(d?.tipo, v));
  if (mantidas.length === todas.length) return resultado;
  return {
    ...resultado,
    divergencias: mantidas,
    totalDivergencias: mantidas.length,
    totalSemDivergencia: Math.max(0, Number(resultado?.totalConsultados || 0) - mantidas.length),
  };
}

// ───────────── Periodo da conferencia rapida ─────────────
function partesSp(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) % 24, minuto: Number(p.minute) };
}
const doisDig = (n: number) => String(n).padStart(2, '0');
const meiaNoiteSp = (ano: number, mes: number, dia: number) => new Date(`${ano}-${doisDig(mes)}-${doisDig(dia)}T00:00:00-03:00`);

export function intervaloDoPeriodo(p: PeriodoRapida, agora = new Date()): { de: Date; ate: Date | null } {
  const sp = partesSp(agora);
  if (p.tipo === 'mes_atual') return { de: meiaNoiteSp(sp.ano, sp.mes, 1), ate: null };
  if (p.tipo === 'mes_anterior') {
    const anoAnt = sp.mes === 1 ? sp.ano - 1 : sp.ano;
    const mesAnt = sp.mes === 1 ? 12 : sp.mes - 1;
    return { de: meiaNoiteSp(anoAnt, mesAnt, 1), ate: meiaNoiteSp(sp.ano, sp.mes, 1) };
  }
  const hoje0 = meiaNoiteSp(sp.ano, sp.mes, sp.dia);
  return { de: new Date(hoje0.getTime() - p.dias * 24 * 60 * 60 * 1000), ate: null };
}

export function descreverPeriodo(p: PeriodoRapida): string {
  if (p.tipo === 'mes_atual') return 'Mês atual (desde o dia 1)';
  if (p.tipo === 'mes_anterior') return 'Mês anterior (fechado)';
  return `Últimos ${p.dias} dia(s) (hoje menos ${p.dias})`;
}

// ───────────── Textos do relatorio ─────────────
export function descreverVerificar(v: Verificar): string[] {
  const itens: string[] = [];
  if (v.anbBling) itens.push('Estoque ANB × Bling');
  const rotulo = (nome: string, m: Modo) => (m === 'completo' ? `${nome}: estoque + status` : m === 'estoque' ? `${nome}: só estoque` : m === 'status' ? `${nome}: só status` : '');
  for (const x of [rotulo('Mercado Livre', v.ml), rotulo('Nuvemshop', v.nuvemshop), rotulo('Shopee', v.shopee), rotulo('Magalu', v.magalu)]) if (x) itens.push(x);
  return itens.length ? itens : ['Nada selecionado'];
}

// Proxima execucao entre os horarios (fuso de Sao Paulo): "hoje as 16:00" / "amanha as 03:00".
export function proximaExecucao(horarios: string[], agora = new Date()): string | null {
  if (!horarios.length) return null;
  const sp = partesSp(agora);
  const atual = `${doisDig(sp.hora)}:${doisDig(sp.minuto)}`;
  const ordenados = [...horarios].sort();
  const hoje = ordenados.find((h) => h > atual);
  return hoje ? `hoje às ${hoje}` : `amanhã às ${ordenados[0]}`;
}
