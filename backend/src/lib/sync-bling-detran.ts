/**
 * Função compartilhada para sincronizar a etiqueta Detran de uma peça no Bling.
 * Usada tanto pelo estoque quanto pela cartela de etiquetas da moto.
 * Concatena as etiquetas de todas as variações do SKU base.
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

export async function syncDetranEtiquetaBling(idPeca: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseSku = String(idPeca).toUpperCase().replace(/-\d+$/, '');

    // Busca blingProdutoId no cadastro
    let blingProdutoId: string | null = null;
    const cadastro = await prisma.cadastroPeca.findFirst({
      where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
      select: { blingProdutoId: true },
    });
    if (cadastro?.blingProdutoId) {
      blingProdutoId = cadastro.blingProdutoId;
    } else {
      // Tenta buscar direto no Bling pelo código
      try {
        const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
        const blingItems = blingSearch?.data || [];
        const found = blingItems.find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
        if (found) blingProdutoId = String(found.id);
      } catch {}
    }

    if (!blingProdutoId) {
      return { ok: false, error: `Produto não encontrado no Bling para SKU: ${baseSku}` };
    }

    // Busca produto atual no Bling para preservar todos os campos
    const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
    const b = blingAtual?.data;
    if (!b) return { ok: false, error: 'Produto não encontrado no Bling' };

    // Concatena etiquetas de todas as variações
    const etiquetasConcat = await buildDetranEtiquetaConcatForBaseSku(baseSku);

    // Monta campos customizados preservando os existentes
    const ccExistentes: any[] = Array.isArray(b.camposCustomizados) ? b.camposCustomizados : [];
    const ccMap = new Map(ccExistentes.map((c: any) => [Number(c.idCampoCustomizado), c.valor]));
    ccMap.set(5979929, etiquetasConcat); // campo Detran no Bling

    const payload: any = {
      nome: b.nome,
      codigo: b.codigo,
      tipo: b.tipo || 'P',
      formato: b.formato || 'S',
      situacao: b.situacao || 'A',
      preco: Number(b.preco || 0),
      condicao: b.condicao ?? 0,
      marca: b.marca || '',
      pesoLiquido: Number(b.pesoLiquido || 0),
      pesoBruto: Number(b.pesoBruto || 0),
      volumes: b.volumes || 1,
      descricaoCurta: b.descricaoCurta || '',
      dimensoes: {
        largura: Number(b.dimensoes?.largura || 0),
        altura: Number(b.dimensoes?.altura || 0),
        profundidade: Number(b.dimensoes?.profundidade || 0),
        unidadeMedida: b.dimensoes?.unidadeMedida || 2,
      },
      estoque: {
        minimo: Number(b.estoque?.minimo || 0),
        maximo: Number(b.estoque?.maximo || 0),
        localizacao: String(b.estoque?.localizacao || ''),
      },
      camposCustomizados: Array.from(ccMap.entries()).map(([id, valor]) => ({ idCampoCustomizado: id, valor })),
    };

    await blingReq(`/produtos/${blingProdutoId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}
