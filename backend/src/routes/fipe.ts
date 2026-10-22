// Consulta da tabela FIPE (motos) pela API publica fipe.parallelum.com.br (mes de referencia atual).
// Usada no cadastro da moto: sugere marca e modelos parecidos com o texto do cadastro e deixa escolher o valor.
// Sem token a API e gratuita e so entrega o mes corrente (suficiente aqui: a moto e comprada no mes). Se existir FIPE_TOKEN no ambiente, ele e enviado.
import { Router } from 'express';

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
