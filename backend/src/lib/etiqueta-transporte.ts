// Etiqueta de transporte (impressora termica 100x150 mm) — por enquanto SHOPEE.
// Fluxo da Shopee (v2.logistics): get_shipping_document_parameter -> create_shipping_document -> get_shipping_document_result
// (espera ficar READY) -> download_shipping_document. O arquivo baixado pode vir como PDF, ZPL (texto) ou ZIP; tudo vira PDF 100x150.
// O ZPL da Shopee e' um bitmap inteiro (~DGR + ^XG): decodificamos o bitmap e desenhamos numa pagina 100x150 mm, no mesmo
// formato da etiqueta do Mercado Livre (PDF 100x150).
import zlib from 'zlib';
import PDFDocument from 'pdfkit';
import { shopeeReq, shopeeReqArquivo } from './shopee-api';

const MM = (mm: number) => mm * (72 / 25.4);
const PAGE_W = MM(100);
const PAGE_H = MM(150);

// ---------- ZPL (~DGR) -> PNG ----------
function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(tipo: string, dados: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// bitmap 1 bit (bit 1 = preto na ZPL) -> PNG 1 bit em escala de cinza (0 = preto)
function bitmapParaPng(raw: Buffer, bytesPorLinha: number, altura: number) {
  const linhas: Buffer[] = [];
  for (let y = 0; y < altura; y++) {
    const l = Buffer.alloc(bytesPorLinha + 1);
    for (let i = 0; i < bytesPorLinha; i++) l[i + 1] = (~(raw[y * bytesPorLinha + i] || 0)) & 0xff;
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bytesPorLinha * 8, 0); ihdr.writeUInt32BE(altura, 4); ihdr[8] = 1; ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(linhas))), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Extrai todos os graficos "~DGR:nome,total,bytesPorLinha,dados" (dados em :Z64:, :B64: ou hex ASCII).
export function zplParaPngs(zpl: string): Buffer[] {
  const pngs: Buffer[] = [];
  const re = /~DG[RG]?:[^,]*,(\d+),(\d+),([^~^]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(zpl))) {
    const total = Number(m[1]);
    const bpl = Number(m[2]);
    const dados = m[3].trim();
    let raw: Buffer | null = null;
    try {
      const z64 = /^:Z64:([A-Za-z0-9+/=\s]+?)(?::[0-9A-Fa-f]{4})?$/.exec(dados);
      const b64 = /^:B64:([A-Za-z0-9+/=\s]+?)(?::[0-9A-Fa-f]{4})?$/.exec(dados);
      if (z64) raw = zlib.inflateSync(Buffer.from(z64[1].replace(/\s+/g, ''), 'base64'));
      else if (b64) raw = Buffer.from(b64[1].replace(/\s+/g, ''), 'base64');
      else if (/^[0-9A-Fa-f\s]+$/.test(dados)) raw = Buffer.from(dados.replace(/\s+/g, ''), 'hex');
    } catch { raw = null; }
    if (!raw || !bpl || !total) continue;
    const altura = Math.floor(Math.min(total, raw.length) / bpl);
    if (altura > 0) pngs.push(bitmapParaPng(raw, bpl, altura));
  }
  return pngs;
}

// Cada PNG vira uma pagina 100x150 mm (imagem ajustada a largura, sem margens)
export function pngsParaPdf100x150(pngs: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, info: { Title: 'Etiqueta de transporte' } });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    for (const png of pngs) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      doc.image(png, 0, 0, { fit: [PAGE_W, PAGE_H], align: 'center' });
    }
    doc.end();
  });
}

// ---------- ZIP minimo (central directory; stored e deflate) ----------
function lerZip(buf: Buffer): { nome: string; dados: Buffer }[] {
  const out: { nome: string; dados: Buffer }[] = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamCom = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + tamNome).toString('utf8');
    const lhNome = buf.readUInt16LE(offLocal + 26);
    const lhExtra = buf.readUInt16LE(offLocal + 28);
    const ini = offLocal + 30 + lhNome + lhExtra;
    const comp = buf.subarray(ini, ini + tamComp);
    try {
      const dados = metodo === 0 ? comp : metodo === 8 ? zlib.inflateRawSync(comp) : null;
      if (dados && !nome.endsWith('/')) out.push({ nome, dados });
    } catch { /* entrada ilegivel: ignora */ }
    p += 46 + tamNome + tamExtra + tamCom;
  }
  return out;
}

type Arquivo = { nome: string; dados: Buffer };
const ehPdf = (b: Buffer) => b.subarray(0, 4).toString('latin1') === '%PDF';
const ehZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b;
const pareceZpl = (b: Buffer) => /~DG|\^XA/.test(b.subarray(0, 4000).toString('latin1'));

export type ResultadoEtiqueta = { pdf: Buffer; formatoOrigem: 'pdf' | 'zpl'; tipoDocumento: string; avisos: string[] };

// Normaliza o que a Shopee devolveu: PDF direto | ZPL | ZIP (ZPL + declaracao de conteudo em PDF)
export async function normalizarArquivo(arquivo: Buffer, tipoDocumento: string): Promise<ResultadoEtiqueta> {
  const arquivos: Arquivo[] = ehZip(arquivo) ? lerZip(arquivo) : [{ nome: 'arquivo', dados: arquivo }];
  const zpls = arquivos.filter((a) => pareceZpl(a.dados));
  const pngs = zpls.flatMap((a) => zplParaPngs(a.dados.toString('latin1')));
  if (pngs.length) return { pdf: await pngsParaPdf100x150(pngs), formatoOrigem: 'zpl', tipoDocumento, avisos: [] };
  const pdfs = arquivos.filter((a) => ehPdf(a.dados));
  const etiqueta = pdfs.find((a) => !/declara|content/i.test(a.nome)) || pdfs[0];
  if (etiqueta) return { pdf: etiqueta.dados, formatoOrigem: 'pdf', tipoDocumento, avisos: [] };
  throw new Error('A Shopee devolveu um arquivo em formato nao reconhecido (nem PDF nem ZPL).');
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TIPO_PREFERIDO = 'THERMAL_AIR_WAYBILL';

// Passo a passo da Shopee para varios pedidos de uma vez (a propria Shopee junta as etiquetas num arquivo so)
export async function etiquetaShopee(orderSns: string[], opts?: { tipo?: string }): Promise<{ resultado: ResultadoEtiqueta | null; falhas: { orderSn: string; motivo: string }[]; ignorados: string[] }> {
  const falhas: { orderSn: string; motivo: string }[] = [];
  const sns = Array.from(new Set(orderSns.map((s) => String(s || '').trim()).filter(Boolean)));
  if (!sns.length) return { resultado: null, falhas, ignorados: [] };

  // 1) tipos de documento disponiveis por pedido
  const param: any = await shopeeReq('/api/v2/logistics/get_shipping_document_parameter', { method: 'POST', body: { order_list: sns.map((order_sn) => ({ order_sn })) } });
  const lista: any[] = param?.response?.result_list || [];
  const porTipo = new Map<string, { order_sn: string; package_number?: string }[]>();
  for (const it of lista) {
    if (it.fail_error || it.fail_message) { falhas.push({ orderSn: it.order_sn, motivo: String(it.fail_message || it.fail_error) }); continue; }
    const selecionaveis: string[] = it.selectable_shipping_document_type || [];
    const tipo = opts?.tipo && selecionaveis.includes(opts.tipo) ? opts.tipo
      : selecionaveis.includes(TIPO_PREFERIDO) ? TIPO_PREFERIDO
      : String(it.suggest_shipping_document_type || selecionaveis[0] || '');
    if (!tipo) { falhas.push({ orderSn: it.order_sn, motivo: 'A Shopee nao informou tipo de documento para este pedido.' }); continue; }
    const ref: { order_sn: string; package_number?: string } = { order_sn: it.order_sn };
    if (it.package_number) ref.package_number = String(it.package_number);
    porTipo.set(tipo, [...(porTipo.get(tipo) || []), ref]);
  }
  for (const sn of sns) if (!lista.some((it) => it.order_sn === sn) && !falhas.some((f) => f.orderSn === sn)) falhas.push({ orderSn: sn, motivo: 'Pedido nao encontrado na Shopee.' });
  if (!porTipo.size) return { resultado: null, falhas, ignorados: [] };

  // 2) cria, espera ficar pronto e baixa (um arquivo por tipo de documento)
  const arquivos: { buf: Buffer; tipo: string }[] = [];
  for (const [tipo, refs] of Array.from(porTipo.entries())) {
    const orderList = refs.map((r) => ({ ...r, shipping_document_type: tipo }));
    const criado: any = await shopeeReq('/api/v2/logistics/create_shipping_document', { method: 'POST', body: { order_list: orderList } });
    const prontos: { order_sn: string; package_number?: string }[] = [];
    for (const it of criado?.response?.result_list || []) {
      if (it.fail_error || it.fail_message) falhas.push({ orderSn: it.order_sn, motivo: String(it.fail_message || it.fail_error) });
    }
    const falhouSn = new Set(falhas.map((f) => f.orderSn));
    for (const r of refs) if (!falhouSn.has(r.order_sn)) prontos.push(r);
    if (!prontos.length) continue;

    let pendentes = prontos.slice();
    const liberados: typeof prontos = [];
    for (let tentativa = 0; tentativa < 12 && pendentes.length; tentativa++) {
      const res: any = await shopeeReq('/api/v2/logistics/get_shipping_document_result', { method: 'POST', body: { order_list: pendentes.map((r) => ({ ...r, shipping_document_type: tipo })) } });
      const proximos: typeof prontos = [];
      for (const it of res?.response?.result_list || []) {
        const ref = pendentes.find((r) => r.order_sn === it.order_sn);
        if (!ref) continue;
        if (it.status === 'READY') liberados.push(ref);
        else if (it.status === 'FAILED') falhas.push({ orderSn: it.order_sn, motivo: String(it.fail_message || it.fail_error || 'A Shopee nao conseguiu gerar o documento.') });
        else proximos.push(ref);
      }
      pendentes = proximos;
      if (pendentes.length) await dormir(1500);
    }
    for (const r of pendentes) falhas.push({ orderSn: r.order_sn, motivo: 'A Shopee ainda esta processando o documento. Tente de novo em instantes.' });
    if (!liberados.length) continue;

    const baixado = await shopeeReqArquivo('/api/v2/logistics/download_shipping_document', {
      shipping_document_type: tipo,
      order_list: liberados.map((r) => ({ ...r })),
    });
    arquivos.push({ buf: baixado.buffer, tipo });
  }
  if (!arquivos.length) return { resultado: null, falhas, ignorados: [] };

  // 3) tudo vira PDF 100x150. ZPL de varios arquivos junta; PDFs nao da pra juntar aqui: usa o 1o e avisa
  const normalizados: ResultadoEtiqueta[] = [];
  for (const a of arquivos) normalizados.push(await normalizarArquivo(a.buf, a.tipo));
  const todosZpl = normalizados.every((n) => n.formatoOrigem === 'zpl');
  if (normalizados.length === 1) return { resultado: normalizados[0], falhas, ignorados: [] };
  if (todosZpl) {
    const pngs: Buffer[] = [];
    for (const a of arquivos) {
      const arqs = ehZip(a.buf) ? lerZip(a.buf) : [{ nome: 'x', dados: a.buf }];
      for (const f of arqs) if (pareceZpl(f.dados)) pngs.push(...zplParaPngs(f.dados.toString('latin1')));
    }
    return { resultado: { pdf: await pngsParaPdf100x150(pngs), formatoOrigem: 'zpl', tipoDocumento: 'MISTO', avisos: [] }, falhas, ignorados: [] };
  }
  const primeiro = normalizados[0];
  primeiro.avisos.push(`A Shopee devolveu ${normalizados.length} arquivos em PDF (tipos diferentes); so o primeiro foi incluido. Gere os demais em outra rodada.`);
  return { resultado: primeiro, falhas, ignorados: [] };
}

// Diagnostico: mostra o que a Shopee responde (tipos de documento disponiveis) sem gerar nada
export async function diagnosticoEtiquetaShopee(orderSn: string) {
  return shopeeReq('/api/v2/logistics/get_shipping_document_parameter', { method: 'POST', body: { order_list: [{ order_sn: String(orderSn).trim() }] } });
}
