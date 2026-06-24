import zlib from 'zlib';
import { promisify } from 'util';

const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

// Comprime (Brotli, lossless) o conteudo de um dataUrl de PDF, marcando o mime como x-pdf-br.
// PADRONIZACAO: TODO PDF e armazenado como x-pdf-br, comprimindo ou nao (sem filtro de ganho).
// Nao-PDF (imagens etc.) e ja-comprimidos (x-pdf-br) passam intactos.
export async function compressPdfDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:application\/pdf;base64,(.*)$/s.exec(dataUrl || '');
  if (!match) return dataUrl;
  const raw = Buffer.from(match[1], 'base64');
  if (!raw.length) return dataUrl;
  const compressed = await brotliCompressAsync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  return `data:application/x-pdf-br;base64,${compressed.toString('base64')}`;
}

// Descomprime de volta pro PDF original quando o anexo esta no formato x-pdf-br.
export async function expandPdfDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:application\/x-pdf-br;base64,(.*)$/s.exec(dataUrl || '');
  if (!match) return dataUrl;
  const raw = await brotliDecompressAsync(Buffer.from(match[1], 'base64'));
  return `data:application/pdf;base64,${raw.toString('base64')}`;
}
