'use client';

export type CaixaEtiquetaPrintItem = {
  caixa: string;
};

export type SkuEtiquetaPrintItem = {
  motoLabel: string;
  sku: string;
  descricao: string;
};

const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 30;

function normalizeFilterText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatEtiquetaMotoLabel(peca: any) {
  const marca = String(peca?.moto?.marca || '').trim();
  const modelo = String(peca?.moto?.modelo || '').trim();
  const motoCompleta = [marca, modelo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const motoNormalizada = normalizeFilterText(motoCompleta);

  if (motoNormalizada.startsWith('harley davidson')) {
    const restante = motoCompleta.replace(/^\s*harley\s+davidson\b\s*/i, '').trim();
    return ['HD', restante].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'HD';
  }

  return motoCompleta.toUpperCase() || '-';
}

function buildTimestampFileToken() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}${mm}${yyyy}_${hh}${min}${ss}`;
}

async function loadBarcode() {
  const barcodeModule = await import('jsbarcode');
  return ((barcodeModule as any).default || barcodeModule) as any;
}

async function loadJsPdf() {
  const pdfModule = await import('jspdf');
  return ((pdfModule as any).jsPDF || (pdfModule as any).default || pdfModule) as any;
}

function ensureBrowserEnvironment() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Impressao disponivel apenas no navegador.');
  }
}

async function renderBarcodeDataUrl(value: string, options: { width: number; height: number }) {
  ensureBrowserEnvironment();

  const JsBarcode = await loadBarcode();
  const canvas = document.createElement('canvas');

  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: options.width,
    height: options.height,
    background: '#ffffff',
    lineColor: '#000000',
    flat: false,
    textMargin: 0,
    fontSize: 0,
  });

  return canvas.toDataURL('image/png');
}

function createPdfDocument(jsPDF: any) {
  return new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [LABEL_WIDTH_MM, LABEL_HEIGHT_MM],
    compress: true,
    putOnlyUsedFonts: true,
  });
}

function prepareLabelPage(doc: any, pageIndex: number) {
  if (pageIndex > 0) {
    doc.addPage([LABEL_WIDTH_MM, LABEL_HEIGHT_MM], 'landscape');
  }

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setTextColor(0, 0, 0);
}

function fitTextSize(doc: any, text: string, maxWidth: number, initialSize: number, minSize = 6) {
  let currentSize = initialSize;

  while (currentSize > minSize) {
    doc.setFontSize(currentSize);
    if (doc.getTextWidth(text) <= maxWidth) break;
    currentSize -= 0.2;
  }

  return currentSize;
}

function openPdfInBrowser(doc: any) {
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank', 'noopener');
}

export async function printCaixaLabels(items: CaixaEtiquetaPrintItem[]) {
  ensureBrowserEnvironment();

  const sanitizedItems = items
    .map((item) => ({ caixa: String(item.caixa || '').trim() }))
    .filter((item) => item.caixa);

  if (!sanitizedItems.length) {
    throw new Error('Nenhuma caixa valida foi informada para impressao.');
  }

  const [jsPDF, labels] = await Promise.all([
    loadJsPdf(),
    Promise.all(
      sanitizedItems.map(async (item) => ({
        ...item,
        barcodeDataUrl: await renderBarcodeDataUrl(item.caixa, { width: 8, height: 400 }),
      })),
    ),
  ]);

  const doc = createPdfDocument(jsPDF);

  const MARGIN_LEFT = 3.5;
  const BARCODE_WIDTH = 43.0;

  for (let index = 0; index < labels.length; index++) {
    const item = labels[index];
    prepareLabelPage(doc, index);
    doc.addImage(item.barcodeDataUrl, 'PNG', MARGIN_LEFT, 2.0, BARCODE_WIDTH, 17.5, undefined, 'NONE');
    doc.setFont('helvetica', 'bold');
    const fontSize = fitTextSize(doc, item.caixa.toUpperCase(), BARCODE_WIDTH, 11.2, 7.5);
    doc.setFontSize(fontSize);
    doc.text(item.caixa.toUpperCase(), MARGIN_LEFT + BARCODE_WIDTH / 2, 24.4, { align: 'center' });
  }

  openPdfInBrowser(doc);
}

export async function printSkuLabels(items: SkuEtiquetaPrintItem[]) {
  ensureBrowserEnvironment();

  const sanitizedItems = items
    .map((item) => ({
      motoLabel: String(item.motoLabel || '').trim(),
      sku: String(item.sku || '').trim().toUpperCase(),
      descricao: String(item.descricao || '').trim(),
    }))
    .filter((item) => item.sku);

  if (!sanitizedItems.length) {
    throw new Error('Nenhum SKU valido foi informado para impressao.');
  }

  const [jsPDF, labels] = await Promise.all([
    loadJsPdf(),
    Promise.all(
      sanitizedItems.map(async (item) => ({
        ...item,
        barcodeDataUrl: await renderBarcodeDataUrl(item.sku, { width: 8, height: 280 }),
      })),
    ),
  ]);

  const doc = createPdfDocument(jsPDF);

  const SKU_MARGIN_LEFT = 3.5;
  const SKU_LABEL_X = 15.0;
  const SKU_BARCODE_WIDTH = 43.0;

  for (let index = 0; index < labels.length; index++) {
    const item = labels[index];
    prepareLabelPage(doc, index);

    doc.setFont('helvetica', 'bold');

    doc.setFontSize(6.3);
    doc.text('Moto:', SKU_MARGIN_LEFT, 4.3);
    const motoFontSize = fitTextSize(doc, item.motoLabel.toUpperCase(), 34, 8.8, 6.4);
    doc.setFontSize(motoFontSize);
    doc.text(item.motoLabel.toUpperCase() || '-', SKU_LABEL_X, 4.3);

    doc.setFontSize(7.2);
    doc.text('Cod:', SKU_MARGIN_LEFT, 8.7);
    const skuFontSize = fitTextSize(doc, item.sku, 34, 11.2, 7.8);
    doc.setFontSize(skuFontSize);
    doc.text(item.sku, SKU_LABEL_X, 8.7);

    doc.setFontSize(9.8);
    const descricaoLinhas = doc.splitTextToSize(item.descricao || '-', SKU_BARCODE_WIDTH);
    const descricaoLimitada = descricaoLinhas.slice(0, 2);
    doc.text(descricaoLimitada, SKU_MARGIN_LEFT, 13.7, { maxWidth: SKU_BARCODE_WIDTH });

    doc.addImage(item.barcodeDataUrl, 'PNG', SKU_MARGIN_LEFT, 19.5, SKU_BARCODE_WIDTH, 7.0, undefined, 'NONE');
  }

  openPdfInBrowser(doc);
}
