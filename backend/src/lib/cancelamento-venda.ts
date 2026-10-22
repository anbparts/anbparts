import { prisma } from './prisma';
import { garantirTabelaRevisao, registrarRevisao } from './pecas-revisao';
import { registrarDevolucoes, registroDePeca, type NovoRegistroDevolucao } from './devolucao-historico';

type FinancialUpdate = {
  precoML?: number;
  valorFrete?: number;
  valorTaxas?: number;
  valorLiq?: number;
};

type CancelamentoOptions = {
  observacoes?: string;
  // Cancelamento importado do Bling: os valores da venda sao estornados, mas a peca NAO volta ao estoque; fica "Em Revisao" ate ser liberada em Pendencias > Devolucoes
  enviarParaRevisao?: boolean;
  resolveFinancials?: (peca: any) => FinancialUpdate;
};

function splitEtiquetas(value: string | null | undefined): string[] {
  return String(value || '').split('/').map(e => e.trim()).filter(Boolean);
}

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
  const where: any = { pecaId: peca.id };

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

  if (options.enviarParaRevisao) await garantirTabelaRevisao();

  const paraHistorico: NovoRegistroDevolucao[] = [];

  const resultado = await prisma.$transaction(async (tx: any) => {
    const pecas = await tx.peca.findMany({
      where: { id: { in: safeIds } },
      include: {
        moto: { select: { id: true, marca: true, modelo: true, ano: true, etiquetaSkuLabel: true } },
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
        const baseHistorico = {
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
          nfVendaNumero: null,
          nfDevolucaoNumero: null,
          observacoes: options.observacoes || 'Cancelamento de venda registrado no sistema.',
        };
        const etqs = splitEtiquetas(peca.detranEtiqueta);
        if (etqs.length > 0) {
          for (const etq of etqs) {
            await tx.historicoDevolucao.create({
              data: { ...baseHistorico, etiquetasDetran: etq, etiquetaBaixada: peca.detranBaixada || false },
            });
          }
        } else {
          await tx.historicoDevolucao.create({
            data: { ...baseHistorico, etiquetasDetran: null, etiquetaBaixada: false },
          });
        }
        devolucoesCriadas += 1;
      }

      const financials = options.resolveFinancials ? options.resolveFinancials(peca) : {};
      const irParaRevisao = !!options.enviarParaRevisao && vendaCancelavel;
      // historico unico de cancelamentos/devolucoes (gravado depois da transacao, com os dados da venda de antes de zerar)
      if (vendaCancelavel) paraHistorico.push(registroDePeca(peca, irParaRevisao ? 'cancelamento_importado' : 'cancelamento_estoque', options.observacoes));
      if (irParaRevisao) {
        // guarda o que foi vendido/estornado antes de zerar os dados da venda
        await registrarRevisao(tx, {
          pecaId: peca.id, pedidoNum: peca.blingPedidoNum, pedidoId: peca.blingPedidoId, dataVenda: peca.dataVenda,
          precoML: peca.precoML, valorLiq: peca.valorLiq, valorFrete: peca.valorFrete, valorTaxas: peca.valorTaxas, motivo: options.observacoes || 'Cancelamento de venda',
        });
      }
      const updateData: any = {
        disponivel: !irParaRevisao,
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

  try { await registrarDevolucoes(paraHistorico); } catch (e) { console.error('[devolucoes] falha ao gravar historico:', (e as any)?.message || e); }
  return resultado;
}
