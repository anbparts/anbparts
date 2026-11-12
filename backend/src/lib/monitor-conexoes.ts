// Monitor de Conexoes: valida (com chamada real a cada API) todas as integracoes do sistema e avisa por e-mail quando uma cai.
import { prisma } from './prisma';
import { getConfiguracaoGeral, DEFAULT_RESEND_FROM } from './configuracoes-gerais';
import { sendResendEmail, renderAlertEmailLayout, renderEmailPanel } from './email';
import { getWhatsappConfig } from './whatsapp';
import { getShopeeConfig, shopeeReq } from './shopee-api';
import { getMagaluConfig, getMagaluSellerInfo } from './magalu-api';
import { blingReq } from '../routes/bling';
import { monitorMercadoLivreMe, monitorMercadoPagoMe } from '../routes/mercado-livre';
import { monitorGoogleDriveChecar } from '../routes/google-drive';
import { nuvemReq } from '../routes/nuvemshop';
import { getOlxConfig } from '../routes/olx';

export type StatusConexao = 'ok' | 'erro' | 'nao_configurado';
export type ResultadoConexao = {
  chave: string;
  nome: string;
  status: StatusConexao;
  detalhe: string;
  aviso?: string;
  telaConfig: string;
  verificadoEm: string;
  tentativas?: number; // quantas tentativas seguidas falharam (so preenchido na rotina automatica)
};

const TICK_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 25_000;

// ---- configuracao dos alertas (editavel na tela do Monitor de Conexoes) ----
export type ConfigMonitor = { tentativas: number; intervaloSeg: number; reavisoHoras: number };
export const CONFIG_MONITOR_PADRAO: ConfigMonitor = { tentativas: 5, intervaloSeg: 60, reavisoHoras: 24 };
// Limites: tentativas x intervalo precisa caber dentro do ciclo de 30 min da rotina.
export const LIMITES_MONITOR = { tentativas: [1, 10], intervaloSeg: [10, 120], reavisoHoras: [1, 168] } as const;

function limitar(v: any, [min, max]: readonly [number, number], padrao: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

export function normalizarConfigMonitor(raw: any): ConfigMonitor {
  return {
    tentativas: limitar(raw?.tentativas, LIMITES_MONITOR.tentativas, CONFIG_MONITOR_PADRAO.tentativas),
    intervaloSeg: limitar(raw?.intervaloSeg, LIMITES_MONITOR.intervaloSeg, CONFIG_MONITOR_PADRAO.intervaloSeg),
    reavisoHoras: limitar(raw?.reavisoHoras, LIMITES_MONITOR.reavisoHoras, CONFIG_MONITOR_PADRAO.reavisoHoras),
  };
}

let tabelaConfigPronta = false;
async function garantirTabelaConfig() {
  if (tabelaConfigPronta) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MonitorConexaoConfig" (
    "id" INTEGER PRIMARY KEY, "tentativas" INTEGER NOT NULL DEFAULT 5, "intervaloSeg" INTEGER NOT NULL DEFAULT 60,
    "reavisoHoras" INTEGER NOT NULL DEFAULT 24, "atualizadoEm" TIMESTAMPTZ)`);
  tabelaConfigPronta = true;
}

export async function lerConfigMonitor(): Promise<ConfigMonitor> {
  try {
    await garantirTabelaConfig();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "tentativas","intervaloSeg","reavisoHoras" FROM "MonitorConexaoConfig" WHERE "id" = 1`);
    return rows[0] ? normalizarConfigMonitor(rows[0]) : { ...CONFIG_MONITOR_PADRAO };
  } catch {
    return { ...CONFIG_MONITOR_PADRAO };
  }
}

export async function salvarConfigMonitor(raw: any): Promise<ConfigMonitor> {
  await garantirTabelaConfig();
  const c = normalizarConfigMonitor(raw);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "MonitorConexaoConfig" ("id","tentativas","intervaloSeg","reavisoHoras","atualizadoEm") VALUES (1,$1,$2,$3,now())
     ON CONFLICT ("id") DO UPDATE SET "tentativas"=$1,"intervaloSeg"=$2,"reavisoHoras"=$3,"atualizadoEm"=now()`,
    c.tentativas, c.intervaloSeg, c.reavisoHoras,
  );
  return c;
}

const txt = (v: any) => String(v ?? '').trim();
const msg = (e: any) => txt(e?.message || e).slice(0, 300) || 'Falha desconhecida';

function comTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Sem resposta (tempo esgotado)')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

type Checagem = {
  chave: string;
  nome: string;
  telaConfig: string;
  rodar: () => Promise<{ configurado: boolean; detalhe?: string; aviso?: string }>;
};

const CHECAGENS: Checagem[] = [
  {
    chave: 'mercado_livre', nome: 'Mercado Livre', telaConfig: '/config-ml',
    rodar: async () => {
      const cfg = await prisma.mercadoLivreConfig.findFirst();
      if (!cfg?.accessToken) return { configurado: false };
      const me: any = await monitorMercadoLivreMe();
      return { configurado: true, detalhe: `Conta ${txt(me?.nickname) || txt(me?.id)}` };
    },
  },
  {
    chave: 'mercado_pago', nome: 'Mercado Pago', telaConfig: '/config-ml',
    rodar: async () => {
      const cfg: any = await prisma.mercadoLivreConfig.findFirst();
      if (!/^APP_(USR|TEST)-/i.test(txt(cfg?.mercadoPagoAccessToken))) return { configurado: false };
      const me: any = await monitorMercadoPagoMe();
      return {
        configurado: true,
        detalhe: `Conta ${txt(me?.nickname) || txt(me?.id)}`,
        aviso: txt(cfg?.mercadoPagoRefreshToken) ? undefined : 'Sem renovação automática: se o token for invalidado, é preciso colar outro.',
      };
    },
  },
  {
    chave: 'bling', nome: 'Bling', telaConfig: '/bling',
    rodar: async () => {
      const cfg: any = await prisma.blingConfig.findFirst();
      if (!cfg?.accessToken) return { configurado: false };
      await blingReq('/produtos?pagina=1&limite=1');
      return { configurado: true, detalhe: 'Conectado' };
    },
  },
  {
    chave: 'nuvemshop', nome: 'Nuvemshop', telaConfig: '/conf-nuvemshop',
    rodar: async () => {
      const cfg: any = await prisma.configuracaoGeral.findFirst();
      if (!cfg?.nuvemshopAccessToken || !cfg?.nuvemshopStoreId) return { configurado: false };
      const loja: any = await nuvemReq('/store');
      const nome = loja?.name?.pt || loja?.name?.es || loja?.name || '';
      return { configurado: true, detalhe: nome ? `Loja ${txt(nome)}` : 'Conectado' };
    },
  },
  {
    chave: 'shopee', nome: 'Shopee', telaConfig: '/config-shopee',
    rodar: async () => {
      const cfg = await getShopeeConfig();
      if (!cfg.accessToken || !cfg.shopId) return { configurado: false };
      const info: any = await shopeeReq('/api/v2/shop/get_shop_info');
      return { configurado: true, detalhe: `Loja ${txt(info?.shop_name) || cfg.shopId}` };
    },
  },
  {
    chave: 'magalu', nome: 'Magalu', telaConfig: '/config-magalu',
    rodar: async () => {
      const cfg = await getMagaluConfig();
      if (!cfg.accessToken) return { configurado: false };
      await getMagaluSellerInfo();
      return { configurado: true, detalhe: 'Conectado' };
    },
  },
  {
    chave: 'olx', nome: 'OLX', telaConfig: '/config-olx',
    rodar: async () => {
      const cfg = await getOlxConfig();
      if (!cfg.accessToken) return { configurado: false };
      const r = await fetch('https://apps.olx.com.br/autoupload/v1/published?fetch_size=1', { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
      if (r.status === 401 || r.status === 403) throw new Error('A OLX recusou o token (vencido ou revogado). Reconecte em Conf. OLX: sem isso o chat, o status dos anuncios e as vendas deixam de chegar.');
      if (!r.ok) throw new Error(`OLX respondeu ${r.status}`);
      return { configurado: true, detalhe: 'Conectado', aviso: 'A OLX nao documenta renovacao do token: se ele vencer, e preciso reconectar.' };
    },
  },
  {
    chave: 'google_drive', nome: 'Google Drive', telaConfig: '/conf-gmail',
    rodar: async () => {
      const cfg: any = await prisma.configuracaoGeral.findFirst();
      if (!cfg?.googleDriveRefreshToken) return { configurado: false };
      await monitorGoogleDriveChecar();
      return { configurado: true, detalhe: 'Conectado' };
    },
  },
  {
    chave: 'meta_whatsapp', nome: 'Meta (WhatsApp)', telaConfig: '/conf-meta',
    rodar: async () => {
      const cfg = await getWhatsappConfig();
      if (!cfg.token || !cfg.phoneNumberId) return { configurado: false };
      const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(txt(j?.error?.message) || `Meta respondeu ${r.status}`);
      return { configurado: true, detalhe: txt(j?.display_phone_number) || txt(j?.verified_name) || 'Conectado' };
    },
  },
  {
    chave: 'resend_email', nome: 'E-mail (Resend)', telaConfig: '/configuracoes-gerais',
    rodar: async () => {
      const cfg: any = await getConfiguracaoGeral();
      if (!cfg.resendApiKey) return { configurado: false };
      const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${cfg.resendApiKey}` } });
      const j: any = await r.json().catch(() => ({}));
      const detalhe = `Remetente ${cfg.emailRemetente || DEFAULT_RESEND_FROM}`;
      // Chave restrita a "envio" nao lista dominios (401 restricted_api_key) mas continua valida para enviar.
      if (r.status === 401 && /restricted/i.test(`${j?.name} ${j?.message}`)) return { configurado: true, detalhe };
      if (!r.ok) throw new Error(txt(j?.message) || `Resend respondeu ${r.status}`);
      return { configurado: true, detalhe };
    },
  },
];

export async function verificarConexoes(chaves?: string[]): Promise<ResultadoConexao[]> {
  const lista = chaves ? CHECAGENS.filter((c) => chaves.includes(c.chave)) : CHECAGENS;
  return Promise.all(lista.map(async (c): Promise<ResultadoConexao> => {
    const base = { chave: c.chave, nome: c.nome, telaConfig: c.telaConfig, verificadoEm: new Date().toISOString() };
    try {
      const r = await comTimeout(c.rodar());
      if (!r.configurado) return { ...base, status: 'nao_configurado', detalhe: 'Não configurado' };
      return { ...base, status: 'ok', detalhe: r.detalhe || 'Conectado', aviso: r.aviso };
    } catch (e: any) {
      return { ...base, status: 'erro', detalhe: msg(e) };
    }
  }));
}

// ---- estado persistido (tabela criada sob demanda: sem migration) ----
let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MonitorConexaoEstado" (
    "chave" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "mensagem" TEXT, "verificadoEm" TIMESTAMPTZ,
    "caiuEm" TIMESTAMPTZ, "notificadoEm" TIMESTAMPTZ)`);
  tabelaPronta = true;
}

export async function lerEstadoConexoes(): Promise<Record<string, { caiuEm: Date | null; notificadoEm: Date | null }>> {
  await garantirTabela();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "chave","caiuEm","notificadoEm" FROM "MonitorConexaoEstado"`);
  const out: Record<string, { caiuEm: Date | null; notificadoEm: Date | null }> = {};
  for (const r of rows) out[r.chave] = { caiuEm: r.caiuEm ? new Date(r.caiuEm) : null, notificadoEm: r.notificadoEm ? new Date(r.notificadoEm) : null };
  return out;
}

// Registra o resultado; devolve as conexoes que precisam de aviso por e-mail agora
// (acabou de cair, ou segue caida ha 24h+ desde o ultimo aviso).
export async function registrarResultados(resultados: ResultadoConexao[]) {
  await garantirTabela();
  const estado = await lerEstadoConexoes();
  const reavisoMs = (await lerConfigMonitor()).reavisoHoras * 60 * 60 * 1000;
  const avisar: ResultadoConexao[] = [];
  for (const r of resultados) {
    const ant = estado[r.chave];
    if (r.status === 'erro') {
      const caiuEm = ant?.caiuEm || new Date();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MonitorConexaoEstado" ("chave","status","mensagem","verificadoEm","caiuEm") VALUES ($1,'erro',$2,now(),$3)
         ON CONFLICT ("chave") DO UPDATE SET "status"='erro',"mensagem"=$2,"verificadoEm"=now(),"caiuEm"=COALESCE("MonitorConexaoEstado"."caiuEm",$3)`,
        r.chave, r.detalhe, caiuEm,
      );
      if (!ant?.notificadoEm || Date.now() - ant.notificadoEm.getTime() > reavisoMs) avisar.push(r);
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MonitorConexaoEstado" ("chave","status","mensagem","verificadoEm","caiuEm","notificadoEm") VALUES ($1,$2,$3,now(),NULL,NULL)
         ON CONFLICT ("chave") DO UPDATE SET "status"=$2,"mensagem"=$3,"verificadoEm"=now(),"caiuEm"=NULL,"notificadoEm"=NULL`,
        r.chave, r.status, r.detalhe,
      );
    }
  }
  return avisar;
}

function esc(v: string) {
  return v.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

async function enviarAviso(caidas: ResultadoConexao[]) {
  const geral: any = await getConfiguracaoGeral();
  const to = txt(geral.auditoriaEmailDestinatario);
  if (!geral.resendApiKey || !to) {
    console.log('[monitor-conexoes] ha conexao caida mas o e-mail nao esta configurado (Resend/destinatario)');
    return false;
  }
  const linhas = caidas.map((c) => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;">${esc(c.nome)}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#b91c1c;">${esc(c.detalhe)}${c.tentativas && c.tentativas > 1 ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">Falhou ${c.tentativas} tentativas seguidas</div>` : ''}</td></tr>`).join('');
  const html = renderAlertEmailLayout({
    eyebrow: 'ALERTA ANB Parts',
    title: caidas.length > 1 ? 'Conexões com problema' : 'Conexão com problema',
    subtitle: 'Reconecte em Configurações → Monitor de Conexões.',
    contentHtml: renderEmailPanel(`<table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${linhas}</tbody></table>`, { accentColor: '#dc2626' }),
  });
  const text = ['Conexões com problema:', '', ...caidas.map((c) => `- ${c.nome}: ${c.detalhe}${c.tentativas && c.tentativas > 1 ? ` (falhou ${c.tentativas} tentativas seguidas)` : ''}`), '', 'Reconecte em Configurações → Monitor de Conexões.'].join('\n');
  await sendResendEmail({
    apiKey: geral.resendApiKey,
    from: geral.emailRemetente || DEFAULT_RESEND_FROM,
    to,
    subject: `ALERTA ANB Parts - Conexão caiu: ${caidas.map((c) => c.nome).join(', ')} - Verifique`,
    html,
    text,
  });
  return true;
}

// Rotina automatica: quem falha e' testado de novo (ate "tentativas" no total, com "intervaloSeg" entre elas).
// So continua como 'erro' (e gera e-mail) se falhar em todas; se alguma tentativa passar, conta como ok.
async function verificarComTentativas(): Promise<ResultadoConexao[]> {
  const cfg = await lerConfigMonitor();
  const final = new Map<string, ResultadoConexao>();
  let pendentes: string[] = [];
  for (const r of await verificarConexoes()) {
    final.set(r.chave, r);
    if (r.status === 'erro') pendentes.push(r.chave);
  }
  let tentativa = 1;
  for (const chave of pendentes) final.set(chave, { ...final.get(chave)!, tentativas: 1 });
  while (pendentes.length && tentativa < cfg.tentativas) {
    await new Promise((resolve) => setTimeout(resolve, cfg.intervaloSeg * 1000));
    tentativa += 1;
    const proximos: string[] = [];
    for (const r of await verificarConexoes(pendentes)) {
      if (r.status === 'erro') { final.set(r.chave, { ...r, tentativas: tentativa }); proximos.push(r.chave); }
      else final.set(r.chave, r);
    }
    pendentes = proximos;
  }
  return Array.from(final.values());
}

let rodando = false;
async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    const resultados = await verificarComTentativas();
    const avisar = await registrarResultados(resultados);
    if (avisar.length && await enviarAviso(avisar)) {
      for (const r of avisar) {
        await prisma.$executeRawUnsafe(`UPDATE "MonitorConexaoEstado" SET "notificadoEm" = now() WHERE "chave" = $1`, r.chave);
      }
      console.log(`[monitor-conexoes] e-mail enviado: ${avisar.map((a) => a.nome).join(', ')}`);
    }
  } finally {
    rodando = false;
  }
}

export function startMonitorConexoesScheduler() {
  const rodar = () => { void tick().catch((e) => { console.error('[monitor-conexoes] falha:', e); rodando = false; }); };
  setTimeout(rodar, 3 * 60 * 1000);
  setInterval(rodar, TICK_MS);
}
