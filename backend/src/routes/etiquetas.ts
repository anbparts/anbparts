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

    const ML_CAIXA     = MM(3.0);
    const MR_CAIXA     = MM(10.0);  // aumenta margem esquerda física (direita no PDF)
    const QR_CAIXA     = MM(12.0);
    const QR_X_CAIXA   = LABEL_W - MR_CAIXA - QR_CAIXA;
    const TEXT_W_CAIXA = QR_X_CAIXA - ML_CAIXA - MM(1.5);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
      }

      const label = items[i].caixa.toUpperCase();

      // QR Code — canto direito
      const qrPng = await gerarQrPng(items[i].caixa);
      doc.image(qrPng, QR_X_CAIXA, MM(3.0), { width: QR_CAIXA, height: QR_CAIXA });

      // Nome da caixa — lado esquerdo
      const fontSize = fitFontSize(doc, label, TEXT_W_CAIXA, MM(7.5), MM(4.0));
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000000');
      doc.text(label, ML_CAIXA, MM(7.5), {
        width: TEXT_W_CAIXA,
        align: 'left',
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

    const ML       = MM(7.5);   // margem esquerda maior
    const MR       = MM(2.5);
    const QR_SIZE  = MM(13.5);
    const QR_X     = LABEL_W - MR - QR_SIZE;
    const TEXT_W   = QR_X - ML - MM(1.5);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
      }

      const item = items[i];

      // QR Code (lado direito)
      const qrPng = await gerarQrPng(item.sku);
      doc.image(qrPng, QR_X, MM(4.0), { width: QR_SIZE, height: QR_SIZE });

      // "Moto:" + valor colados (sem gap grande)
      doc.font('Helvetica').fontSize(MM(2.0));
      doc.text('Moto:', ML, MM(3.5), { lineBreak: false });
      const motoLabelW = doc.widthOfString('Moto:');

      const motoFontSize = fitFontSize(doc, item.motoLabel, TEXT_W - motoLabelW - MM(1.5), MM(2.2), MM(1.5));
      doc.font('Helvetica-Bold').fontSize(motoFontSize);
      doc.text(item.motoLabel || '-', ML + motoLabelW + MM(1.5), MM(3.5), { lineBreak: false });

      // SKU — destaque, fonte grande
      const skuFontSize = fitFontSize(doc, item.sku, TEXT_W, MM(7.0), MM(4.0));
      doc.font('Helvetica-Bold').fontSize(skuFontSize);
      doc.text(item.sku, ML, MM(9.0), { lineBreak: false });

      // Descrição — parte inferior (sem linha divisória)
      doc.font('Helvetica-Bold').fontSize(MM(2.4)).fillColor('#000000');
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
