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

async function gerarPng(options: Record<string, any>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    (bwipjs as any).toBuffer(options, (err: Error | null, png: Buffer) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

async function gerarBarcodePng(value: string): Promise<Buffer> {
  return gerarPng({
    bcid: 'code128',
    text: value,
    scale: 4,
    height: 28,
    includetext: false,
    backgroundcolor: 'ffffff',
    barcolor: '000000',
    paddingleft: 0,
    paddingright: 0,
    paddingtop: 0,
    paddingbottom: 0,
  });
}

async function gerarQrPng(value: string): Promise<Buffer> {
  return gerarPng({
    bcid: 'qrcode',
    text: value,
    scale: 6,
    eclevel: 'M',
    backgroundcolor: 'ffffff',
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
        doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
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
      margin: 0,
      autoFirstPage: true,
      compress: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiquetas-sku.pdf"');
    doc.pipe(res);

    const ML       = MM(3.5);
    const MR       = MM(2.5);
    const QR_SIZE  = MM(13.5);  // QR code menor
    const QR_X     = LABEL_W - MR - QR_SIZE;
    const QR_Y     = MM(2.5);
    const TEXT_W   = QR_X - ML - MM(1.5);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
      }

      const item = items[i];

      // QR Code (lado direito)
      const qrPng = await gerarQrPng(item.sku);
      doc.image(qrPng, QR_X, MM(4.0), { width: QR_SIZE, height: QR_SIZE });

      // "Moto:" + valor (linha do topo)
      doc.font('Helvetica').fontSize(MM(2.0));
      doc.text('Moto:', ML, MM(3.5), { lineBreak: false });

      const motoFontSize = fitFontSize(doc, item.motoLabel, TEXT_W - MM(9.5), MM(2.2), MM(1.5));
      doc.font('Helvetica-Bold').fontSize(motoFontSize);
      doc.text(item.motoLabel || '-', ML + MM(10.0), MM(3.5), { lineBreak: false });

      // SKU — destaque, fonte grande
      const skuFontSize = fitFontSize(doc, item.sku, TEXT_W, MM(7.0), MM(4.0));
      doc.font('Helvetica-Bold').fontSize(skuFontSize);
      doc.text(item.sku, ML, MM(9.0), { lineBreak: false });

      // Linha divisória sutil
      doc.moveTo(ML, MM(20.0)).lineTo(LABEL_W - MR, MM(20.0)).strokeColor('#cccccc').lineWidth(0.5).stroke();

      // Descrição — parte inferior
      doc.font('Helvetica-Bold').fontSize(MM(2.4)).strokeColor('#000000').fillColor('#000000');
      doc.text(item.descricao || '-', ML, MM(21.5), {
        width: LABEL_W - ML - MR,
        height: MM(7.0),
        ellipsis: true,
        lineBreak: true,
      });
    }

    doc.end();
  } catch (e) { next(e); }
});
