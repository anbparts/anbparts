// Etiqueta de transporte (PDF 100x150 mm para a impressora termica), gerada a partir dos pedidos selecionados no
// Relatorio de Separacao - PDF. Shopee (API da Shopee, ZPL -> PDF) e Mercado Livre (/shipment_labels, PDF do proprio ML).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { diagnosticoEtiquetaShopee, etiquetaMercadoLivre, etiquetaShopee } from '../lib/etiqueta-transporte';

export const etiquetasTransporteRouter = Router();

// "Numero loja virtual" do pedido no Bling = order_sn da Shopee. Se a base local nao tem, le o detalhe do pedido (local, depois Bling).
async function numeroLojaDoPedido(id: string, gravado: string | null): Promise<string> {
  const direto = String(gravado || '').trim();
  if (direto) return direto;
  try {
    const lib: any = await import('../lib/bling-pedidos');
    const d = await lib.lerDetalheLocal(id);
    const v = String(d?.numeroLoja || d?.numeroPedidoLoja || '').trim();
    if (v) return v;
  } catch { /* segue para o Bling */ }
  try {
    const bling: any = await import('./bling');
    const r = await bling.blingReq(`/pedidos/vendas/${id}`);
    return String(r?.data?.numeroLoja || r?.data?.numeroPedidoLoja || '').trim();
  } catch { return ''; }
}

const ehShopee = (canal: any) => /shopee|shoppe/i.test(String(canal || ''));
const ehML = (canal: any) => /mercado\s*livre|mercadolivre|meli/i.test(String(canal || ''));

// POST /etiquetas-transporte/pedidos { pedidoIds: number[] }
// Cada pedido e' resolvido pelo seu marketplace (Shopee / Mercado Livre); sai 1 PDF por marketplace.
// -> { ok, arquivos:[{canal,pdfBase64,total}], pdfBase64 (1o arquivo), total, ignorados:[{pedidoNum,motivo}], falhas:[{pedidoNum,orderSn,motivo}], avisos:[] }
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
    const mlPorRef = new Map<string, string>();    // id do pedido no ML -> numero do pedido no sistema
    for (const id of ids) {
      const r = porId.get(id);
      const num = r?.numero || id;
      if (!r) { ignorados.push({ pedidoNum: num, motivo: 'Pedido nao encontrado na base local (atualize a lista).' }); continue; }
      const shopee = ehShopee(r.canal);
      const ml = ehML(r.canal);
      if (!shopee && !ml) { ignorados.push({ pedidoNum: num, motivo: `Canal ${r.canal || 'desconhecido'}: etiqueta disponivel so para Shopee e Mercado Livre.` }); continue; }
      const sn = await numeroLojaDoPedido(id, r.numeroLoja);
      if (!sn) { ignorados.push({ pedidoNum: num, motivo: 'Pedido sem o numero da loja (id do pedido no marketplace).' }); continue; }
      (shopee ? shopeePorSn : mlPorRef).set(sn, num);
    }
    if (!shopeePorSn.size && !mlPorRef.size) {
      return res.status(400).json({ ok: false, error: 'Nenhum dos pedidos selecionados e da Shopee ou do Mercado Livre (ou falta o numero da loja).', ignorados });
    }

    const arquivos: { canal: string; pdfBase64: string; total: number }[] = [];
    const falhas: { pedidoNum: string; orderSn: string; motivo: string }[] = [];
    const avisos: string[] = [];
    const erros: string[] = [];

    if (shopeePorSn.size) {
      try {
        const r = await etiquetaShopee(Array.from(shopeePorSn.keys()));
        const f = r.falhas.map((x) => ({ pedidoNum: shopeePorSn.get(x.orderSn) || '', orderSn: x.orderSn, motivo: `Shopee: ${x.motivo}` }));
        falhas.push(...f);
        if (r.resultado) { arquivos.push({ canal: 'Shopee', pdfBase64: r.resultado.pdf.toString('base64'), total: shopeePorSn.size - f.length }); avisos.push(...r.resultado.avisos); }
      } catch (e: any) { erros.push(`Shopee: ${e?.message || e}`); }
    }
    if (mlPorRef.size) {
      try {
        const r = await etiquetaMercadoLivre(Array.from(mlPorRef.keys()));
        const f = r.falhas.map((x) => ({ pedidoNum: mlPorRef.get(x.orderSn) || '', orderSn: x.orderSn, motivo: `Mercado Livre: ${x.motivo}` }));
        falhas.push(...f);
        if (r.resultado) { arquivos.push({ canal: 'Mercado Livre', pdfBase64: r.resultado.pdf.toString('base64'), total: mlPorRef.size - f.length }); avisos.push(...r.resultado.avisos); }
      } catch (e: any) { erros.push(`Mercado Livre: ${e?.message || e}`); }
    }

    if (!arquivos.length) {
      return res.status(502).json({ ok: false, error: erros.join(' | ') || 'Nenhuma etiqueta foi gerada.', falhas, ignorados });
    }
    for (const e of erros) avisos.push(`Nao gerado - ${e}`);
    res.json({
      ok: true,
      arquivos,
      pdfBase64: arquivos[0].pdfBase64,
      total: arquivos.reduce((t, a) => t + a.total, 0),
      ignorados, falhas, avisos,
    });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /etiquetas-transporte/shopee/diagnostico { orderSn } — o que a Shopee responde sobre os documentos desse pedido
etiquetasTransporteRouter.post('/shopee/diagnostico', async (req, res) => {
  try {
    const sn = String(req.body?.orderSn || '').trim();
    if (!sn) return res.status(400).json({ ok: false, error: 'Informe o orderSn.' });
    res.json({ ok: true, ...(await diagnosticoEtiquetaShopee(sn)) });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});
