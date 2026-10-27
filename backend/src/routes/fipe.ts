// Consulta da tabela FIPE (motos) pela API publica fipe.parallelum.com.br (mes de referencia atual).
// Usada no cadastro da moto: sugere marca e modelos parecidos com o texto do cadastro e deixa escolher o valor.
// Sem token a API e gratuita e so entrega o mes corrente (suficiente aqui: a moto e comprada no mes). Se existir FIPE_TOKEN no ambiente, ele e enviado.
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const fipeRouter = Router();

const BASE = 'https://fipe.parallelum.com.br/api/v2/motorcycles';
const TTL_LISTA_MS = 6 * 60 * 60 * 1000;
const TTL_PRECO_MS = 60 * 60 * 1000;
const cache = new Map<string, { expira: number; dado: any }>();

async function fipeGet(caminho: string, ttl = TTL_LISTA_MS): Promise<any> {
  const hit = cache.get(caminho);
  if (hit && hit.expira > Date.now()) return hit.dado;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.FIPE_TOKEN) headers['X-Subscription-Token'] = String(process.env.FIPE_TOKEN);
  const resp = await fetch(`${BASE}${caminho}`, { headers, signal: AbortSignal.timeout(20000) });
  const corpo: any = await resp.json().catch(() => ({}));
  if (resp.status === 429) throw new Error('Limite de consultas da API FIPE atingido por hoje. Tente novamente mais tarde.');
  if (!resp.ok || corpo?.error) throw new Error(String(corpo?.error || `API FIPE respondeu ${resp.status}`).slice(0, 250));
  cache.set(caminho, { expira: Date.now() + ttl, dado: corpo });
  if (cache.size > 800) cache.delete(cache.keys().next().value as string);
  return corpo;
}

// ───────────── Aproximacao de texto ─────────────
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizar = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const compacto = (s: string) => normalizar(s).replace(/ /g, '');
const tokens = (s: string) => normalizar(s).split(' ').filter(Boolean);

function bigramas(s: string): string[] {
  const c = compacto(s);
  const r: string[] = [];
  for (let i = 0; i < c.length - 1; i += 1) r.push(c.slice(i, i + 2));
  return r;
}
function dice(a: string, b: string): number {
  const x = bigramas(a); const y = bigramas(b);
  if (!x.length || !y.length) return 0;
  const cont = new Map<string, number>();
  for (const g of x) cont.set(g, (cont.get(g) || 0) + 1);
  let inter = 0;
  for (const g of y) { const n = cont.get(g) || 0; if (n > 0) { inter += 1; cont.set(g, n - 1); } }
  return (2 * inter) / (x.length + y.length);
}

// 0..100: quanto o nome da FIPE parece com o texto do cadastro
export function pontuar(consulta: string, nome: string): number {
  const qc = compacto(consulta); const nc = compacto(nome);
  if (!qc || !nc) return 0;
  if (qc === nc) return 100;
  const tq = tokens(consulta); const tn = new Set(tokens(nome));
  const comum = tq.filter((t) => tn.has(t) || compacto(nome).includes(t)).length;
  const frac = tq.length ? comum / tq.length : 0;
  let s = frac * 60 + dice(consulta, nome) * 30;
  if (nc.includes(qc)) s += 10 + Math.max(0, 10 - Math.min(10, (nc.length - qc.length) / 3));
  return Math.min(99, Math.round(s));
}

const precoNumero = (txt: string) => Number(String(txt || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;

// ───────────── Tabela de marcas (preenchida 1x pela FIPE, sem perder o formato das marcas ja salvas no sistema) ─────────────
let marcasPronta = false;
let ultimaTentativaFipe = 0;

async function garantirMarcas(): Promise<void> {
  if (marcasPronta) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MarcaMoto" (
    "id" SERIAL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "chave" TEXT NOT NULL UNIQUE,
    "fipeId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'fipe',
    "criadoEm" TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  marcasPronta = true;
}

// Junta as marcas ja usadas nas motos (mantendo a grafia mais usada) e, se ainda nao veio da FIPE, completa com as marcas dela.
async function sincronizarMarcas(forcarFipe = false): Promise<{ fipe: number; sistema: number; fipeOk: boolean; erro?: string }> {
  await garantirMarcas();
  const existentes: Array<{ chave: string; nome: string; origem: string }> = await prisma.$queryRawUnsafe(`SELECT "chave","nome","origem" FROM "MarcaMoto"`);
  const porChave = new Map(existentes.map((e) => [e.chave, e]));
  let sistema = 0; let fipe = 0;

  // 1) marcas ja cadastradas nas motos: valem como estao escritas
  const motos = await prisma.moto.findMany({ select: { marca: true } });
  const cont = new Map<string, Map<string, number>>();
  for (const m of motos) {
    const nome = String(m.marca || '').trim();
    const k = compacto(nome);
    if (!k) continue;
    const g = cont.get(k) || new Map<string, number>();
    g.set(nome, (g.get(nome) || 0) + 1);
    cont.set(k, g);
  }
  for (const [k, g] of cont) {
    if (porChave.has(k)) continue;
    const nome = Array.from(g.entries()).sort((a, b) => b[1] - a[1])[0][0];
    await prisma.$executeRawUnsafe(`INSERT INTO "MarcaMoto" ("nome","chave","origem") VALUES ($1,$2,'sistema') ON CONFLICT ("chave") DO NOTHING`, nome, k);
    porChave.set(k, { chave: k, nome, origem: 'sistema' });
    sistema += 1;
  }

  // 2) marcas da FIPE (so uma vez; se a FIPE estiver fora do ar, tenta de novo depois)
  const jaTemFipe = Array.from(porChave.values()).some((e) => e.origem === 'fipe') || (await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "MarcaMoto" WHERE "fipeId" IS NOT NULL LIMIT 1`)).length > 0;
  if (!jaTemFipe || forcarFipe) {
    if (!forcarFipe && Date.now() - ultimaTentativaFipe < 10 * 60 * 1000) return { fipe, sistema, fipeOk: false, erro: 'Aguardando nova tentativa na FIPE' };
    ultimaTentativaFipe = Date.now();
    try {
      const marcas: Array<{ code: string; name: string }> = await fipeGet('/brands');
      for (const b of marcas) {
        const k = compacto(b.name);
        if (!k) continue;
        // ja existe a mesma marca (ex.: HARLEY DAVIDSON da FIPE x HARLEY-DAVIDSON do sistema), ou a do sistema e' o inicio do nome da FIPE (HARLEY x HARLEY-DAVIDSON)
        let alvo = porChave.get(k);
        if (!alvo) alvo = Array.from(porChave.values()).find((e) => e.origem === 'sistema' && e.chave.length >= 4 && k.startsWith(e.chave));
        if (alvo) {
          await prisma.$executeRawUnsafe(`UPDATE "MarcaMoto" SET "fipeId" = $1 WHERE "chave" = $2 AND "fipeId" IS NULL`, String(b.code), alvo.chave);
          continue;
        }
        await prisma.$executeRawUnsafe(`INSERT INTO "MarcaMoto" ("nome","chave","fipeId","origem") VALUES ($1,$2,$3,'fipe') ON CONFLICT ("chave") DO NOTHING`, b.name.trim(), k, String(b.code));
        porChave.set(k, { chave: k, nome: b.name, origem: 'fipe' });
        fipe += 1;
      }
      return { fipe, sistema, fipeOk: true };
    } catch (e: any) { return { fipe, sistema, fipeOk: false, erro: e?.message || 'Erro ao consultar a FIPE' }; }
  }
  return { fipe, sistema, fipeOk: true };
}

// GET /fipe/marcas-cadastradas?busca=har — marcas da tabela propria (digitou, filtra); sem busca devolve todas
fipeRouter.get('/marcas-cadastradas', async (req, res) => {
  try {
    const r = await sincronizarMarcas();
    const rows: Array<{ nome: string; origem: string }> = await prisma.$queryRawUnsafe(`SELECT "nome","origem" FROM "MarcaMoto" ORDER BY "nome"`);
    const busca = compacto(String(req.query.busca || ''));
    const lista = busca
      ? rows.filter((m) => compacto(m.nome).includes(busca)).sort((a, b) => Number(compacto(b.nome).startsWith(busca)) - Number(compacto(a.nome).startsWith(busca)) || a.nome.localeCompare(b.nome))
      : rows;
    res.json({ ok: true, marcas: lista.map((m) => m.nome), fipeOk: r.fipeOk });
  } catch (e: any) { res.status(500).json({ ok: false, error: e?.message || 'Erro ao listar marcas' }); }
});

// POST /fipe/marcas-cadastradas/sincronizar — forca nova leitura da FIPE (so acrescenta marcas que faltam)
fipeRouter.post('/marcas-cadastradas/sincronizar', async (_req, res) => {
  try {
    const r = await sincronizarMarcas(true);
    res.json({ ok: r.fipeOk, ...r });
  } catch (e: any) { res.status(500).json({ ok: false, error: e?.message || 'Erro ao sincronizar' }); }
});

// GET /fipe/marcas?busca=HARLEY DAVIDSON — todas as marcas, com a mais parecida primeiro e marcada como sugerida
fipeRouter.get('/marcas', async (req, res, next) => {
  try {
    const marcas: Array<{ code: string; name: string }> = await fipeGet('/brands');
    const busca = String(req.query.busca || '').trim();
    const lista = marcas.map((m) => ({ id: m.code, nome: m.name, pontos: busca ? pontuar(busca, m.name) : 0 }));
    lista.sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome));
    const melhor = busca && lista[0]?.pontos >= 55 ? lista[0].id : null;
    res.json({ ok: true, marcas: lista, sugerida: melhor });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message || 'Erro ao consultar a FIPE' }); void next; }
});

// GET /fipe/modelos?marca=67&busca=F800 — modelos da marca, mais parecidos primeiro (max 80)
fipeRouter.get('/modelos', async (req, res) => {
  try {
    const marca = String(req.query.marca || '').replace(/\D/g, '');
    if (!marca) return res.status(400).json({ ok: false, error: 'Informe a marca.' });
    const modelos: Array<{ code: string; name: string }> = await fipeGet(`/brands/${marca}/models`);
    const busca = String(req.query.busca || '').trim();
    const lista = modelos.map((m) => ({ id: m.code, nome: m.name, pontos: busca ? pontuar(busca, m.name) : 0 }));
    lista.sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome));
    res.json({ ok: true, total: lista.length, modelos: lista.slice(0, 80) });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message || 'Erro ao consultar a FIPE' }); }
});

// GET /fipe/anos?marca=67&modelo=4805 — anos disponiveis do modelo
fipeRouter.get('/anos', async (req, res) => {
  try {
    const marca = String(req.query.marca || '').replace(/\D/g, '');
    const modelo = String(req.query.modelo || '').replace(/\D/g, '');
    if (!marca || !modelo) return res.status(400).json({ ok: false, error: 'Informe marca e modelo.' });
    const anos: Array<{ code: string; name: string }> = await fipeGet(`/brands/${marca}/models/${modelo}/years`);
    res.json({ ok: true, anos: anos.map((a) => ({ id: a.code, nome: a.name })) });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message || 'Erro ao consultar a FIPE' }); }
});

// GET /fipe/preco?marca=67&modelo=4805&ano=2012-1 — preco do mes de referencia atual
fipeRouter.get('/preco', async (req, res) => {
  try {
    const marca = String(req.query.marca || '').replace(/\D/g, '');
    const modelo = String(req.query.modelo || '').replace(/\D/g, '');
    const ano = String(req.query.ano || '').replace(/[^0-9-]/g, '');
    if (!marca || !modelo || !ano) return res.status(400).json({ ok: false, error: 'Informe marca, modelo e ano.' });
    const d: any = await fipeGet(`/brands/${marca}/models/${modelo}/years/${ano}`, TTL_PRECO_MS);
    res.json({ ok: true, preco: precoNumero(d?.price), precoTexto: d?.price || '', marca: d?.brand || '', modelo: d?.model || '', anoModelo: d?.modelYear || null, combustivel: d?.fuel || '', codigoFipe: d?.codeFipe || '', referencia: d?.referenceMonth || '' });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message || 'Erro ao consultar a FIPE' }); }
});
