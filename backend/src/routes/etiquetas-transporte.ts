// Etiqueta de transporte (PDF 100x150 mm para a impressora termica), gerada a partir dos pedidos selecionados no
// Relatorio de Separacao - PDF. Fase 1: Shopee (API da Shopee). Mercado Livre entra na fase 2 (mesmo formato 100x150).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { diagnosticoEtiquetaShopee, etiquetaShopee } from '../lib/etiqueta-transporte';

export const etiquetasTransporteRouter = Router();

const ehShopee = (canal: any) => /shopee|shoppe/i.test(String(canal || ''));

// POST /etiquetas-transporte/pedidos { pedidoIds: number[] }
// -> { ok, pdfBase64, total, ignorados:[{pedidoNum,motivo}], falhas:[{pedidoNum,orderSn,motivo}], avisos:[] }
etiquetasTransporteRouter.post('/pedidos', async (req, res, next) => {
  try {
    const ids: string[] = Array.isArray(req.body?.pedidoIds) ? req.body.pedidoIds.map((x: any) => String(Number(x) || '')).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: 'Selecione ao menos um pedido.' });

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; numero: string | null; numeroLoja: string | null; canal: string | null }>>(
      `SELECT "id"::text AS id, "numero", "numeroLoja", "canal" FROM "BlingPedido" WHERE "id" = ANY($1::bigint[])`, ids,
    );
    const porId = new Map(rows.map((r) => [String(r.id), r]));

    const ignorados: { pedidoNum: string; motivo: string }[] = [];
    const shopeePorSn = new Map<string, string>(); // order_sn -> numero do pedido no sistema
    for (const id of ids) {
      const r = porId.get(id);
      const num = r?.numero || id;
      if (!r) { ignorados.push({ pedidoNum: num, motivo: 'Pedido nao encontrado na base local (atualize a lista).' }); continue; }
      if (!ehShopee(r.canal)) { ignorados.push({ pedidoNum: num, motivo: `Canal ${r.canal || 'desconhecido'}: por enquanto so a etiqueta da Shopee esta disponivel.` }); continue; }
      const sn = String(r.numeroLoja || '').trim();
      if (!sn) { ignorados.push({ pedidoNum: num, motivo: 'Pedido sem o numero da loja (order_sn da Shopee).' }); continue; }
      shopeePorSn.set(sn, num);
    }
    if (!shopeePorSn.size) {
      return res.status(400).json({ ok: false, error: 'Nenhum dos pedidos selecionados e da Shopee (ou falta o numero da loja).', ignorados });
    }

    const r = await etiquetaShopee(Array.from(shopeePorSn.keys()));
    const falhas = r.falhas.map((f) => ({ pedidoNum: shopeePorSn.get(f.orderSn) || '', orderSn: f.orderSn, motivo: f.motivo }));
    if (!r.resultado) {
      return res.status(502).json({ ok: false, error: 'A Shopee nao gerou nenhuma etiqueta.', falhas, ignorados });
    }
    res.json({
      ok: true,
      pdfBase64: r.resultado.pdf.toString('base64'),
      total: shopeePorSn.size - falhas.length,
      formatoOrigem: r.resultado.formatoOrigem,
      tipoDocumento: r.resultado.tipoDocumento,
      ignorados, falhas, avisos: r.resultado.avisos,
    });
  } catch (e: any) {
    // erro da Shopee (token, permissao, status do pedido...) com mensagem legivel para a tela
    res.status(502).json({ ok: false, error: `Shopee: ${e?.message || e}` });
  }
});

// POST /etiquetas-transporte/shopee/diagnostico { orderSn } — o que a Shopee responde sobre os documentos desse pedido
etiquetasTransporteRouter.post('/shopee/diagnostico', async (req, res) => {
  try {
    const sn = String(req.body?.orderSn || '').trim();
    if (!sn) return res.status(400).json({ ok: false, error: 'Informe o orderSn.' });
    res.json({ ok: true, resposta: await diagnosticoEtiquetaShopee(sn) });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});
