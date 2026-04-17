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
  let valido = true;

  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: options.width,
    height: options.height,
    background: '#ffffff',
    lineColor: '#000000',
    flat: true,
    textMargin: 0,
    fontSize: 0,
    valid: (nextValid: boolean) => {
      valido = nextValid;
    },
  });

  if (!valido) {
    throw new Error(`Nao foi possivel gerar o codigo de barras para "${value}".`);
  }

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

function downloadPdf(doc: any, fileName: string) {
  doc.save(fileName);
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
        barcodeDataUrl: await renderBarcodeDataUrl(item.caixa, { width: 3.1, height: 200 }),
      })),
    ),
  ]);

  const doc = createPdfDocument(jsPDF);

  labels.forEach((item, index) => {
    prepareLabelPage(doc, index);
    doc.addImage(item.barcodeDataUrl, 'PNG', 1.4, 2.1, 47.2, 17.2, undefined, 'FAST');
    doc.setFont('helvetica', 'bold');
    const fontSize = fitTextSize(doc, item.caixa.toUpperCase(), 45.5, 11.2, 7.5);
    doc.setFontSize(fontSize);
    doc.text(item.caixa.toUpperCase(), LABEL_WIDTH_MM / 2, 24.4, { align: 'center' });
  });

  downloadPdf(doc, `Etiquetas_Caixa_ANB_${buildTimestampFileToken()}.pdf`);
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
        barcodeDataUrl: await renderBarcodeDataUrl(item.sku, { width: 2.35, height: 104 }),
      })),
    ),
  ]);

  const doc = createPdfDocument(jsPDF);

  labels.forEach((item, index) => {
    prepareLabelPage(doc, index);

    doc.setFont('helvetica', 'bold');

    doc.setFontSize(7.2);
    doc.text('Moto:', 1.7, 4.3);
    const motoFontSize = fitTextSize(doc, item.motoLabel.toUpperCase(), 36, 10.6, 7.2);
    doc.setFontSize(motoFontSize);
    doc.text(item.motoLabel.toUpperCase() || '-', 13.2, 4.3);

    doc.setFontSize(7.2);
    doc.text('Cod:', 1.7, 8.7);
    const skuFontSize = fitTextSize(doc, item.sku, 36, 11.2, 7.8);
    doc.setFontSize(skuFontSize);
    doc.text(item.sku, 13.2, 8.7);

    doc.setFontSize(9.8);
    const descricaoLinhas = doc.splitTextToSize(item.descricao || '-', 46);
    const descricaoLimitada = descricaoLinhas.slice(0, 2);
    doc.text(descricaoLimitada, 1.7, 13.7, { maxWidth: 46 });

    doc.addImage(item.barcodeDataUrl, 'PNG', 1.6, 21.2, 46.8, 7.3, undefined, 'FAST');
  });

  downloadPdf(doc, `Etiquetas_SKU_ANB_${buildTimestampFileToken()}.pdf`);
}
