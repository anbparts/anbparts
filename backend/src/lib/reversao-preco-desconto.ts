import { prisma } from './prisma';
import { syncPrecoPlataformas } from '../routes/cadastro';

// ===== Reversao automatica de desconto ao cliente nao efetivado =====
// Ao dar desconto (motivo 'desconto_cliente' em HistoricoPrecoPeca), fica agendado um
// "reverterEm" (3 dias). Se a peca continuar disponivel (venda nao efetivada) quando esse
// prazo chegar, o preco volta sozinho pro valor anterior, o sistema loga a reversao e
// resincroniza Bling/Nuvemshop/ML com o preco restaurado (o anuncio usa o SKU base, entao
// so precisa 1 sync por SKU base mesmo tendo varias unidades/variacoes revertidas).
const REVERSAO_PRECO_DESCONTO_INTERVAL_MS = 5 * 60 * 1000;
const state = { running: false, started: false };

function getBaseSku(value: string) {
  return String(value || '').replace(/-\d+$/, '').trim().toUpperCase();
}

async function tickReversaoPrecoDesconto() {
  if (state.running) return;
  state.running = true;
  try {
    const pendentes = await prisma.$queryRaw<any[]>`
      SELECT * FROM "HistoricoPrecoPeca"
      WHERE "motivo" = 'desconto_cliente' AND "revertido" = false AND "reverterEm" <= now()
      ORDER BY "id" ASC
      LIMIT 200
    `;
    if (!pendentes.length) return;

    const basesParaSincronizar = new Set<string>();

    for (const registro of pendentes) {
      try {
        const peca = await prisma.peca.findUnique({
          where: { id: registro.pecaId },
          select: { id: true, idPeca: true, descricao: true, precoML: true, disponivel: true },
        });

        if (!peca || !peca.disponivel) {
          // Peca vendida (com o desconto) ou removida: nada a reverter, so fecha o registro.
          await prisma.$executeRaw`UPDATE "HistoricoPrecoPeca" SET "revertido" = true WHERE "id" = ${registro.id}`;
          continue;
        }

        const precoAtual = Number(peca.precoML);
        const precoOriginal = Number(registro.valorAnterior);

        await prisma.peca.update({ where: { id: peca.id }, data: { precoML: precoOriginal } });

        await prisma.$executeRaw`
          INSERT INTO "HistoricoPrecoPeca"
            ("pecaId", "sku", "descricao", "valorAnterior", "valorNovo", "motivo", "observacao", "reverterEm", "revertido")
          VALUES
            (${peca.id}, ${peca.idPeca}, ${peca.descricao}, ${precoAtual}, ${precoOriginal},
             'reversao_automatica', 'Ajuste automatico - venda nao efetivada em 3 dias', null, true)
        `;
        await prisma.$executeRaw`UPDATE "HistoricoPrecoPeca" SET "revertido" = true WHERE "id" = ${registro.id}`;

        basesParaSincronizar.add(getBaseSku(peca.idPeca));
      } catch (e) {
        console.error(`[reversao-preco-desconto] falha ao reverter historico id=${registro.id}:`, e);
      }
    }

    for (const baseSku of basesParaSincronizar) {
      try {
        const disponivel = await prisma.peca.findFirst({
          where: { OR: [{ idPeca: baseSku }, { idPeca: { startsWith: `${baseSku}-` } }], disponivel: true },
          select: { precoML: true },
        });
        if (disponivel) await syncPrecoPlataformas(baseSku, { precoML: Number(disponivel.precoML) });
      } catch (e) {
        console.error(`[reversao-preco-desconto] falha ao resincronizar plataformas do SKU ${baseSku}:`, e);
      }
    }

    console.log(`[reversao-preco-desconto] ${pendentes.length} registro(s) verificado(s), ${basesParaSincronizar.size} SKU(s) resincronizado(s).`);
  } catch (e) {
    console.error('[reversao-preco-desconto] falha geral:', e);
  } finally {
    state.running = false;
  }
}

export function startReversaoPrecoDescontoScheduler() {
  if (state.started) return;
  state.started = true;
  setInterval(() => { void tickReversaoPrecoDesconto(); }, REVERSAO_PRECO_DESCONTO_INTERVAL_MS);
}
