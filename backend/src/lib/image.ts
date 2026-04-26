export type PreparedImageDataUrl = {
  extension: string;
  mimeType: string;
  dataUrl: string;
  bytes: number;
  originalBytes: number;
  compressed: boolean;
};

const FOTO_CAPA_PREFERRED_BYTES = 150 * 1024;
const FOTO_CAPA_HARD_MAX_BYTES = 220 * 1024;
const FOTO_CAPA_RAW_FALLBACK_BYTES = 120 * 1024;

function inferImageExtensionFromContentType(contentType: string | null | undefined) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/avif') return 'avif';

  return null;
}

function inferImageExtensionFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname || '';
    const match = path.match(/\.([a-z0-9]+)$/i);
    const ext = match ? match[1].toLowerCase() : '';

    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {}

  return null;
}

function inferImageMimeType(extension: string) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

function parseImageDataUrl(dataUrl: string) {
  const match = String(dataUrl || '').trim().match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Arquivo da foto capa invalido.');
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');

  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('Arquivo da foto capa invalido.');
  }

  return {
    mimeType,
    bytes: Buffer.from(base64, 'base64'),
  };
}

async function compressImageBuffer(bytes: Buffer) {
  const jimpModule: any = await import('jimp');
  const Jimp = jimpModule?.Jimp || jimpModule?.default?.Jimp || jimpModule?.default || jimpModule;

  if (!Jimp?.read && !Jimp?.fromBuffer) {
    return null;
  }

  const attempts = [
    { max: 1400, quality: 78 },
    { max: 1200, quality: 72 },
    { max: 1000, quality: 66 },
    { max: 850,  quality: 60 },
    { max: 700,  quality: 54 },
    { max: 600,  quality: 48 },
  ];
  let bestOutput: Buffer | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const image = Jimp.fromBuffer ? await Jimp.fromBuffer(bytes) : await Jimp.read(bytes);
    const width = Number(image?.bitmap?.width || 0);
    const height = Number(image?.bitmap?.height || 0);

    if (width > height && width > attempt.max) {
      image.resize({ w: attempt.max });
    } else if (height >= width && height > attempt.max) {
      image.resize({ h: attempt.max });
    }

    const output = Buffer.from(await image.getBuffer('image/jpeg', { quality: attempt.quality }));
    bestOutput = output;

    if (output.length <= FOTO_CAPA_PREFERRED_BYTES) {
      return output;
    }
  }

  if (bestOutput && bestOutput.length <= FOTO_CAPA_HARD_MAX_BYTES) {
    return bestOutput;
  }

  return null;
}

export async function prepareImageBufferAsDataUrl(
  bytes: Buffer,
  options?: {
    mimeType?: string | null;
    sourceUrl?: string | null;
    errorLabel?: string;
  },
): Promise<PreparedImageDataUrl> {
  const fallbackExtension =
    inferImageExtensionFromContentType(options?.mimeType) ||
    (options?.sourceUrl ? inferImageExtensionFromUrl(options.sourceUrl) : null) ||
    'jpg';
  const fallbackMimeType = inferImageMimeType(fallbackExtension);
  const label = options?.errorLabel || 'a foto capa';

  try {
    const output = await compressImageBuffer(bytes);
    if (output) {
      return {
        extension: 'jpg',
        mimeType: 'image/jpeg',
        dataUrl: `data:image/jpeg;base64,${output.toString('base64')}`,
        bytes: output.length,
        originalBytes: bytes.length,
        compressed: true,
      };
    }
  } catch {}

  if (bytes.length <= FOTO_CAPA_RAW_FALLBACK_BYTES) {
    return {
      extension: fallbackExtension,
      mimeType: fallbackMimeType,
      dataUrl: `data:${fallbackMimeType};base64,${bytes.toString('base64')}`,
      bytes: bytes.length,
      originalBytes: bytes.length,
      compressed: false,
    };
  }

  throw new Error(`Nao foi possivel compactar ${label}.`);
}

export async function compressDataUrlImage(dataUrl: string, errorLabel = 'a foto capa') {
  const parsed = parseImageDataUrl(dataUrl);
  return prepareImageBufferAsDataUrl(parsed.bytes, {
    mimeType: parsed.mimeType,
    errorLabel,
  });
}

export async function downloadImageAsDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status})`);
  }

  const contentType = String(response.headers.get('content-type') || '').trim();
  const bytes = Buffer.from(await response.arrayBuffer());

  return prepareImageBufferAsDataUrl(bytes, {
    mimeType: contentType,
    sourceUrl: imageUrl,
    errorLabel: 'a foto capa do Bling',
  });
}

export function normalizeImageFileName(fileName: string | null | undefined, extension: string) {
  const safeExtension = String(extension || 'jpg').replace(/^\.+/, '') || 'jpg';
  const cleanName = String(fileName || '').trim();
  const leafName = cleanName.split(/[\\/]/).pop()?.trim() || `foto-capa.${safeExtension}`;
  const baseName = leafName.replace(/\.[^.]+$/, '').trim() || 'foto-capa';

  return `${baseName}.${safeExtension}`;
}
