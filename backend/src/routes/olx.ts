// Integracao OLX Brasil (API de integrador, OAuth). Docs: https://developers.olx.com.br
//   - Autorizacao: https://auth.olx.com.br/oauth  (scopes: autoupload chat autoservice basic_user_info)
//   - Token:       POST https://auth.olx.com.br/oauth/token  -> { access_token, token_type } (a OLX nao documenta refresh/expiracao)
//   - Redirect URI cadastrada na OLX: https://sistema.anbparts.com.br/api/olx/callback
// Credenciais (client_id / client_secret) e token ficam na tabela "OlxConfig", criada sob demanda (sem migration).
import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { carregarAnuncioBase } from '../lib/anuncioBase';
import { exigirFotosOficiais, lerDadosBlingSku } from '../lib/anuncioPreparar';
import { buscarFotosDriveSku } from '../lib/fotos-cadastro';
import { getConfiguracaoGeral } from '../lib/configuracoes-gerais';

export const olxRouter = Router();

const OLX_AUTH = 'https://auth.olx.com.br/oauth';
const OLX_TOKEN = 'https://auth.olx.com.br/oauth/token';
const OLX_USER_INFO = 'https://apps.olx.com.br/oauth_api/basic_user_info';
const OLX_SCOPES = 'basic_user_info autoupload chat autoservice';

const txt = (v: any) => String(v ?? '').trim();

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// A redirect_uri precisa ser EXATAMENTE a cadastrada na OLX. Em producao o frontend repassa /api/* ao backend.
function getRedirectUri() {
  if (process.env.OLX_REDIRECT_URI) return process.env.OLX_REDIRECT_URI;
  return 'https://sistema.anbparts.com.br/api/olx/callback';
}

let tabelaPronta: Promise<void> | null = null;
function garantirTabela(): Promise<void> {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OlxConfig" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "clientId" TEXT NOT NULL DEFAULT '',
        "clientSecret" TEXT NOT NULL DEFAULT '',
        "accessToken" TEXT NOT NULL DEFAULT '',
        "scopes" TEXT NOT NULL DEFAULT '',
        "usuarioNome" TEXT,
        "usuarioEmail" TEXT,
        "connectedAt" TIMESTAMPTZ,
        "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`INSERT INTO "OlxConfig" ("id") VALUES (1) ON CONFLICT DO NOTHING`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxConfig" ADD COLUMN IF NOT EXISTS "webhookKey" TEXT NOT NULL DEFAULT ''`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxConfig" ADD COLUMN IF NOT EXISTS "webhookAtivoEm" TIMESTAMPTZ`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxConfig" ADD COLUMN IF NOT EXISTS "telefone" TEXT NOT NULL DEFAULT ''`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxConfig" ADD COLUMN IF NOT EXISTS "cep" TEXT NOT NULL DEFAULT ''`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxConfig" ADD COLUMN IF NOT EXISTS "telefoneOculto" BOOLEAN NOT NULL DEFAULT false`);

      // SKU <-> ID do anuncio na OLX ("listId", o numero que aparece no fim do link do anuncio).
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OlxAnuncio" (
        "sku" TEXT PRIMARY KEY,
        "listId" TEXT NOT NULL,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "adId" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "importToken" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "status" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "mensagem" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "url" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "encerradoEm" TIMESTAMPTZ`);
      // Anuncios anteriores do SKU (um SKU pode ter tido varios): ao trocar o vinculo ou remover, o antigo vai pra ca.
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OlxAnuncioHistorico" (
        "id" SERIAL PRIMARY KEY, "sku" TEXT NOT NULL, "listId" TEXT NOT NULL, "status" TEXT, "url" TEXT,
        "criadoEm" TIMESTAMPTZ, "encerradoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OlxAnuncioHistorico_sku_idx" ON "OlxAnuncioHistorico" ("sku")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OlxAnuncio_listId_idx" ON "OlxAnuncio" ("listId")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OlxMensagem" (
        "messageId" TEXT PRIMARY KEY,
        "chatId" TEXT NOT NULL,
        "listId" TEXT,
        "origem" TEXT NOT NULL DEFAULT 'buyer',
        "senderType" TEXT,
        "mensagem" TEXT NOT NULL DEFAULT '',
        "nome" TEXT,
        "email" TEXT,
        "telefone" TEXT,
        "enviadaEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "recebidaEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "lida" BOOLEAN NOT NULL DEFAULT false)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OlxMensagem_chatId_idx" ON "OlxMensagem" ("chatId")`);
    })().catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

export async function getOlxConfig() {
  await garantirTabela();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxConfig" WHERE "id" = 1`);
  const r = rows[0] || {};
  return {
    clientId: txt(r.clientId),
    clientSecret: txt(r.clientSecret),
    accessToken: txt(r.accessToken),
    scopes: txt(r.scopes),
    usuarioNome: txt(r.usuarioNome),
    usuarioEmail: txt(r.usuarioEmail),
    connectedAt: r.connectedAt || null,
    telefone: txt(r.telefone),
    cep: txt(r.cep),
    telefoneOculto: r.telefoneOculto === true,
  };
}

async function salvarOlxConfig(d: Partial<{ clientId: string; clientSecret: string; accessToken: string; scopes: string; usuarioNome: string; usuarioEmail: string; connectedAt: Date | null }>) {
  await garantirTabela();
  const atual = await getOlxConfig();
  const m = { ...atual, ...d };
  await prisma.$executeRawUnsafe(
    `UPDATE "OlxConfig" SET "clientId"=$1,"clientSecret"=$2,"accessToken"=$3,"scopes"=$4,"usuarioNome"=$5,"usuarioEmail"=$6,"connectedAt"=$7,"atualizadoEm"=now() WHERE "id"=1`,
    m.clientId, m.clientSecret, m.accessToken, m.scopes, m.usuarioNome || null, m.usuarioEmail || null, m.connectedAt,
  );
}

// Dados basicos da conta autorizada (valida o token). Retorna null se o token nao funcionar.
export async function olxUsuarioBasico(accessToken: string): Promise<{ nome: string; email: string } | null> {
  try {
    const resp = await fetch(OLX_USER_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!resp.ok) return null;
    const j: any = await resp.json().catch(() => null);
    if (!j) return null;
    return { nome: txt(j.name || j.nome), email: txt(j.email) };
  } catch { return null; }
}

// GET /olx/status — nunca devolve o secret nem o token.
olxRouter.get('/status', async (_req, res, next) => {
  try {
    const c = await getOlxConfig();
    const w = await prisma.$queryRawUnsafe<any[]>(`SELECT "webhookAtivoEm" FROM "OlxConfig" WHERE "id" = 1`);
    res.json({
      ok: true,
      chatAtivoEm: w[0]?.webhookAtivoEm || null,
      clientIdConfigurado: !!c.clientId,
      clientId: c.clientId ? `${c.clientId.slice(0, 6)}…${c.clientId.slice(-4)}` : '',
      clientSecretConfigurado: !!c.clientSecret,
      connected: !!c.accessToken,
      scopes: c.scopes,
      usuarioNome: c.usuarioNome,
      usuarioEmail: c.usuarioEmail,
      connectedAt: c.connectedAt,
      redirectUri: getRedirectUri(),
      telefone: c.telefone,
      cep: c.cep,
      telefoneOculto: c.telefoneOculto,
      contatoEfetivo: await contatoOlx().catch(() => ({ telefone: '', cep: '' })),
    });
  } catch (e) { next(e); }
});

// POST /olx/config { clientId, clientSecret } — campo vazio mantem o valor atual (o secret nunca volta pra tela).
olxRouter.post('/config', async (req, res, next) => {
  try {
    const clientId = txt(req.body?.clientId);
    const clientSecret = txt(req.body?.clientSecret);
    const d: any = {};
    if (clientId) d.clientId = clientId;
    if (clientSecret) d.clientSecret = clientSecret;
    // Dados de contato do anuncio (vazio = usa os da Empresa).
    if (req.body?.telefone !== undefined || req.body?.cep !== undefined || req.body?.telefoneOculto !== undefined) {
      await garantirTabela();
      const tel = String(req.body?.telefone ?? '').replace(/\D/g, '');
      const cep = String(req.body?.cep ?? '').replace(/\D/g, '');
      if (tel && !/^\d{10,11}$/.test(tel)) return res.status(400).json({ ok: false, error: 'Telefone invalido: use DDD + numero (10 ou 11 digitos).' });
      if (cep && !/^\d{8}$/.test(cep)) return res.status(400).json({ ok: false, error: 'CEP invalido: use 8 digitos.' });
      await prisma.$executeRawUnsafe(
        `UPDATE "OlxConfig" SET "telefone"=$1,"cep"=$2,"telefoneOculto"=$3,"atualizadoEm"=now() WHERE "id"=1`,
        tel, cep, req.body?.telefoneOculto === true,
      );
      d.__contato = true;
    }
    delete d.__contato;
    if (Object.keys(d).length) await salvarOlxConfig(d);
    else if (req.body?.telefone === undefined && req.body?.cep === undefined && req.body?.telefoneOculto === undefined) {
      return res.status(400).json({ ok: false, error: 'Informe o Client ID e/ou o Client Secret.' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /olx/auth-url — link de autorizacao (o usuario da OLX loga e autoriza a conta da ANB).
olxRouter.get('/auth-url', async (_req, res, next) => {
  try {
    const c = await getOlxConfig();
    if (!c.clientId || !c.clientSecret) return res.status(400).json({ ok: false, error: 'Salve o Client ID e o Client Secret antes de conectar.' });
    const url = `${OLX_AUTH}?response_type=code&client_id=${encodeURIComponent(c.clientId)}&redirect_uri=${encodeURIComponent(getRedirectUri())}&scope=${encodeURIComponent(OLX_SCOPES)}&state=anbparts`;
    res.json({ ok: true, url });
  } catch (e) { next(e); }
});

// GET /olx/callback — a OLX redireciona pra ca com ?code=... (vale 10 min, uso unico). Troca pelo token e salva.
const codesProcessados = new Map<string, Promise<void>>();
olxRouter.get('/callback', async (req, res) => {
  const code = txt(req.query.code);
  const erroOlx = txt(req.query.error);
  const volta = (qs: string) => res.redirect(`${getFrontendBase()}/config-olx?${qs}`);
  try {
    if (erroOlx) return volta(`erro=${encodeURIComponent(`A OLX recusou a autorizacao (${erroOlx}).`)}`);
    if (!code) return volta(`erro=${encodeURIComponent('Retorno da OLX sem o codigo de autorizacao.')}`);

    let p = codesProcessados.get(code);
    if (!p) {
      p = (async () => {
        const c = await getOlxConfig();
        if (!c.clientId || !c.clientSecret) throw new Error('Client ID/Secret nao configurados.');
        const body = new URLSearchParams({
          code, client_id: c.clientId, client_secret: c.clientSecret,
          redirect_uri: getRedirectUri(), grant_type: 'authorization_code',
        });
        const resp = await fetch(OLX_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const j: any = await resp.json().catch(() => ({}));
        if (!resp.ok || !j?.access_token) {
          throw new Error(txt(j?.error_description || j?.error || j?.message) || `A OLX respondeu ${resp.status} na troca do codigo.`);
        }
        const usuario = await olxUsuarioBasico(String(j.access_token));
        await salvarOlxConfig({
          accessToken: String(j.access_token),
          scopes: OLX_SCOPES,
          usuarioNome: usuario?.nome || '',
          usuarioEmail: usuario?.email || '',
          connectedAt: new Date(),
        });
      })();
      codesProcessados.set(code, p);
      setTimeout(() => codesProcessados.delete(code), 10 * 60 * 1000);
    }
    await p;
    return volta('conectado=1');
  } catch (e: any) {
    console.error(`[olx/callback] erro: ${e?.message}`);
    return volta(`erro=${encodeURIComponent(e?.message || 'Erro ao conectar a OLX')}`);
  }
});

// ───────────── Anuncios vinculados (SKU <-> ID do anuncio na OLX) ─────────────
const OLX_CHAT = 'https://apps.olx.com.br/autoservice/v1/chat';

// Aceita o numero puro, o link publico (…-1544189286) ou o link de edicao do painel (…desapega?a=1818187087&l=1544189286).
// No link de edicao vem dois numeros: "l" (list_id, o ID do anuncio) e "a" (ad_id interno) — guardamos os dois.
function lerIdsAnuncio(v: any): { listId: string; adId: string } {
  const s = txt(v);
  const l = s.match(/[?&]l=(\d{4,})/);
  const a = s.match(/[?&]a=(\d{4,})/);
  if (l) return { listId: l[1], adId: a ? a[1] : '' };
  if (a) return { listId: a[1], adId: '' };
  const m = s.match(/(\d{6,})(?:[^\d]*)$/);
  return { listId: m ? m[1] : s.replace(/\D/g, ''), adId: '' };
}

// Consulta o anuncio na OLX pelo list_id. Devolve null se nao achar / token invalido.
async function consultarAnuncioOlx(listId: string): Promise<{ status: string; url: string } | null> {
  try {
    const c = await getOlxConfig();
    if (!c.accessToken || !listId) return null;
    const resp = await fetch(`https://apps.olx.com.br/autoupload/ads/${encodeURIComponent(listId)}`, { headers: { Authorization: `Bearer ${c.accessToken}` } });
    if (!resp.ok) return null;
    const j: any = await resp.json().catch(() => null);
    return j ? { status: txt(j.status), url: txt(j.url) } : null;
  } catch { return null; }
}

const urlPublicaOlx = (listId: string) => (listId ? `https://www.olx.com.br/vi/${listId}.htm` : '');
const statusEncerrado = (s: string) => s === 'deleted' || s === 'refused';

async function estoqueDoSku(sku: string): Promise<number | null> {
  const where = { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] } as any;
  const total = await prisma.peca.count({ where });
  if (!total) return null; // SKU so no pre-cadastro: sem como saber
  return prisma.peca.count({ where: { ...where, disponivel: true } as any });
}

// Move o anuncio atual do SKU pro historico (quando o vinculo troca, e' removido ou o anuncio e' encerrado).
async function arquivarAnuncioDoSku(sku: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
  const r = rows[0];
  if (!r || !txt(r.listId)) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OlxAnuncioHistorico" ("sku","listId","status","url","criadoEm","encerradoEm") VALUES ($1,$2,$3,$4,$5,COALESCE($6, now()))`,
    sku, txt(r.listId), txt(r.status) || null, txt(r.url) || urlPublicaOlx(txt(r.listId)), r.criadoEm || null, r.encerradoEm || null,
  );
}

// GET /olx/anuncios — { itens (vinculo atual de cada SKU, com ativo/estoque/precisaExcluir), historico (anuncios anteriores) }
olxRouter.get('/anuncios', async (_req, res, next) => {
  try {
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncio" ORDER BY "criadoEm" DESC`);
    const hist = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncioHistorico" ORDER BY "encerradoEm" DESC LIMIT 500`);
    const skus = Array.from(new Set([...rows.map((r) => String(r.sku)), ...hist.map((r) => String(r.sku))]));
    const pecas: any[] = skus.length ? await prisma.peca.findMany({ where: { idPeca: { in: skus } }, select: { idPeca: true, descricao: true } }) : [];
    const desc = new Map(pecas.map((p: any) => [String(p.idPeca), String(p.descricao || '')]));
    // titulo do pre-cadastro/outras unidades quando o SKU base nao e' uma Peca exata
    const itens: any[] = [];
    for (const r of rows) {
      const sku = String(r.sku);
      const status = txt(r.status);
      const listId = String(r.listId || '');
      const ativo = !statusEncerrado(status);
      const estoque = ativo && listId ? await estoqueDoSku(sku).catch(() => null) : null;
      itens.push({
        sku, listId, titulo: desc.get(sku) || '', status, mensagem: txt(r.mensagem),
        url: txt(r.url) || urlPublicaOlx(listId), ativo, estoque,
        precisaExcluir: ativo && !!listId && estoque === 0,
        criadoEm: r.criadoEm, encerradoEm: r.encerradoEm || null,
      });
    }
    res.json({
      ok: true,
      itens,
      historico: hist.map((h) => ({
        sku: String(h.sku), listId: String(h.listId), titulo: desc.get(String(h.sku)) || '', status: txt(h.status),
        url: txt(h.url) || urlPublicaOlx(String(h.listId)), criadoEm: h.criadoEm, encerradoEm: h.encerradoEm,
      })),
    });
  } catch (e) { next(e); }
});

olxRouter.post('/anuncios', async (req, res, next) => {
  try {
    await garantirTabela();
    const sku = txt(req.body?.sku).toUpperCase();
    const ids = lerIdsAnuncio(req.body?.listId);
    let listId = ids.listId;
    let adId = ids.adId;
    if (!sku) return res.status(400).json({ ok: false, error: 'Informe o SKU.' });
    if (!listId) return res.status(400).json({ ok: false, error: 'Informe o ID (ou o link) do anuncio na OLX.' });
    const peca = await prisma.peca.findUnique({ where: { idPeca: sku }, select: { idPeca: true } });
    if (!peca) return res.status(404).json({ ok: false, error: `SKU ${sku} nao encontrado no sistema.` });
    // Confirma qual dos numeros e' o list_id de verdade (a OLX responde so pelo list_id).
    let confirmado = await consultarAnuncioOlx(listId);
    if (!confirmado && adId) {
      const alt = await consultarAnuncioOlx(adId);
      if (alt) { confirmado = alt; [listId, adId] = [adId, listId]; }
    }
    // Se o SKU ja tinha OUTRO anuncio vinculado, o antigo vai pro historico.
    const atual = await prisma.$queryRawUnsafe<any[]>(`SELECT "listId" FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
    if (atual.length && txt(atual[0].listId) && txt(atual[0].listId) !== listId) await arquivarAnuncioDoSku(sku);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OlxAnuncio" ("sku","listId","adId","status","url") VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("sku") DO UPDATE SET "listId" = EXCLUDED."listId", "adId" = EXCLUDED."adId", "status" = EXCLUDED."status", "url" = EXCLUDED."url",
         "encerradoEm" = NULL, "criadoEm" = now()`,
      sku, listId, adId || null, confirmado?.status || null, confirmado?.url || urlPublicaOlx(listId),
    );
    res.json({ ok: true, sku, listId, confirmado: !!confirmado, statusOlx: confirmado?.status || null, url: confirmado?.url || urlPublicaOlx(listId) });
  } catch (e) { next(e); }
});

// POST /olx/anuncios/atualizar — confere agora o status de todos os anuncios (o mesmo que a rotina automatica faz a cada 30 min).
olxRouter.post('/anuncios/atualizar', async (_req, res, next) => {
  try {
    await sincronizarImportacoes();
    await varrerStatusPublicados();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /olx/anuncios/:sku/excluido — confirma na mao que o anuncio foi excluido na OLX (quando a rotina ainda nao viu).
olxRouter.post('/anuncios/:sku/excluido', async (req, res, next) => {
  try {
    await garantirTabela();
    const sku = txt(req.params.sku).toUpperCase();
    await prisma.$executeRawUnsafe(`UPDATE "OlxAnuncio" SET "status"='deleted', "encerradoEm"=now() WHERE "sku"=$1`, sku);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /olx/anuncios/:sku/consulta — diagnostico: devolve CRU o que a OLX responde sobre o anuncio vinculado ao SKU
// (status pelo list_id e pelo ad_id, e a listagem de publicados filtrada), pra ver quais dados a API entrega.
olxRouter.get('/anuncios/:sku/consulta', async (req, res, next) => {
  try {
    await garantirTabela();
    const sku = txt(req.params.sku).toUpperCase();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
    if (!rows.length) return res.status(404).json({ ok: false, error: `SKU ${sku} sem anuncio vinculado.` });
    const c = await getOlxConfig();
    if (!c.accessToken) return res.status(400).json({ ok: false, error: 'Conecte a OLX antes.' });
    const listId = String(rows[0].listId);
    const adId = rows[0].adId ? String(rows[0].adId) : '';
    const get = async (url: string) => {
      try {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${c.accessToken}` } });
        const texto = await resp.text();
        let corpo: any = texto;
        try { corpo = JSON.parse(texto); } catch { /* resposta nao-JSON: devolve o texto */ }
        return { url, status: resp.status, corpo };
      } catch (e: any) { return { url, erro: e?.message || String(e) }; }
    };
    const resultado: any = { sku, listId, adId: adId || null };
    resultado.statusPorListId = await get(`https://apps.olx.com.br/autoupload/ads/${encodeURIComponent(listId)}`);
    if (adId) resultado.statusPorAdId = await get(`https://apps.olx.com.br/autoupload/ads/${encodeURIComponent(adId)}`);
    resultado.publicados = await get('https://apps.olx.com.br/autoupload/v1/published?fetch_size=50');
    resultado.usuario = await olxUsuarioBasico(c.accessToken);
    res.json({ ok: true, ...resultado });
  } catch (e) { next(e); }
});

olxRouter.delete('/anuncios/:sku', async (req, res, next) => {
  try {
    await garantirTabela();
    await arquivarAnuncioDoSku(txt(req.params.sku).toUpperCase());
    await prisma.$executeRawUnsafe(`DELETE FROM "OlxAnuncio" WHERE "sku" = $1`, txt(req.params.sku).toUpperCase());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ───────────── Chat: recebimento por webhook e resposta ─────────────
async function urlWebhook() {
  await garantirTabela();
  let rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "webhookKey" FROM "OlxConfig" WHERE "id" = 1`);
  let key = txt(rows[0]?.webhookKey);
  if (!key) {
    key = randomBytes(24).toString('hex');
    await prisma.$executeRawUnsafe(`UPDATE "OlxConfig" SET "webhookKey" = $1 WHERE "id" = 1`, key);
  }
  return `${getRedirectUri().replace(/\/olx\/callback$/, '')}/olx/webhook?k=${key}`;
}

// POST /olx/chat/ativar — registra nossa URL na OLX (a partir daqui cada mensagem de comprador chega no webhook).
olxRouter.post('/chat/ativar', async (_req, res, next) => {
  try {
    const c = await getOlxConfig();
    if (!c.accessToken) return res.status(400).json({ ok: false, error: 'Conecte a OLX antes.' });
    const webhook = await urlWebhook();
    const resp = await fetch(OLX_CHAT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook }),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      const t = await resp.text().catch(() => '');
      return res.status(400).json({ ok: false, error: `A OLX respondeu ${resp.status} ao ativar o chat. ${t}`.trim() });
    }
    await prisma.$executeRawUnsafe(`UPDATE "OlxConfig" SET "webhookAtivoEm" = now() WHERE "id" = 1`);
    res.json({ ok: true, criado: resp.status === 201 });
  } catch (e) { next(e); }
});

olxRouter.post('/chat/desativar', async (_req, res, next) => {
  try {
    const c = await getOlxConfig();
    if (!c.accessToken) return res.status(400).json({ ok: false, error: 'Conecte a OLX antes.' });
    const resp = await fetch(OLX_CHAT, { method: 'DELETE', headers: { Authorization: `Bearer ${c.accessToken}` } });
    if (resp.status !== 200) return res.status(400).json({ ok: false, error: `A OLX respondeu ${resp.status} ao desativar o chat.` });
    await prisma.$executeRawUnsafe(`UPDATE "OlxConfig" SET "webhookAtivoEm" = NULL WHERE "id" = 1`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /olx/webhook?k=CHAVE — chamado pela OLX (publico, protegido pela chave na URL).
olxRouter.post('/webhook', async (req, res) => {
  try {
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "webhookKey" FROM "OlxConfig" WHERE "id" = 1`);
    const key = txt(rows[0]?.webhookKey);
    if (!key || txt(req.query.k) !== key) return res.status(401).json({ ok: false });
    const itens = Array.isArray(req.body) ? req.body : [req.body];
    for (const b of itens) {
      const messageId = txt(b?.messageId);
      const chatId = txt(b?.chatId);
      if (!messageId || !chatId) continue;
      const origem = txt(b?.origin).toLowerCase() === 'seller' ? 'seller' : 'buyer';
      const quando = b?.messageTimestamp ? new Date(String(b.messageTimestamp)) : new Date();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "OlxMensagem" ("messageId","chatId","listId","origem","senderType","mensagem","nome","email","telefone","enviadaEm","lida")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT ("messageId") DO NOTHING`,
        messageId, chatId, txt(b?.listId) || null, origem, txt(b?.senderType) || null, String(b?.message ?? ''),
        txt(b?.name) || null, txt(b?.email) || null, txt(b?.phone) || null,
        isNaN(quando.getTime()) ? new Date() : quando, origem === 'seller',
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(`[olx/webhook] erro: ${e?.message}`);
    res.status(500).json({ ok: false });
  }
});

// GET /olx/conversas — uma linha por chat, mais recente primeiro.
olxRouter.get('/conversas', async (_req, res, next) => {
  try {
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT m."chatId",
             MAX(m."listId") AS "listId",
             MAX(m."nome") FILTER (WHERE m."origem" = 'buyer') AS "nome",
             MAX(m."telefone") FILTER (WHERE m."origem" = 'buyer') AS "telefone",
             MAX(m."email") FILTER (WHERE m."origem" = 'buyer') AS "email",
             MAX(m."enviadaEm") AS "ultimaEm",
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE m."lida" = false)::int AS "naoLidas",
             (SELECT x."mensagem" FROM "OlxMensagem" x WHERE x."chatId" = m."chatId" ORDER BY x."enviadaEm" DESC LIMIT 1) AS "ultima",
             (SELECT a."sku" FROM "OlxAnuncio" a WHERE a."listId" = MAX(m."listId") OR a."adId" = MAX(m."listId") LIMIT 1) AS "sku"
      FROM "OlxMensagem" m GROUP BY m."chatId" ORDER BY MAX(m."enviadaEm") DESC LIMIT 200`);
    res.json({ ok: true, itens: rows.map((r) => ({ ...r, total: Number(r.total), naoLidas: Number(r.naoLidas) })) });
  } catch (e) { next(e); }
});

olxRouter.get('/conversas/:chatId', async (req, res, next) => {
  try {
    await garantirTabela();
    const chatId = txt(req.params.chatId);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxMensagem" WHERE "chatId" = $1 ORDER BY "enviadaEm" ASC`, chatId);
    await prisma.$executeRawUnsafe(`UPDATE "OlxMensagem" SET "lida" = true WHERE "chatId" = $1 AND "lida" = false`, chatId);
    res.json({ ok: true, mensagens: rows });
  } catch (e) { next(e); }
});

// POST /olx/conversas/:chatId/responder { texto }
olxRouter.post('/conversas/:chatId/responder', async (req, res, next) => {
  try {
    await garantirTabela();
    const chatId = txt(req.params.chatId);
    const texto = txt(req.body?.texto);
    if (!texto) return res.status(400).json({ ok: false, error: 'Digite a mensagem.' });
    const c = await getOlxConfig();
    if (!c.accessToken) return res.status(400).json({ ok: false, error: 'Conecte a OLX antes.' });
    const messageId = randomUUID();
    const resp = await fetch(`${OLX_CHAT}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ textMessage: texto, messageId, chatId }),
    });
    if (resp.status !== 200) {
      const t = await resp.text().catch(() => '');
      return res.status(400).json({ ok: false, error: `A OLX respondeu ${resp.status} ao enviar. ${t}`.trim() });
    }
    const ref = await prisma.$queryRawUnsafe<any[]>(`SELECT "listId" FROM "OlxMensagem" WHERE "chatId" = $1 ORDER BY "enviadaEm" DESC LIMIT 1`, chatId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OlxMensagem" ("messageId","chatId","listId","origem","senderType","mensagem","lida") VALUES ($1,$2,$3,'seller','account',$4,true) ON CONFLICT DO NOTHING`,
      messageId, chatId, ref[0]?.listId || null, texto,
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ───────────── Criacao de anuncio (aba Anuncio do Cadastro) ─────────────
// Mesmo contrato das outras rotas (/shopee, /magalu, /nuvemshop): /anuncio/categorias, /buscar, /criar.
// OLX nao tem arvore de categorias propria pra pecas: moto = categoria 2103 ("Autos e pecas > Pecas e acessorios > Motos").
const OLX_CATEGORIA_PECAS_MOTO = 2103;
const OLX_IMPORT = 'https://apps.olx.com.br/autoupload/import';
const OLX_PUBLISHED = 'https://apps.olx.com.br/autoupload/v1/published';

function skuBase(v: any) { return txt(v).toUpperCase().replace(/-\d+$/, ''); }
function backendBase() { return (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, ''); }

// Telefone/CEP do anuncio: os de Conf. OLX; se vazios, os da Empresa (telefone com Whats e CEP do endereco completo).
async function contatoOlx(): Promise<{ telefone: string; cep: string }> {
  const c = await getOlxConfig();
  let telefone = c.telefone;
  let cep = c.cep;
  if (!telefone || !cep) {
    const g: any = await getConfiguracaoGeral().catch(() => null);
    if (!telefone) {
      let d = String(g?.empresaTelefoneWhats || '').replace(/\D/g, '');
      if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
      if (/^\d{10,11}$/.test(d)) telefone = d;
    }
    if (!cep) {
      const m = String(g?.empresaEnderecoCompleto || '').match(/(\d{5})-?(\d{3})/);
      if (m) cep = m[1] + m[2];
    }
  }
  return { telefone, cep };
}

olxRouter.get('/anuncio/categorias', (_req, res) => {
  res.json({
    ok: true,
    categorias: [{
      id: OLX_CATEGORIA_PECAS_MOTO, categoria: 'Autos e peças', subcategoria: 'Peças e acessórios', nivel3: '', nivel4: 'Motos',
      permitido: true, caminho: 'Autos e peças > Peças e acessórios > Motos', generica: false,
    }],
  });
});

// Atualiza o vinculo (list_id/status) dos anuncios criados pelo sistema: consulta o status da importacao pelo token.
async function sincronizarImportacoes(skus?: string[]) {
  await garantirTabela();
  const c = await getOlxConfig();
  if (!c.accessToken) return;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "sku","importToken" FROM "OlxAnuncio" WHERE "importToken" IS NOT NULL AND ("listId" = '' OR "status" IS NULL OR "status" = 'pending')`,
  );
  for (const r of rows) {
    if (skus && !skus.includes(String(r.sku))) continue;
    try {
      const resp = await fetch(`${OLX_IMPORT}/${encodeURIComponent(String(r.importToken))}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: c.accessToken }),
      });
      if (!resp.ok) continue;
      const j: any = await resp.json().catch(() => null);
      const ads = j?.ads || {};
      const ad: any = ads[String(r.sku)] || (Array.isArray(ads) ? ads[0] : Object.values(ads)[0]);
      if (!ad) continue;
      const msgs = Array.isArray(ad.message) ? ad.message.map((m: any) => txt(m?.error || m)).filter(Boolean).join(', ') : '';
      await prisma.$executeRawUnsafe(
        `UPDATE "OlxAnuncio" SET "status"=$2, "mensagem"=$3, "listId"=CASE WHEN $4 <> '' THEN $4 ELSE "listId" END WHERE "sku"=$1`,
        String(r.sku), txt(ad.status) || null, msgs || null, txt(ad.list_id),
      );
    } catch { /* tenta de novo na proxima consulta */ }
  }

  // 2a via (token vencido ou sem resposta): a listagem de publicados traz o "id" que mandamos (= SKU) ao lado do list_id.
  try {
    const pend = await prisma.$queryRawUnsafe<any[]>(`SELECT "sku" FROM "OlxAnuncio" WHERE "importToken" IS NOT NULL AND "listId" = ''`);
    const alvo = pend.map((p) => String(p.sku)).filter((s) => !skus || skus.includes(s));
    if (!alvo.length) return;
    let pageToken = '';
    for (let pagina = 0; pagina < 5; pagina++) {
      const url = `${OLX_PUBLISHED}?fetch_size=200${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${c.accessToken}` } });
      if (!resp.ok) break;
      const j: any = await resp.json().catch(() => null);
      for (const a of Array.isArray(j?.data) ? j.data : []) {
        const id = txt(a?.id);
        if (id && txt(a?.list_id) && alvo.includes(id)) {
          await prisma.$executeRawUnsafe(`UPDATE "OlxAnuncio" SET "listId"=$2, "status"=$3 WHERE "sku"=$1`, id, txt(a.list_id), txt(a.status) || 'published');
        }
      }
      pageToken = txt(j?.next_token);
      if (!pageToken) break;
    }
  } catch { /* melhor esforco */ }
}

olxRouter.post('/anuncio/buscar', async (req, res, next) => {
  try {
    await garantirTabela();
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => skuBase(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });
    await sincronizarImportacoes(skus).catch(() => null);
    const contato = await contatoOlx();
    const c = await getOlxConfig();
    const restricoesGerais: string[] = [];
    if (!c.accessToken) restricoesGerais.push('OLX nao conectada (Conf. OLX).');
    if (!contato.telefone) restricoesGerais.push('Telefone do anuncio nao configurado (Conf. OLX ou Empresa).');
    if (!contato.cep) restricoesGerais.push('CEP do anuncio nao configurado (Conf. OLX ou Empresa).');

    const linhas: any[] = [];
    for (const sku of skus) {
      const peca = await carregarAnuncioBase(sku);
      if (!peca) { linhas.push({ sku, encontrado: false, erro: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' }); continue; }
      const reg = await prisma.$queryRawUnsafe<any[]>(`SELECT "listId","status","mensagem" FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
      const jaTem = reg.length > 0;
      const listId = jaTem ? txt(reg[0].listId) : '';
      const recusado = jaTem && txt(reg[0].status) === 'refused';
      linhas.push({
        sku,
        origem: peca.origem,
        fotosProcessadas: peca.fotosOficiais > 0,
        fotosQtd: peca.fotosOficiais,
        encontrado: true,
        descricao: peca.descricao,
        moto: peca.moto,
        preco: Number(peca.precoML || 0),
        peso: peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : null),
        largura: peca.largura != null ? Number(peca.largura) : null,
        altura: peca.altura != null ? Number(peca.altura) : null,
        profundidade: peca.profundidade != null ? Number(peca.profundidade) : null,
        estoque: peca.estoque,
        olxItemId: jaTem ? (listId || 'aguardando aprovacao') : null,
        jaTemAnuncio: jaTem && !recusado,
        restricoes: restricoesGerais,
        erroConsulta: recusado ? `Recusado pela OLX: ${txt(reg[0].mensagem) || 'sem detalhe'}` : undefined,
        categoriaAtual: { id: OLX_CATEGORIA_PECAS_MOTO, nivel4: 'Motos', caminho: 'Autos e peças > Peças e acessórios > Motos', permitido: true, generica: false },
        categoriaPendente: false,
      });
    }
    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

// POST /olx/anuncio/criar { sku, categoriaId? } — envia o anuncio pela importacao (PUT /autoupload/import).
// Titulo/condicao/descricao vem do Bling (fonte do "Ajustar titulo"), com o SKU na 1a linha da descricao; TODAS as fotos
// do Drive (ate 20) vao como URL publica. A OLX processa de forma assincrona: o list_id chega depois (aba Anuncios / status).
olxRouter.post('/anuncio/criar', async (req, res) => {
  try {
    await garantirTabela();
    const sku = skuBase(req.body?.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const c = await getOlxConfig();
    if (!c.accessToken) return res.status(400).json({ error: 'OLX nao conectada (Conf. OLX).' });
    const contato = await contatoOlx();
    if (!contato.telefone || !contato.cep) return res.status(400).json({ error: 'Configure o telefone e o CEP do anuncio em Conf. OLX (ou na Empresa).' });

    const peca = await carregarAnuncioBase(sku);
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro)' });
    exigirFotosOficiais(peca);
    if (!peca.estoque) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU' });
    const preco = Math.round(Number(peca.precoML || 0));
    if (!(preco > 0)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });

    const reg = await prisma.$queryRawUnsafe<any[]>(`SELECT "listId","status" FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
    if (reg.length && txt(reg[0].status) !== 'refused') {
      return res.status(400).json({ error: `SKU ja possui anuncio na OLX (${txt(reg[0].listId) || 'aguardando aprovacao'}).` });
    }

    const dados = await lerDadosBlingSku(peca).catch(() => null);
    const titulo = (txt(dados?.titulo) || txt(peca.descricao) || sku).slice(0, 90);
    const condicao = (dados?.condicao || peca.condicao || 'usado') === 'novo' ? '1' : '2';
    let texto = txt(dados?.descricao);
    if (!texto) {
      const moto = peca.moto || ({} as any);
      texto = [
        titulo,
        [moto.marca, moto.modelo, moto.ano].filter(Boolean).length ? `Moto/Modelo: ${[moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ')}` : '',
        peca.numeroPeca ? `Código da peça (PN): ${peca.numeroPeca}` : '',
        'Peça original, em bom estado de conservação. Consulte as fotos antes de comprar.',
      ].filter(Boolean).join('\n');
    }
    const corpo = (texto.toUpperCase().startsWith(sku) ? texto : `${sku}\n${texto}`).slice(0, 6000);

    const drive = await buscarFotosDriveSku(peca.motoId, sku);
    const imagens = drive.fotos.slice(0, 20).map((f: any) => `${backendBase()}/magalu/imagem/${encodeURIComponent(f.id)}`);
    if (!imagens.length) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU — o SKU precisa de pelo menos 1 imagem.' });

    const anuncio: any = {
      id: sku.slice(0, 19),
      operation: 'insert',
      category: OLX_CATEGORIA_PECAS_MOTO,
      subject: titulo,
      body: corpo,
      type: 's',
      price: preco,
      zipcode: contato.cep,
      Phone: Number(contato.telefone),
      images: imagens,
      params: { condition: condicao, parts_name_motos: '10' },
    };
    if (c.telefoneOculto) anuncio.phone_hidden = true;

    const resp = await fetch(OLX_IMPORT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: c.accessToken, ad_list: [anuncio] }),
    });
    const j: any = await resp.json().catch(() => ({}));
    if (!resp.ok || Number(j?.statusCode) !== 0) {
      const detalhe = Array.isArray(j?.errors) ? JSON.stringify(j.errors).slice(0, 400) : '';
      return res.status(400).json({ error: `A OLX recusou a importacao (${j?.statusCode ?? resp.status}): ${txt(j?.statusMessage)} ${detalhe}`.trim() });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "OlxAnuncio" ("sku","listId","importToken","status") VALUES ($1,'',$2,'pending')
       ON CONFLICT ("sku") DO UPDATE SET "listId"='', "importToken"=EXCLUDED."importToken", "status"='pending', "mensagem"=NULL`,
      sku, txt(j?.token) || null,
    );
    res.json({ ok: true, sku, olxItemId: 'aguardando aprovacao', imagens: imagens.length, token: txt(j?.token) || null, aviso: 'Enviado. A OLX analisa o anuncio e o ID aparece em alguns minutos (consulte de novo a SKU).' });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao criar anuncio na OLX' });
  }
});

// GET /olx/anuncio/status?sku= — situacao do anuncio criado pelo sistema (status/list_id/mensagens da OLX).
olxRouter.get('/anuncio/status', async (req, res) => {
  try {
    await garantirTabela();
    const sku = skuBase(req.query.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    await sincronizarImportacoes([sku]);
    const reg = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncio" WHERE "sku" = $1`, sku);
    if (!reg.length) return res.status(404).json({ error: 'SKU sem anuncio vinculado na OLX.' });
    const listId = txt(reg[0].listId);
    const info = listId ? await consultarAnuncioOlx(listId) : null;
    res.json({ ok: true, sku, listId: listId || null, statusImportacao: txt(reg[0].status) || null, mensagem: txt(reg[0].mensagem) || null, statusOlx: info?.status || null, url: info?.url || null });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao consultar o anuncio' });
  }
});

// ───────────── Rotina automatica ─────────────
// A cada 5 min: resolve os anuncios criados pelo sistema que ainda aguardam aprovacao (grava o list_id / motivo da recusa).
// A cada 30 min: varre a listagem de publicados e atualiza o status dos anuncios vinculados (publicado, removido, recusado...).
let olxSchedulerRodando = false;
let olxUltimaVarredura = 0;

async function varrerStatusPublicados() {
  const c = await getOlxConfig();
  if (!c.accessToken) return;
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "sku","listId","status" FROM "OlxAnuncio" WHERE "listId" <> ''`);
  if (!rows.length) return;
  const porListId = new Map<string, string>();
  let pageToken = '';
  for (let pagina = 0; pagina < 10; pagina++) {
    const url = `${OLX_PUBLISHED}?fetch_size=200${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${c.accessToken}` } });
    if (!resp.ok) return; // nao altera nada se a listagem falhou
    const j: any = await resp.json().catch(() => null);
    for (const a of Array.isArray(j?.data) ? j.data : []) if (txt(a?.list_id)) porListId.set(txt(a.list_id), txt(a.status));
    pageToken = txt(j?.next_token);
    if (!pageToken) break;
  }
  for (const r of rows) {
    const atual = porListId.get(String(r.listId));
    const novo = atual || 'deleted'; // sumiu da listagem = nao esta mais no ar
    if (novo !== txt(r.status)) {
      await prisma.$executeRawUnsafe(`UPDATE "OlxAnuncio" SET "status"=$2, "encerradoEm"=CASE WHEN $2 IN ('deleted','refused') THEN COALESCE("encerradoEm", now()) ELSE NULL END, "url"=COALESCE("url", $3) WHERE "sku"=$1`, String(r.sku), novo, urlPublicaOlx(String(r.listId)));
      console.log(`[olx] anuncio ${r.sku} (${r.listId}): ${txt(r.status) || '-'} -> ${novo}`);
    }
  }
}

export function startOlxScheduler() {
  const tick = async () => {
    if (olxSchedulerRodando) return;
    olxSchedulerRodando = true;
    try {
      await garantirTabela();
      await sincronizarImportacoes();
      if (Date.now() - olxUltimaVarredura > 30 * 60 * 1000) {
        olxUltimaVarredura = Date.now();
        await varrerStatusPublicados();
      }
    } catch (e: any) {
      console.error('[olx] rotina falhou:', e?.message || e);
    } finally { olxSchedulerRodando = false; }
  };
  setTimeout(() => { void tick(); }, 2 * 60 * 1000);
  setInterval(() => { void tick(); }, 5 * 60 * 1000);
}

// POST /olx/desconectar — apaga so o token (credenciais do integrador ficam).
olxRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await salvarOlxConfig({ accessToken: '', scopes: '', usuarioNome: '', usuarioEmail: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
