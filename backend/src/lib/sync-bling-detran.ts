/**
 * Sincroniza APENAS a etiqueta Detran no Bling.
 * Estratégia: GET produto completo → modifica SÓ camposCustomizados[Detran] → PUT de volta.
 * Nenhum outro campo é alterado.
 */
import { prisma } from './prisma';
import { blingReq } from '../routes/bling';

function getSkuVariantOrder(idPeca: string): number {
  const match = String(idPeca || '').match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function buildDetranEtiquetaConcatForBaseSku(baseSku: string): Promise<string> {
  if (!baseSku) return '';
  const pecas = await prisma.peca.findMany({
    where: {
      OR: [
        { idPeca: { equals: baseSku, mode: 'insensitive' } },
        { idPeca: { startsWith: `${baseSku}-` } },
      ],
    },
    select: { idPeca: true, detranEtiqueta: true },
  });
  return pecas
    .sort((a, b) => {
      const d = getSkuVariantOrder(a.idPeca) - getSkuVariantOrder(b.idPeca);
      return d !== 0 ? d : String(a.idPeca).localeCompare(String(b.idPeca), 'pt-BR', { numeric: true, sensitivity: 'base' });
    })
    .map(p => (p.detranEtiqueta || '').trim())
    .filter(Boolean)
    .join(' / ');
}

// Campos que o Bling rejeita no PUT (somente leitura na API)
const BLING_READONLY_FIELDS = [
  'id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'imagens',
  'depositos', 'variacoes', 'estrutura', 'categorias', 'anexos',
];

export async function syncDetranEtiquetaBling(idPeca: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseSku = String(idPeca).toUpperCase().replace(/-\d+$/, '');

    // 1. Resolve o blingProdutoId
    let blingProdutoId: string | null = null;
    const cadastro = await prisma.cadastroPeca.findFirst({
      where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
      select: { blingProdutoId: true },
    });
    if (cadastro?.blingProdutoId) {
      blingProdutoId = cadastro.blingProdutoId;
    } else {
      try {
        const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
        const items = blingSearch?.data || [];
        const found = items.find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
        if (found) blingProdutoId = String(found.id);
      } catch {}
    }

    if (!blingProdutoId) {
      return { ok: false, error: `Produto não encontrado no Bling para SKU: ${baseSku}` };
    }

    // 2. GET produto COMPLETO do Bling — preserva tudo
    const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
    const b = blingAtual?.data;
    if (!b) return { ok: false, error: 'Produto não encontrado no Bling' };

    // 3. Calcula a nova etiqueta concatenada
    const etiquetasConcat = await buildDetranEtiquetaConcatForBaseSku(baseSku);

    // 4. Atualiza SOMENTE o campo customizado Detran (ID 5979929)
    const ccExistentes: any[] = Array.isArray(b.camposCustomizados) ? b.camposCustomizados : [];
    const ccMap = new Map(ccExistentes.map((c: any) => [Number(c.idCampoCustomizado), c.valor]));
    ccMap.set(5979929, etiquetasConcat);

    // 5. Copia o produto exatamente como está, remove só campos read-only do Bling
    const payload: any = { ...b };
    for (const field of BLING_READONLY_FIELDS) {
      delete payload[field];
    }

    // Campos SEMPRE fixos — independente do que estiver no Bling
    payload.unidade = 'UN';
    payload.tipoProducao = 'T';
    payload.tributacao = { ...(b.tributacao || {}), ncm: '87141000', cest: '01.076.00' };

    // 6. Substitui apenas camposCustomizados
    payload.camposCustomizados = Array.from(ccMap.entries()).map(([id, valor]) => ({ idCampoCustomizado: id, valor }));

    // 7. PUT no Bling
    await blingReq(`/produtos/${blingProdutoId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}
