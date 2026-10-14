// Integracao OLX Brasil (API de integrador, OAuth). Docs: https://developers.olx.com.br
//   - Autorizacao: https://auth.olx.com.br/oauth  (scopes: autoupload chat autoservice basic_user_info)
//   - Token:       POST https://auth.olx.com.br/oauth/token  -> { access_token, token_type } (a OLX nao documenta refresh/expiracao)
//   - Redirect URI cadastrada na OLX: https://sistema.anbparts.com.br/api/olx/callback
// Credenciais (client_id / client_secret) e token ficam na tabela "OlxConfig", criada sob demanda (sem migration).
import { Router } from 'express';
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
    res.json({
      ok: true,
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

// POST /olx/desconectar — apaga so o token (credenciais do integrador ficam).
olxRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await salvarOlxConfig({ accessToken: '', scopes: '', usuarioNome: '', usuarioEmail: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
