// Preparo do SKU antes de criar anuncio em qualquer marketplace (aba Anuncio):
//  1) trava de fotos: so cria anuncio se a pasta do SKU ja esta na PASTA OFICIAL da moto (o Fotos
//     Anuncios/Fotos Drive ja rodou);
//  2) ativar o produto no Bling: no pre-cadastro ele nasce INATIVO (situacao 'I') e precisa ficar
//     ATIVO ('A') pro anuncio/estoque funcionarem;
//  3) ler/ajustar titulo, texto e condicao (usado/novo) no Bling + no cadastro, pra corrigir falha
//     de cadastro sem voltar ao pre-cadastro.
import { blingReq, findBlingProductsByCodes } from '../routes/bling';
import type { AnuncioBase } from './anuncioBase';

export const MSG_FOTOS_NAO_PROCESSADAS =
  'Fotos Anúncios ainda não foi processado para este SKU: a pasta do SKU não está na pasta oficial da moto. Rode o Fotos Anúncios antes de criar anúncios.';

export function exigirFotosOficiais(base: Pick<AnuncioBase, 'fotosOficiais'>) {
  if (!base.fotosOficiais) throw new Error(MSG_FOTOS_NAO_PROCESSADAS);
}

// Pneu USADO nao pode ser anunciado nos marketplaces (a Shopee ja removeu um; Magalu/ML/Nuvemshop seguem a mesma politica e a
// venda de pneu usado e' vedada). Identificado pela descricao ("pneu") e pela condicao (usado = padrao do cadastro).
export const MSG_PNEU_USADO = 'Pneu usado: venda proibida nos marketplaces (politica de produtos). Anúncio bloqueado.';
export function ehPneuUsado(base: { descricao?: string | null; condicao?: string | null }) {
  const desc = String(base.descricao || '');
  if (!/\bpneus?\b/i.test(desc)) return false;
  if (String(base.condicao || '').toLowerCase() === 'novo') return false;
  return true;
}
export function exigirNaoPneuUsado(base: { descricao?: string | null; condicao?: string | null }) {
  if (ehPneuUsado(base)) throw new Error(MSG_PNEU_USADO);
}

const BLING_CONDICAO_NOVO = 1;
const BLING_CONDICAO_USADO = 2;

// Campos que o Bling rejeita no PUT (somente leitura) — mesma lista do sync-bling-detran.
const BLING_READONLY_FIELDS = [
  'id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'imagens',
  'depositos', 'variacoes', 'estrutura', 'categorias', 'anexos',
];

export function htmlParaTexto(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function skuBase(base: Pick<AnuncioBase, 'idPeca'>) {
  return String(base.idPeca || '').toUpperCase().replace(/-\d+$/, '');
}

export async function resolverBlingProdutoId(base: Pick<AnuncioBase, 'idPeca' | 'blingProdutoId'>): Promise<string> {
  if (base.blingProdutoId) return String(base.blingProdutoId);
  const sku = skuBase(base);
  const achados = await findBlingProductsByCodes([sku], { forceRefresh: true });
  const p = achados.get(sku);
  if (!p?.id) throw new Error('Produto nao encontrado no Bling (SKU sem produto vinculado).');
  return String(p.id);
}

function payloadDoProdutoAtual(b: any) {
  const payload: any = { ...b };
  for (const f of BLING_READONLY_FIELDS) delete payload[f];
  payload.unidade = 'UN';
  payload.tipoProducao = 'T';
  return payload;
}

// Garante o produto ATIVO no Bling. Idempotente: se ja esta ativo, nao mexe em nada.
export async function garantirProdutoAtivoNoBling(base: Pick<AnuncioBase, 'idPeca' | 'blingProdutoId'>) {
  const id = await resolverBlingProdutoId(base);
  const atual = await blingReq(`/produtos/${id}`) as any;
  const b = atual?.data;
  if (!b) throw new Error('Produto nao encontrado no Bling.');
  const situacao = String(b.situacao || '').trim().toUpperCase();
  if (situacao === 'A') return { id, ativado: false };
  if (situacao === 'E') throw new Error('O produto esta EXCLUIDO no Bling — restaure antes de criar anuncios.');

  try {
    await blingReq(`/produtos/${id}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao: 'A' }) });
  } catch {
    // Fallback: PUT completo com situacao 'A' (mesmo padrao usado pra excluir produto).
    const payload = payloadDoProdutoAtual(b);
    payload.situacao = 'A';
    await blingReq(`/produtos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  return { id, ativado: true };
}

export type DadosBlingSku = {
  blingProdutoId: string;
  situacao: string;
  titulo: string;
  descricao: string; // texto (sem HTML)
  condicao: 'usado' | 'novo';
};

export async function lerDadosBlingSku(base: Pick<AnuncioBase, 'idPeca' | 'blingProdutoId'>): Promise<DadosBlingSku> {
  const id = await resolverBlingProdutoId(base);
  const r = await blingReq(`/produtos/${id}`) as any;
  const b = r?.data;
  if (!b) throw new Error('Produto nao encontrado no Bling.');
  return {
    blingProdutoId: id,
    situacao: String(b.situacao || '').toUpperCase(),
    titulo: String(b.nome || ''),
    descricao: htmlParaTexto(b.descricaoCurta || ''),
    condicao: Number(b.condicao) === BLING_CONDICAO_NOVO ? 'novo' : 'usado',
  };
}

export type AjusteSku = { titulo?: string; descricao?: string; condicao?: 'usado' | 'novo' };

// Aplica titulo/descricao/condicao no produto do Bling (GET completo -> altera so isso -> PUT).
export async function ajustarProdutoNoBling(base: Pick<AnuncioBase, 'idPeca' | 'blingProdutoId'>, ajuste: AjusteSku) {
  const id = await resolverBlingProdutoId(base);
  const r = await blingReq(`/produtos/${id}`) as any;
  const b = r?.data;
  if (!b) throw new Error('Produto nao encontrado no Bling.');
  const payload = payloadDoProdutoAtual(b);
  if (ajuste.titulo !== undefined) payload.nome = ajuste.titulo;
  if (ajuste.descricao !== undefined) payload.descricaoCurta = ajuste.descricao.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>');
  if (ajuste.condicao !== undefined) payload.condicao = ajuste.condicao === 'novo' ? BLING_CONDICAO_NOVO : BLING_CONDICAO_USADO;
  await blingReq(`/produtos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  return { id };
}
