const FOTO_CAPA_PREFERRED_BYTES = 150 * 1024;
const FOTO_CAPA_HARD_MAX_BYTES = 220 * 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Arquivo invalido'));
    };
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nao foi possivel processar a imagem'));
    image.src = dataUrl;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Nao foi possivel compactar a imagem'));
      },
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem compactada'));
    reader.readAsDataURL(blob);
  });
}

function normalizeImageFileName(fileName: string, extension: string) {
  const safeExtension = extension.replace(/^\.+/, '') || 'jpg';
  const leafName = String(fileName || '').split(/[\\/]/).pop()?.trim() || `foto-capa.${safeExtension}`;
  const baseName = leafName.replace(/\.[^.]+$/, '').trim() || 'foto-capa';

  return `${baseName}.${safeExtension}`;
}

export async function compressFotoCapaFile(file: File) {
  const originalDataUrl = await readFileAsDataUrl(file);

  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return {
      dataUrl: originalDataUrl,
      fileName: file.name,
      originalBytes: file.size,
      bytes: file.size,
      compressed: false,
    };
  }

  try {
    const image = await loadImage(originalDataUrl);
    const attempts = [
      { max: 1400, quality: 0.78 },
      { max: 1200, quality: 0.72 },
      { max: 1000, quality: 0.66 },
      { max: 850,  quality: 0.60 },
      { max: 700,  quality: 0.54 },
      { max: 600,  quality: 0.48 },
    ];
    let bestBlob: Blob | null = null;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const scale = Math.min(1, attempt.max / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Nao foi possivel compactar a imagem');
      }

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasToJpegBlob(canvas, attempt.quality);
      bestBlob = blob;

      if (blob.size <= FOTO_CAPA_PREFERRED_BYTES) {
        return {
          dataUrl: await blobToDataUrl(blob),
          fileName: normalizeImageFileName(file.name, 'jpg'),
          originalBytes: file.size,
          bytes: blob.size,
          compressed: true,
        };
      }
    }

    if (bestBlob && bestBlob.size <= FOTO_CAPA_HARD_MAX_BYTES) {
      return {
        dataUrl: await blobToDataUrl(bestBlob),
        fileName: normalizeImageFileName(file.name, 'jpg'),
        originalBytes: file.size,
        bytes: bestBlob.size,
        compressed: true,
      };
    }

    if (bestBlob) {
      return {
        dataUrl: await blobToDataUrl(bestBlob),
        fileName: normalizeImageFileName(file.name, 'jpg'),
        originalBytes: file.size,
        bytes: bestBlob.size,
        compressed: true,
      };
    }
  } catch {}

  return {
    dataUrl: originalDataUrl,
    fileName: file.name,
    originalBytes: file.size,
    bytes: file.size,
    compressed: false,
  };
}
