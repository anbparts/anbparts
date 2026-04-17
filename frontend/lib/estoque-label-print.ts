'use client';

export type CaixaEtiquetaPrintItem = {
  caixa: string;
};

export type SkuEtiquetaPrintItem = {
  motoLabel: string;
  sku: string;
  descricao: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renderBarcodeSvg(value: string, options: { width: number; height: number }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Impressao disponivel apenas no navegador.');
  }

  const barcodeModule = await import('jsbarcode');
  const JsBarcode = ((barcodeModule as any).default || barcodeModule) as any;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let valido = true;

  JsBarcode(svg, value, {
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

  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('shape-rendering', 'crispEdges');

  return new XMLSerializer().serializeToString(svg);
}

function openPrintWindow(title: string, bodyHtml: string, css: string) {
  const printWindow = window.open('', '_blank', 'width=780,height=680');
  if (!printWindow) {
    throw new Error('Nao foi possivel abrir a janela de impressao. Libere pop-ups para continuar.');
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${css}
    </style>
  </head>
  <body>
    ${bodyHtml}
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 120);
      });
      window.addEventListener('afterprint', function () {
        window.close();
      });
    </script>
  </body>
</html>`);
  printWindow.document.close();
}

export async function printCaixaLabels(items: CaixaEtiquetaPrintItem[]) {
  const labels = await Promise.all(
    items.map(async (item) => ({
      caixa: String(item.caixa || '').trim(),
      barcodeSvg: await renderBarcodeSvg(String(item.caixa || '').trim(), { width: 1.85, height: 72 }),
    })),
  );

  const bodyHtml = labels.map((item) => `
    <section class="label-page">
      <article class="label caixa-label">
        <div class="barcode">${item.barcodeSvg}</div>
        <div class="box-name">${escapeHtml(item.caixa)}</div>
      </article>
    </section>
  `).join('');

  openPrintWindow(
    'Etiquetas de Caixa',
    bodyHtml,
    `
      @page { size: 50mm 30mm; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        width: 50mm;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        color: #000;
      }
      .label-page {
        width: 50mm;
        height: 30mm;
        page-break-after: always;
      }
      .label-page:last-child {
        page-break-after: auto;
      }
      .label {
        box-sizing: border-box;
        width: 50mm;
        height: 30mm;
        padding: 2.2mm 1.8mm 1.6mm;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        overflow: hidden;
      }
      .barcode {
        width: 100%;
        height: 17.5mm;
      }
      .barcode svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      .box-name {
        margin-top: 1.1mm;
        text-align: center;
        font-size: 3.1mm;
        font-weight: 800;
        letter-spacing: .05em;
        text-transform: uppercase;
      }
    `,
  );
}

export async function printSkuLabels(items: SkuEtiquetaPrintItem[]) {
  const labels = await Promise.all(
    items.map(async (item) => ({
      motoLabel: String(item.motoLabel || '').trim(),
      sku: String(item.sku || '').trim(),
      descricao: String(item.descricao || '').trim(),
      barcodeSvg: await renderBarcodeSvg(String(item.sku || '').trim(), { width: 1.52, height: 42 }),
    })),
  );

  const bodyHtml = labels.map((item) => `
    <section class="label-page">
      <article class="label sku-label">
        <div class="meta">
          <div class="meta-row">
            <span class="meta-key">Moto:</span>
            <span class="meta-value">${escapeHtml(item.motoLabel)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">Cod:</span>
            <span class="meta-value meta-code">${escapeHtml(item.sku)}</span>
          </div>
        </div>
        <div class="descricao">${escapeHtml(item.descricao)}</div>
        <div class="barcode">${item.barcodeSvg}</div>
      </article>
    </section>
  `).join('');

  openPrintWindow(
    'Etiquetas de SKU',
    bodyHtml,
    `
      @page { size: 50mm 30mm; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        width: 50mm;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        color: #000;
      }
      .label-page {
        width: 50mm;
        height: 30mm;
        page-break-after: always;
      }
      .label-page:last-child {
        page-break-after: auto;
      }
      .label {
        box-sizing: border-box;
        width: 50mm;
        height: 30mm;
        padding: 1.8mm 1.9mm 1.4mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .meta {
        display: grid;
        gap: .5mm;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 9.2mm 1fr;
        gap: 1.2mm;
        align-items: start;
      }
      .meta-key {
        font-size: 3.05mm;
        font-weight: 700;
        line-height: 1.02;
      }
      .meta-value {
        font-size: 4.05mm;
        font-weight: 900;
        line-height: 1.02;
        text-transform: uppercase;
        word-break: break-word;
      }
      .meta-code {
        letter-spacing: .02em;
      }
      .descricao {
        margin-top: 1mm;
        font-size: 4.15mm;
        font-weight: 900;
        line-height: 1.05;
        min-height: 9.2mm;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .barcode {
        margin-top: auto;
        width: 100%;
        height: 8.4mm;
      }
      .barcode svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  );
}
