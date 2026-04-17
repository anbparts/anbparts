import { Router } from 'express';
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';

export const etiquetasRouter = Router();

// mm → pontos PDF (72pt = 1 polegada = 25.4mm)
const MM = (mm: number) => mm * (72 / 25.4);

const LABEL_W_MM = 50;
const LABEL_H_MM = 30;
const LABEL_W = MM(LABEL_W_MM);
const LABEL_H = MM(LABEL_H_MM);

async function gerarBarcodePng(value: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: 4,          // alta resolução — sem tremor
    height: 28,        // altura das barras em "unidades de escala"
    includetext: false,
    backgroundcolor: 'ffffff',
    barcolor: '000000',
    paddingleft: 0,
    paddingright: 0,
    paddingtop: 0,
    paddingbottom: 0,
  });
}

function fitFontSize(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  maxWidthPt: number,
  initialPt: number,
  minPt = 6,
): number {
  let size = initialPt;
  while (size > minPt) {
    doc.fontSize(size);
    if (doc.widthOfString(text) <= maxWidthPt) break;
    size -= 0.5;
  }
  return size;
}

// POST /etiquetas/caixa
// body: { items: [{ caixa: string }] }
etiquetasRouter.post('/caixa', async (req, res, next) => {
  try {
    const items: { caixa: string }[] = (req.body?.items || [])
      .map((i: any) => ({ caixa: String(i.caixa || '').trim() }))
      .filter((i: any) => i.caixa);

    if (!items.length) {
      return res.status(400).json({ error: 'Nenhuma caixa informada.' });
    }

    const doc = new PDFDocument({
      size: [LABEL_W, LABEL_H],
      layout: 'landscape',
      margin: 0,
      autoFirstPage: true,
      compress: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiquetas-caixa.pdf"');
    doc.pipe(res);

    const MARGIN_LEFT  = MM(3.5);
    const BARCODE_W    = MM(43.0);
    const BARCODE_H    = MM(17.5);
    const BARCODE_Y    = MM(2.0);
    const TEXT_Y       = MM(24.4);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage({ size: [LABEL_W, LABEL_H], layout: 'landscape', margin: 0 });
      }

      const label = items[i].caixa.toUpperCase();
      const barcodePng = await gerarBarcodePng(items[i].caixa);

      // Barcode
      doc.image(barcodePng, MARGIN_LEFT, BARCODE_Y, { width: BARCODE_W, height: BARCODE_H });

      // Texto centralizado
      const fontSize = fitFontSize(doc, label, BARCODE_W, 11.5 * (72 / 25.4 / 2.5), 7 * (72 / 25.4 / 2.5));
      doc.font('Helvetica-Bold').fontSize(fontSize);
      doc.text(label, MARGIN_LEFT, TEXT_Y, {
        width: BARCODE_W,
        align: 'center',
        lineBreak: false,
      });
    }

    doc.end();
  } catch (e) { next(e); }
});

// POST /etiquetas/sku
// body: { items: [{ motoLabel, sku, descricao }] }
etiquetasRouter.post('/sku', async (req, res, next) => {
  try {
    const items: { motoLabel: string; sku: string; descricao: string }[] = (req.body?.items || [])
      .map((i: any) => ({
        motoLabel: String(i.motoLabel || '').trim().toUpperCase(),
        sku:       String(i.sku || '').trim().toUpperCase(),
        descricao: String(i.descricao || '').trim(),
      }))
      .filter((i: any) => i.sku);

    if (!items.length) {
      return res.status(400).json({ error: 'Nenhum SKU informado.' });
    }

    const doc = new PDFDocument({
      size: [LABEL_W, LABEL_H],
      layout: 'landscape',
      margin: 0,
      autoFirstPage: true,
      compress: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiquetas-sku.pdf"');
    doc.pipe(res);

    const ML      = MM(3.5);   // margin left
    const LABEL_X = MM(15.0);  // x dos valores (moto, cod)
    const BAR_W   = MM(43.0);
    const BAR_H   = MM(7.0);
    const BAR_Y   = MM(19.5);

    // tamanhos de fonte em pt
    const PT = (mm: number) => mm * (72 / 25.4);
    const MOTO_LABEL_PT  = PT(2.2);
    const MOTO_VALUE_PT  = PT(2.5);
    const COD_LABEL_PT   = PT(2.0);
    const COD_VALUE_PT   = PT(3.2);
    const DESC_PT        = PT(2.7);
    const MOTO_Y         = MM(4.3);
    const COD_Y          = MM(8.7);
    const DESC_Y         = MM(13.7);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage({ size: [LABEL_W, LABEL_H], layout: 'landscape', margin: 0 });
      }

      const item = items[i];
      const barcodePng = await gerarBarcodePng(item.sku);

      // Moto:
      doc.font('Helvetica-Bold').fontSize(MOTO_LABEL_PT);
      doc.text('Moto:', ML, MOTO_Y, { lineBreak: false });

      const motoFontSize = fitFontSize(doc, item.motoLabel, BAR_W - MM(11.5), MOTO_VALUE_PT, PT(1.6));
      doc.font('Helvetica-Bold').fontSize(motoFontSize);
      doc.text(item.motoLabel || '-', LABEL_X, MOTO_Y, { lineBreak: false });

      // Cód:
      doc.font('Helvetica-Bold').fontSize(COD_LABEL_PT);
      doc.text('Cod:', ML, COD_Y, { lineBreak: false });

      const skuFontSize = fitFontSize(doc, item.sku, BAR_W - MM(11.5), COD_VALUE_PT, PT(2.0));
      doc.font('Helvetica-Bold').fontSize(skuFontSize);
      doc.text(item.sku, LABEL_X, COD_Y, { lineBreak: false });

      // Descrição (max 2 linhas)
      doc.font('Helvetica-Bold').fontSize(DESC_PT);
      doc.text(item.descricao || '-', ML, DESC_Y, {
        width: BAR_W,
        height: MM(5.0),
        ellipsis: true,
        lineBreak: true,
      });

      // Barcode
      doc.image(barcodePng, ML, BAR_Y, { width: BAR_W, height: BAR_H });
    }

    doc.end();
  } catch (e) { next(e); }
});
