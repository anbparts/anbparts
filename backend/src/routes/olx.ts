// Integracao OLX Brasil (API de integrador, OAuth). Docs: https://developers.olx.com.br
//   - Autorizacao: https://auth.olx.com.br/oauth  (scopes: autoupload chat autoservice basic_user_info)
//   - Token:       POST https://auth.olx.com.br/oauth/token  -> { access_token, token_type } (a OLX nao documenta refresh/expiracao)
//   - Redirect URI cadastrada na OLX: https://sistema.anbparts.com.br/api/olx/callback
// Credenciais (client_id / client_secret) e token ficam na tabela "OlxConfig", criada sob demanda (sem migration).
import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';

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
      // SKU <-> ID do anuncio na OLX ("listId", o numero que aparece no fim do link do anuncio).
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OlxAnuncio" (
        "sku" TEXT PRIMARY KEY,
        "listId" TEXT NOT NULL,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "OlxAnuncio" ADD COLUMN IF NOT EXISTS "adId" TEXT`);
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
    if (!Object.keys(d).length) return res.status(400).json({ ok: false, error: 'Informe o Client ID e/ou o Client Secret.' });
    await salvarOlxConfig(d);
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

olxRouter.get('/anuncios', async (_req, res, next) => {
  try {
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OlxAnuncio" ORDER BY "criadoEm" DESC`);
    const skus = rows.map((r) => String(r.sku));
    const pecas: any[] = skus.length ? await prisma.peca.findMany({ where: { idPeca: { in: skus } }, select: { idPeca: true, descricao: true } }) : [];
    const desc = new Map(pecas.map((p: any) => [String(p.idPeca), String(p.descricao || '')]));
    res.json({ ok: true, itens: rows.map((r) => ({ sku: String(r.sku), listId: String(r.listId), titulo: desc.get(String(r.sku)) || '', criadoEm: r.criadoEm })) });
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
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OlxAnuncio" ("sku","listId","adId") VALUES ($1,$2,$3)
       ON CONFLICT ("sku") DO UPDATE SET "listId" = EXCLUDED."listId", "adId" = EXCLUDED."adId"`, sku, listId, adId || null,
    );
    res.json({ ok: true, sku, listId, confirmado: !!confirmado, statusOlx: confirmado?.status || null, url: confirmado?.url || null });
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

// POST /olx/desconectar — apaga so o token (credenciais do integrador ficam).
olxRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await salvarOlxConfig({ accessToken: '', scopes: '', usuarioNome: '', usuarioEmail: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
