import { prisma } from './prisma';

type FinancialUpdate = {
  precoML?: number;
  valorFrete?: number;
  valorTaxas?: number;
  valorLiq?: number;
};

type CancelamentoOptions = {
  observacoes?: string;
  resolveFinancials?: (peca: any) => FinancialUpdate;
};

function normalizeIds(ids: number[]) {
  return Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
}

function buildMotoNome(moto: any) {
  return [moto?.marca, moto?.modelo, moto?.ano].filter(Boolean).join(' ').trim();
}

function hasDetranParaRepor(peca: any) {
  return Boolean(
    String(peca?.detranEtiqueta || '').trim()
      || peca?.detranBaixada
      || peca?.detranBaixadaAt
  );
}

function hasVendaParaCancelar(peca: any) {
  return Boolean(
    !peca?.disponivel
      || peca?.dataVenda
      || peca?.blingPedidoId
      || peca?.blingPedidoNum
      || peca?.detranBaixada
      || peca?.detranBaixadaAt
  );
}

async function historicoDevolucaoJaExiste(tx: any, peca: any) {
  const where: any = {
    pecaId: peca.id,
    etiquetasDetran: peca.detranEtiqueta || null,
  };

  if (peca.blingPedidoId || peca.blingPedidoNum) {
    where.OR = [
      ...(peca.blingPedidoId ? [{ pedidoBlingId: peca.blingPedidoId }] : []),
      ...(peca.blingPedidoNum ? [{ pedidoBlingNum: peca.blingPedidoNum }] : []),
    ];
  } else if (peca.dataVenda) {
    where.dataVenda = peca.dataVenda;
  }

  const existente = await tx.historicoDevolucao.findFirst({
    where,
    select: { id: true },
  });

  return Boolean(existente);
}

export async function cancelarVendaComDevolucaoEtiqueta(ids: number[], options: CancelamentoOptions = {}) {
  const safeIds = normalizeIds(ids);
  if (!safeIds.length) {
    return { ok: true, ids: [], pecas: [], devolucoesCriadas: 0, etiquetasPendentes: 0 };
  }

  return prisma.$transaction(async (tx: any) => {
    const pecas = await tx.peca.findMany({
      where: { id: { in: safeIds } },
      include: {
        moto: { select: { id: true, marca: true, modelo: true, ano: true } },
      },
    });

    const updated: any[] = [];
    let devolucoesCriadas = 0;
    let etiquetasPendentes = 0;

    for (const peca of pecas) {
      const precisaReporEtiqueta = hasDetranParaRepor(peca);
      const vendaCancelavel = hasVendaParaCancelar(peca);
      const deveReporEtiqueta = vendaCancelavel && precisaReporEtiqueta;

      if (deveReporEtiqueta && !(await historicoDevolucaoJaExiste(tx, peca))) {
        await tx.historicoDevolucao.create({
          data: {
            pecaId: peca.id,
            idPeca: peca.idPeca,
            descricao: peca.descricao,
            motoId: peca.motoId,
            motoNome: buildMotoNome(peca.moto),
            pedidoBlingId: peca.blingPedidoId || null,
            pedidoBlingNum: peca.blingPedidoNum || null,
            valorLiq: peca.valorLiq,
            valorFrete: peca.valorFrete,
            valorTaxas: peca.valorTaxas,
            precoML: peca.precoML,
            dataVenda: peca.dataVenda || null,
            dataDevolucao: new Date(),
            etiquetasDetran: peca.detranEtiqueta || null,
            etiquetaBaixada: peca.detranBaixada || false,
            nfVendaNumero: null,
            nfDevolucaoNumero: null,
            observacoes: options.observacoes || 'Cancelamento de venda registrado no sistema.',
          },
        });
        devolucoesCriadas += 1;
      }

      const financials = options.resolveFinancials ? options.resolveFinancials(peca) : {};
      const updateData: any = {
        disponivel: true,
        emPrejuizo: false,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        ...financials,
      };

      if (deveReporEtiqueta) {
        updateData.detranEtiqueta = null;
        updateData.detranStatus = null;
        updateData.detranBaixada = false;
        updateData.detranBaixadaAt = null;
        updateData.etiquetaPendente = true;
        etiquetasPendentes += 1;
      }

      updated.push(await tx.peca.update({
        where: { id: peca.id },
        data: updateData,
      }));
    }

    return {
      ok: true,
      ids: safeIds,
      pecas: updated,
      devolucoesCriadas,
      etiquetasPendentes,
    };
  });
}
