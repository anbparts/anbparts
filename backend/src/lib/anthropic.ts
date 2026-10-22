// Chave da API da Anthropic guardada no sistema (tela Conf. Anthropic) + registro de uso de tokens por recurso/usuario.
// A chave fica no banco criptografada (AES-256-GCM, chave derivada do segredo de sessao do servidor). Se o banco nao tiver chave (ou o segredo
// mudou e nao da mais para ler), cai na variavel de ambiente ANTHROPIC_API_KEY. A chave nunca volta para a tela.
import crypto from 'crypto';
import { prisma } from './prisma';

const API = 'https://api.anthropic.com/v1';
// Estimativa de custo (Sonnet 4.x): US$ por milhao de tokens. Serve so para dar ordem de grandeza no relatorio.
export const PRECO_ENTRADA_USD_MTOK = 3;
export const PRECO_SAIDA_USD_MTOK = 15;

// ───────────── Chave ─────────────
function segredoServidor() { return process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || ''; }
function chaveCripto() { return crypto.scryptSync(segredoServidor() || 'anb-parts-sem-segredo', 'anb-anthropic-config-v1', 32); }

function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveCripto(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}
function decifrar(valor: string): string {
  const [v, iv, tag, enc] = String(valor || '').split(':');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('formato invalido');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveCripto(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

let tabelasProntas: Promise<void> | null = null;
export function garantirTabelasAnthropic(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AnthropicConfig" ("id" TEXT PRIMARY KEY, "chave" TEXT NOT NULL, "atualizadoEm" TIMESTAMP NOT NULL DEFAULT now(), "atualizadoPor" TEXT)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AnthropicUso" (
        "id" SERIAL PRIMARY KEY, "criadoEm" TIMESTAMP NOT NULL DEFAULT now(), "recurso" TEXT NOT NULL, "usuario" TEXT, "modelo" TEXT,
        "tipo" TEXT NOT NULL DEFAULT 'chamada', "tokensEntrada" INTEGER NOT NULL DEFAULT 0, "tokensSaida" INTEGER NOT NULL DEFAULT 0,
        "ok" BOOLEAN NOT NULL DEFAULT true, "erro" TEXT, "duracaoMs" INTEGER, "contexto" TEXT)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnthropicUso_criadoEm_idx" ON "AnthropicUso" ("criadoEm")`);
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

let cacheChave: { valor: string | null; origem: 'banco' | 'ambiente' | 'nenhuma'; expira: number } | null = null;

export async function obterChaveAnthropic(): Promise<string | null> {
  if (cacheChave && cacheChave.expira > Date.now()) return cacheChave.valor;
  let valor: string | null = null;
  let origem: 'banco' | 'ambiente' | 'nenhuma' = 'nenhuma';
  try {
    await garantirTabelasAnthropic();
    const rows = await prisma.$queryRawUnsafe<Array<{ chave: string }>>(`SELECT "chave" FROM "AnthropicConfig" WHERE "id" = 'principal'`);
    if (rows[0]?.chave) { valor = decifrar(rows[0].chave); origem = 'banco'; }
  } catch { /* sem chave legivel no banco: tenta o ambiente */ }
  if (!valor && process.env.ANTHROPIC_API_KEY) { valor = String(process.env.ANTHROPIC_API_KEY); origem = 'ambiente'; }
  cacheChave = { valor, origem, expira: Date.now() + 60_000 };
  return valor;
}

export async function statusChaveAnthropic() {
  await garantirTabelasAnthropic();
  const rows = await prisma.$queryRawUnsafe<Array<{ chave: string; atualizadoEm: Date; atualizadoPor: string | null }>>(`SELECT "chave","atualizadoEm","atualizadoPor" FROM "AnthropicConfig" WHERE "id" = 'principal'`);
  let legivelNoBanco = false;
  let finalBanco = '';
  if (rows[0]) {
    try { const k = decifrar(rows[0].chave); legivelNoBanco = true; finalBanco = k.slice(-4); } catch { legivelNoBanco = false; }
  }
  const env = process.env.ANTHROPIC_API_KEY ? String(process.env.ANTHROPIC_API_KEY) : '';
  const origemAtiva: 'banco' | 'ambiente' | 'nenhuma' = legivelNoBanco ? 'banco' : env ? 'ambiente' : 'nenhuma';
  return {
    origemAtiva,
    final: legivelNoBanco ? finalBanco : env ? env.slice(-4) : '',
    noBanco: !!rows[0], legivelNoBanco, atualizadoEm: rows[0]?.atualizadoEm || null, atualizadoPor: rows[0]?.atualizadoPor || null,
    ambienteConfigurado: !!env,
  };
}

export async function salvarChaveAnthropic(chave: string, usuario: string | null) {
  const k = String(chave || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(k)) throw new Error('Chave invalida: ela deve comecar com "sk-ant-".');
  await garantirTabelasAnthropic();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AnthropicConfig" ("id","chave","atualizadoEm","atualizadoPor") VALUES ('principal',$1,now(),$2)
     ON CONFLICT ("id") DO UPDATE SET "chave"=EXCLUDED."chave","atualizadoEm"=now(),"atualizadoPor"=EXCLUDED."atualizadoPor"`,
    cifrar(k), usuario,
  );
  cacheChave = null;
}

// Valida a chave listando os modelos (nao gasta tokens)
export async function testarChaveAnthropic(chave?: string): Promise<{ ok: boolean; mensagem: string }> {
  const k = chave || (await obterChaveAnthropic());
  if (!k) return { ok: false, mensagem: 'Nenhuma chave configurada.' };
  try {
    const resp = await fetch(`${API}/models?limit=5`, { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': k }, signal: AbortSignal.timeout(15000) });
    if (resp.ok) return { ok: true, mensagem: 'Chave valida: a Anthropic aceitou o acesso.' };
    if (resp.status === 401) return { ok: false, mensagem: 'A Anthropic recusou a chave (401): ela esta incorreta ou foi revogada.' };
    return { ok: false, mensagem: `A Anthropic respondeu ${resp.status}.` };
  } catch (e: any) { return { ok: false, mensagem: `Nao foi possivel falar com a Anthropic: ${e?.message || e}` }; }
}

// ───────────── Registro de uso ─────────────
type RegistroUso = { recurso: string; usuario?: string | null; modelo?: string | null; tipo?: 'chamada' | 'evitada'; tokensEntrada?: number; tokensSaida?: number; ok?: boolean; erro?: string | null; duracaoMs?: number | null; contexto?: string | null };

export async function registrarUsoAnthropic(r: RegistroUso) {
  try {
    await garantirTabelasAnthropic();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AnthropicUso" ("recurso","usuario","modelo","tipo","tokensEntrada","tokensSaida","ok","erro","duracaoMs","contexto") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      r.recurso, r.usuario || 'sistema (automatico)', r.modelo || null, r.tipo || 'chamada', Math.round(r.tokensEntrada || 0), Math.round(r.tokensSaida || 0),
      r.ok !== false, r.erro ? String(r.erro).slice(0, 300) : null, r.duracaoMs != null ? Math.round(r.duracaoMs) : null, r.contexto ? String(r.contexto).slice(0, 200) : null,
    );
  } catch (e: any) { console.error('[anthropic] nao foi possivel registrar o uso:', e?.message || e); }
}

// Marca que uma regra interna (ou outra API) resolveu sem gastar IA — aparece no relatorio como "chamadas evitadas"
export function registrarEvitadaAnthropic(recurso: string, usuario?: string | null, contexto?: string | null) {
  void registrarUsoAnthropic({ recurso, usuario, tipo: 'evitada', contexto });
}

// POST /v1/messages com registro de tokens, usuario e recurso. Devolve o JSON da resposta.
export async function chamarAnthropic(o: { recurso: string; usuario?: string | null; contexto?: string | null; body: any; timeoutMs?: number }): Promise<any> {
  const chave = await obterChaveAnthropic();
  if (!chave) throw new Error('Chave da Anthropic nao configurada (Configuracoes > Conf. Anthropic).');
  const inicio = Date.now();
  const modelo = String(o.body?.model || '');
  try {
    const resp = await fetch(`${API}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(o.timeoutMs || 25000),
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': chave },
      body: JSON.stringify(o.body),
    });
    const dados: any = await resp.json().catch(() => ({}));
    await registrarUsoAnthropic({
      recurso: o.recurso, usuario: o.usuario, modelo, tokensEntrada: dados?.usage?.input_tokens, tokensSaida: dados?.usage?.output_tokens,
      ok: resp.ok, erro: resp.ok ? null : `${resp.status} ${dados?.error?.message || ''}`, duracaoMs: Date.now() - inicio, contexto: o.contexto,
    });
    if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
    return dados;
  } catch (e: any) {
    if (!/^Claude API/.test(String(e?.message))) {
      await registrarUsoAnthropic({ recurso: o.recurso, usuario: o.usuario, modelo, ok: false, erro: e?.message || String(e), duracaoMs: Date.now() - inicio, contexto: o.contexto });
    }
    throw e;
  }
}

// ───────────── Relatorio ─────────────
export async function relatorioUsoAnthropic(dias: number) {
  await garantirTabelasAnthropic();
  const d = Math.max(1, Math.min(365, Math.round(dias) || 30));
  const periodo = `"criadoEm" >= now() - ($1 || ' days')::interval`;
  const custo = `((COALESCE(SUM("tokensEntrada"),0) * ${PRECO_ENTRADA_USD_MTOK} + COALESCE(SUM("tokensSaida"),0) * ${PRECO_SAIDA_USD_MTOK}) / 1000000.0)`;
  const q = <T = any>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql, String(d));
  const [tot] = await q(`SELECT COUNT(*) FILTER (WHERE "tipo"='chamada')::int AS chamadas, COUNT(*) FILTER (WHERE "tipo"='evitada')::int AS evitadas,
      COUNT(*) FILTER (WHERE "tipo"='chamada' AND "ok" = false)::int AS erros, COALESCE(SUM("tokensEntrada"),0)::bigint AS entrada, COALESCE(SUM("tokensSaida"),0)::bigint AS saida,
      ${custo} AS custo FROM "AnthropicUso" WHERE ${periodo}`);
  const porRecurso = await q(`SELECT "recurso", COUNT(*) FILTER (WHERE "tipo"='chamada')::int AS chamadas, COUNT(*) FILTER (WHERE "tipo"='evitada')::int AS evitadas,
      COUNT(*) FILTER (WHERE "tipo"='chamada' AND "ok" = false)::int AS erros, COALESCE(SUM("tokensEntrada"),0)::bigint AS entrada, COALESCE(SUM("tokensSaida"),0)::bigint AS saida, ${custo} AS custo
      FROM "AnthropicUso" WHERE ${periodo} GROUP BY "recurso" ORDER BY entrada DESC, chamadas DESC`);
  const porUsuario = await q(`SELECT COALESCE("usuario",'sistema (automatico)') AS usuario, COUNT(*) FILTER (WHERE "tipo"='chamada')::int AS chamadas, COALESCE(SUM("tokensEntrada"),0)::bigint AS entrada,
      COALESCE(SUM("tokensSaida"),0)::bigint AS saida, ${custo} AS custo FROM "AnthropicUso" WHERE ${periodo} AND "tipo"='chamada' GROUP BY 1 ORDER BY entrada DESC`);
  const porDia = await q(`SELECT (("criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia, COUNT(*) FILTER (WHERE "tipo"='chamada')::int AS chamadas,
      COUNT(*) FILTER (WHERE "tipo"='evitada')::int AS evitadas, COALESCE(SUM("tokensEntrada"),0)::bigint AS entrada, COALESCE(SUM("tokensSaida"),0)::bigint AS saida
      FROM "AnthropicUso" WHERE ${periodo} GROUP BY 1 ORDER BY 1`);
  const ultimas = await q(`SELECT "id","criadoEm","recurso","usuario","modelo","tipo","tokensEntrada","tokensSaida","ok","erro","duracaoMs","contexto"
      FROM "AnthropicUso" WHERE ${periodo} ORDER BY "id" DESC LIMIT 100`);
  const n = (v: any) => Number(v || 0);
  return {
    dias: d,
    totais: { chamadas: n(tot?.chamadas), evitadas: n(tot?.evitadas), erros: n(tot?.erros), entrada: n(tot?.entrada), saida: n(tot?.saida), custoUsd: n(tot?.custo) },
    porRecurso: porRecurso.map((r: any) => ({ recurso: r.recurso, chamadas: n(r.chamadas), evitadas: n(r.evitadas), erros: n(r.erros), entrada: n(r.entrada), saida: n(r.saida), custoUsd: n(r.custo) })),
    porUsuario: porUsuario.map((r: any) => ({ usuario: r.usuario, chamadas: n(r.chamadas), entrada: n(r.entrada), saida: n(r.saida), custoUsd: n(r.custo) })),
    porDia: porDia.map((r: any) => ({ dia: r.dia, chamadas: n(r.chamadas), evitadas: n(r.evitadas), entrada: n(r.entrada), saida: n(r.saida) })),
    ultimas: ultimas.map((r: any) => ({ id: n(r.id), criadoEm: r.criadoEm, recurso: r.recurso, usuario: r.usuario, modelo: r.modelo, tipo: r.tipo, entrada: n(r.tokensEntrada), saida: n(r.tokensSaida), ok: !!r.ok, erro: r.erro, duracaoMs: r.duracaoMs, contexto: r.contexto })),
    precos: { entradaUsdMtok: PRECO_ENTRADA_USD_MTOK, saidaUsdMtok: PRECO_SAIDA_USD_MTOK },
  };
}
