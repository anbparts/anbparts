import { prisma } from './prisma';
import { compressDataUrlImage, normalizeImageFileName } from './image';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_URL = 'https://www.googleapis.com/drive/v3';
const NUVEMSHOP_USER_AGENT = 'ANB Parts (contato@anbparts.com.br)';
const MERCADO_LIVRE_API = 'https://api.mercadolibre.com';
const MERCADO_LIVRE_MAX_FOTOS = 12;

type DriveFoto = {
  id: string;
  nome: string;
  mimeType: string;
  size?: string | number | null;
};

type FotoDestino = 'anb' | 'ml' | 'nuvemshop';
type ManualFoto = {
  nome: string;
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
};

type CadastroFotosRowInput = {
  sku: string;
  flags?: Partial<Record<FotoDestino, boolean>>;
};

function normalizeText(value: any) {
  return String(value ?? '').trim();
}

function normalizeSku(value: any) {
  return normalizeText(value).replace(/^"+|"+$/g, '').toUpperCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pauseUploadBatch(index: number) {
  if ((index + 1) % 4 === 0) await sleep(650);
}

function baseSku(value: any) {
  return normalizeSku(value).replace(/-\d+$/, '');
}

function buildAnbFotoCapaNome(sku: string, extension = 'jpg') {
  const safeExtension = String(extension || 'jpg').replace(/^\.+/, '') || 'jpg';
  return `${baseSku(sku) || 'FOTO'}_Capa.${safeExtension}`;
}

function parseSkuList(value: any) {
  if (Array.isArray(value)) return value.map(normalizeSku).filter(Boolean);
  return normalizeText(value)
    .split(/[\n,;]+/)
    .map(normalizeSku)
    .filter(Boolean);
}

function parseDateStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function parseDateEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`);
}

function getApiErrorMessage(payload: any, fallback: string) {
  return normalizeText(
    payload?.error_description
    || payload?.error?.message
    || payload?.message
    || payload?.error
    || payload?.cause?.[0]?.message
    || fallback,
  );
}

async function getConfiguracaoGeral() {
  let cfg = await prisma.configuracaoGeral.findFirst();
  if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });
  return cfg;
}

async function getGoogleDriveConfig() {
  const cfg = await getConfiguracaoGeral();
  const detranCfg = await prisma.detranConfig.findFirst();
  return {
    ...cfg,
    googleDriveClientId: detranCfg?.gmailClientId || cfg.googleDriveClientId || '',
    googleDriveClientSecret: detranCfg?.gmailClientSecret || cfg.googleDriveClientSecret || '',
    googleDriveRefreshToken: detranCfg?.gmailRefreshToken || cfg.googleDriveRefreshToken || '',
  };
}

async function clearGoogleDriveToken() {
  await prisma.configuracaoGeral.updateMany({
    data: { googleDriveAccessToken: '', googleDriveTokenExpiry: null },
  });
}

async function getGoogleDriveToken(forceRefresh = false) {
  const cfg = await getGoogleDriveConfig();
  const expiry = cfg.googleDriveTokenExpiry ? new Date(cfg.googleDriveTokenExpiry) : null;
  if (
    !forceRefresh
    && cfg.googleDriveAccessToken
    && expiry
    && expiry.getTime() - Date.now() > 5 * 60 * 1000
  ) {
    return cfg.googleDriveAccessToken;
  }

  const refreshToken = normalizeText(cfg.googleDriveRefreshToken);
  if (!refreshToken) throw new Error('Google Drive nao conectado. Configure o Refresh Token.');

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: normalizeText(cfg.googleDriveClientId),
      client_secret: normalizeText(cfg.googleDriveClientSecret),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    await clearGoogleDriveToken();
    throw new Error(getApiErrorMessage(data, 'Falha ao renovar token do Google Drive.'));
  }

  const tokenExpiry = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000);
  await prisma.configuracaoGeral.updateMany({
    data: {
      googleDriveAccessToken: normalizeText(data.access_token),
      googleDriveRefreshToken: normalizeText(data.refresh_token) || refreshToken,
      googleDriveTokenExpiry: tokenExpiry,
    },
  });

  return normalizeText(data.access_token);
}

function escapeDriveQueryValue(value: any) {
  return normalizeText(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildDrivePath(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    ...params,
  });
  return `${path}?${searchParams.toString()}`;
}

async function driveFetch(path: string) {
  const execute = (token: string) => fetch(`${GOOGLE_DRIVE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let token = await getGoogleDriveToken();
  let resp = await execute(token);
  if (resp.status === 401 || resp.status === 403) {
    await clearGoogleDriveToken();
    token = await getGoogleDriveToken(true);
    resp = await execute(token);
  }
  return resp;
}

async function driveGet(path: string) {
  const resp = await driveFetch(path);
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(getApiErrorMessage(data, `Google Drive ${resp.status}`));
  return data;
}

async function listDriveFiles(q: string, fields: string, extraParams: Record<string, string> = {}) {
  const files: any[] = [];
  let pageToken = '';
  do {
    const params: Record<string, string> = {
      q,
      fields: `nextPageToken,${fields}`,
      pageSize: extraParams.pageSize || '100',
      orderBy: extraParams.orderBy || 'name',
      corpora: extraParams.corpora || 'allDrives',
      ...extraParams,
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await driveGet(buildDrivePath('/files', params));
    files.push(...(Array.isArray(data.files) ? data.files : []));
    pageToken = normalizeText(data.nextPageToken);
  } while (pageToken);
  return files;
}

async function buscarFotosDriveSku(motoId: number, sku: string) {
  const cfg = await getGoogleDriveConfig();
  const motoDirs = (cfg.googleDriveMotoDirs as any) || {};
  const motoPastaId = normalizeText(motoDirs[String(motoId)]);
  if (!motoPastaId) return { fotos: [] as DriveFoto[], pasta: '' };

  const skuBase = baseSku(sku);
  const pastas = await listDriveFiles(
    `'${escapeDriveQueryValue(motoPastaId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${escapeDriveQueryValue(skuBase)}' and trashed = false`,
    'files(id,name)',
    { pageSize: '100', orderBy: 'name' },
  );
  const pasta = pastas.find((p: any) => normalizeText(p.name).toUpperCase().startsWith(skuBase));
  if (!pasta) return { fotos: [] as DriveFoto[], pasta: '' };

  const fotos = (await listDriveFiles(
    `'${escapeDriveQueryValue(pasta.id)}' in parents and mimeType contains 'image/' and trashed = false`,
    'files(id,name,mimeType,size)',
    { pageSize: '100', orderBy: 'name' },
  )).map((f: any) => ({
    id: normalizeText(f.id),
    nome: normalizeText(f.name),
    mimeType: normalizeText(f.mimeType) || 'image/jpeg',
    size: f.size ?? null,
  }));

  fotos.sort((a, b) => {
    const ac = a.nome.toLowerCase().includes('capa') ? 0 : 1;
    const bc = b.nome.toLowerCase().includes('capa') ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });

  return { fotos, pasta: normalizeText(pasta.name) };
}

async function downloadDriveFoto(foto: DriveFoto) {
  const resp = await driveFetch(buildDrivePath(`/files/${encodeURIComponent(foto.id)}`, { alt: 'media' }));
  if (!resp.ok) {
    const data: any = await resp.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(data, `Erro ao baixar foto ${foto.nome}`));
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const mimeType = normalizeText(foto.mimeType) || normalizeText(resp.headers.get('content-type')) || 'image/jpeg';
  return {
    buffer,
    mimeType,
    base64: buffer.toString('base64'),
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
  };
}

async function prepararFotoCapaAnb(foto: DriveFoto, sku: string) {
  const downloaded = await downloadDriveFoto(foto);
  const prepared = await compressDataUrlImage(downloaded.dataUrl, 'a foto capa do ANB');
  return {
    fotoCapaNome: normalizeImageFileName(buildAnbFotoCapaNome(sku, prepared.extension), prepared.extension),
    fotoCapaArquivo: prepared.dataUrl,
  };
}

async function nuvemReq<T = any>(path: string, options: RequestInit = {}) {
  const cfg = await getConfiguracaoGeral();
  const accessToken = normalizeText(cfg.nuvemshopAccessToken);
  const storeId = normalizeText(cfg.nuvemshopStoreId);
  if (!accessToken || !storeId) throw new Error('Nuvemshop nao configurada.');

  const resp = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}${path}`, {
    ...options,
    headers: {
      Authentication: `bearer ${accessToken}`,
      'User-Agent': NUVEMSHOP_USER_AGENT,
      'Content-Type': 'application/json',
      ...((options.headers as any) || {}),
    },
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(getApiErrorMessage(data, `Nuvemshop ${resp.status}`));
  return data as T;
}

function produtoContemSku(produto: any, sku: string) {
  const alvo = normalizeSku(sku);
  const variants: any[] = produto?.variants || [];
  return variants.some((variant) => normalizeSku(variant?.sku) === alvo);
}

async function buscarProdutoNuvemshopPorSku(sku: string) {
  try {
    const produto = await nuvemReq<any>(`/products/sku/${encodeURIComponent(sku)}`);
    if (produto && produtoContemSku(produto, sku)) return produto;
  } catch (e: any) {
    if (!String(e?.message || '').includes('404')) throw e;
  }
  const produtos = await nuvemReq<any[]>(`/products?q=${encodeURIComponent(sku)}&per_page=10`);
  return (Array.isArray(produtos) ? produtos : []).find((produto) => produtoContemSku(produto, sku)) || null;
}

async function listarImagensNuvemshop(produtoId: number | string | null) {
  if (!produtoId) return [];
  const imagens = await nuvemReq<any[]>(`/products/${encodeURIComponent(String(produtoId))}/images?per_page=200&fields=id,src,position`);
  return Array.isArray(imagens) ? imagens : [];
}

async function uploadNuvemshopDrive(produtoId: number | string, fotos: DriveFoto[], imagensAtuais: number) {
  const fotosParaEnviar = imagensAtuais > 0 ? fotos.slice(1) : fotos;
  let proximaPosicao = (await listarImagensNuvemshop(produtoId)).reduce((max, img) => Math.max(max, Number(img?.position || 0) || 0), 0) + 1;
  const resultados: any[] = [];

  for (const foto of fotosParaEnviar) {
    try {
      const downloaded = await downloadDriveFoto(foto);
      const data = await nuvemReq<any>(`/products/${encodeURIComponent(String(produtoId))}/images`, {
        method: 'POST',
        body: JSON.stringify({
          attachment: downloaded.base64,
          filename: foto.nome || 'foto.jpg',
          position: proximaPosicao,
        }),
      });
      resultados.push({ sistema: 'nuvemshop', nome: foto.nome, ok: true, id: data?.id, position: proximaPosicao });
      proximaPosicao++;
      await pauseUploadBatch(resultados.length - 1);
    } catch (e: any) {
      resultados.push({ sistema: 'nuvemshop', nome: foto.nome, ok: false, error: e?.message || String(e) });
    }
  }

  return resultados;
}

async function uploadNuvemshopManual(produtoId: number | string, fotos: ManualFoto[]) {
  let proximaPosicao = (await listarImagensNuvemshop(produtoId)).reduce((max, img) => Math.max(max, Number(img?.position || 0) || 0), 0) + 1;
  const resultados: any[] = [];

  for (const foto of fotos) {
    try {
      const data = await nuvemReq<any>(`/products/${encodeURIComponent(String(produtoId))}/images`, {
        method: 'POST',
        body: JSON.stringify({
          attachment: manualFotoToBase64(foto),
          filename: foto.nome || 'foto.jpg',
          position: proximaPosicao,
        }),
      });
      resultados.push({ sistema: 'nuvemshop', nome: foto.nome, ok: true, id: data?.id, position: proximaPosicao });
      proximaPosicao++;
      await pauseUploadBatch(resultados.length - 1);
    } catch (e: any) {
      resultados.push({ sistema: 'nuvemshop', nome: foto.nome, ok: false, error: e?.message || String(e) });
    }
  }

  return resultados;
}

async function getMercadoLivreConfig() {
  let config = await prisma.mercadoLivreConfig.findFirst();
  if (!config) config = await prisma.mercadoLivreConfig.create({ data: { siteId: 'MLB' } });
  return config;
}

async function refreshMercadoLivreToken(config: any) {
  if (!config.refreshToken) throw new Error('Sem refresh token do Mercado Livre. Reconecte a conta.');
  if (!config.clientId || !config.clientSecret) throw new Error('Credenciais do Mercado Livre nao configuradas.');

  const resp = await fetch(`${MERCADO_LIVRE_API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: normalizeText(config.clientId),
      client_secret: normalizeText(config.clientSecret),
      refresh_token: normalizeText(config.refreshToken),
    }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) throw new Error(getApiErrorMessage(data, `Mercado Livre token ${resp.status}`));

  await prisma.mercadoLivreConfig.update({
    where: { id: config.id },
    data: {
      accessToken: normalizeText(data.access_token),
      refreshToken: normalizeText(data.refresh_token) || config.refreshToken,
      connectedAt: new Date(),
    },
  });

  return normalizeText(data.access_token);
}

async function mercadoLivreReq(path: string, options: RequestInit = {}, allowRefresh = true) {
  const config = await getMercadoLivreConfig();
  let token = normalizeText(config.accessToken);
  if (!token) throw new Error('Mercado Livre nao conectado.');

  async function execute(bearer: string) {
    return fetch(`${MERCADO_LIVRE_API}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        ...((options.headers as any) || {}),
      },
    });
  }

  let resp = await execute(token);
  let data: any = await resp.json().catch(() => ({}));
  if (resp.status === 401 && allowRefresh && config.refreshToken) {
    token = await refreshMercadoLivreToken(config);
    resp = await execute(token);
    data = await resp.json().catch(() => ({}));
  }
  if (!resp.ok) throw new Error(getApiErrorMessage(data, `Mercado Livre ${resp.status}`));
  return data;
}

async function getMercadoLivreTokenForUpload() {
  const config = await getMercadoLivreConfig();
  if (!normalizeText(config.accessToken)) throw new Error('Mercado Livre nao conectado.');
  return normalizeText(config.accessToken);
}

function parseMercadoLivreItemId(value: any) {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/\bML[A-Z]{1,3}\d+\b/);
  return match ? match[0] : '';
}

async function buscarItemMercadoLivrePorSku(sku: string) {
  const peca = await prisma.peca.findFirst({
    where: { idPeca: { equals: sku, mode: 'insensitive' } },
    select: { mercadoLivreItemId: true, mercadoLivreLink: true },
  });
  const itemId = normalizeText(peca?.mercadoLivreItemId) || parseMercadoLivreItemId(peca?.mercadoLivreLink);
  if (!itemId) return null;
  return mercadoLivreReq(`/items/${encodeURIComponent(itemId)}`);
}

async function uploadMercadoLivreDrive(itemId: string, fotos: DriveFoto[]) {
  const resultados: any[] = [];
  const token = await getMercadoLivreTokenForUpload();

  for (const foto of fotos) {
    try {
      const downloaded = await downloadDriveFoto(foto);
      const form = new FormData();
      const blob = new Blob([downloaded.buffer], { type: downloaded.mimeType });
      form.append('file', blob, foto.nome || 'foto.jpg');

      let uploadResp = await fetch(`${MERCADO_LIVRE_API}/pictures/items/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form as any,
      });
      let uploadData: any = await uploadResp.json().catch(() => ({}));
      if (uploadResp.status === 401) {
        const refreshed = await refreshMercadoLivreToken(await getMercadoLivreConfig());
        uploadResp = await fetch(`${MERCADO_LIVRE_API}/pictures/items/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${refreshed}` },
          body: form as any,
        });
        uploadData = await uploadResp.json().catch(() => ({}));
      }
      if (!uploadResp.ok || !uploadData?.id) throw new Error(getApiErrorMessage(uploadData, `Upload ML ${uploadResp.status}`));

      await mercadoLivreReq(`/items/${encodeURIComponent(itemId)}/pictures`, {
        method: 'POST',
        body: JSON.stringify({ id: uploadData.id }),
      });

      resultados.push({ sistema: 'ml', nome: foto.nome, ok: true, id: uploadData.id });
      await pauseUploadBatch(resultados.length - 1);
    } catch (e: any) {
      resultados.push({ sistema: 'ml', nome: foto.nome, ok: false, error: e?.message || String(e) });
    }
  }

  return resultados;
}

async function uploadMercadoLivreManual(itemId: string, fotos: ManualFoto[]) {
  const resultados: any[] = [];
  const token = await getMercadoLivreTokenForUpload();

  for (const foto of fotos) {
    try {
      const buffer = Buffer.from(manualFotoToBase64(foto), 'base64');
      const form = new FormData();
      const blob = new Blob([buffer], { type: foto.mimeType || 'image/jpeg' });
      form.append('file', blob, foto.nome || 'foto.jpg');

      let uploadResp = await fetch(`${MERCADO_LIVRE_API}/pictures/items/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form as any,
      });
      let uploadData: any = await uploadResp.json().catch(() => ({}));
      if (uploadResp.status === 401) {
        const refreshed = await refreshMercadoLivreToken(await getMercadoLivreConfig());
        uploadResp = await fetch(`${MERCADO_LIVRE_API}/pictures/items/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${refreshed}` },
          body: form as any,
        });
        uploadData = await uploadResp.json().catch(() => ({}));
      }
      if (!uploadResp.ok || !uploadData?.id) throw new Error(getApiErrorMessage(uploadData, `Upload ML ${uploadResp.status}`));

      await mercadoLivreReq(`/items/${encodeURIComponent(itemId)}/pictures`, {
        method: 'POST',
        body: JSON.stringify({ id: uploadData.id }),
      });

      resultados.push({ sistema: 'ml', nome: foto.nome, ok: true, id: uploadData.id });
      await pauseUploadBatch(resultados.length - 1);
    } catch (e: any) {
      resultados.push({ sistema: 'ml', nome: foto.nome, ok: false, error: e?.message || String(e) });
    }
  }

  return resultados;
}

function limitarFotosMercadoLivre<T>(fotos: T[], imagensAtuais: number) {
  const vagas = Math.max(0, MERCADO_LIVRE_MAX_FOTOS - Math.max(0, Number(imagensAtuais) || 0));
  return fotos.slice(0, vagas);
}

function normalizarManualFotos(value: any): ManualFoto[] {
  if (!Array.isArray(value)) return [];
  return value.map((foto) => ({
    nome: normalizeText(foto?.nome || foto?.filename || foto?.name) || 'foto.jpg',
    dataUrl: normalizeText(foto?.dataUrl),
    base64: normalizeText(foto?.base64),
    mimeType: normalizeText(foto?.mimeType) || 'image/jpeg',
  })).filter((foto) => foto.dataUrl || foto.base64);
}

function manualFotoToBase64(foto: ManualFoto) {
  return normalizeText(foto.base64) || normalizeText(foto.dataUrl).replace(/^data:[^;]+;base64,/, '');
}

function manualFotoToDataUrl(foto: ManualFoto) {
  if (normalizeText(foto.dataUrl).startsWith('data:image/')) return normalizeText(foto.dataUrl);
  return `data:${foto.mimeType || 'image/jpeg'};base64,${manualFotoToBase64(foto)}`;
}

async function getPecasParaFotos(input: { skus?: any; dataDe?: string; dataAte?: string }) {
  const skus = parseSkuList(input.skus).map(baseSku);
  const where: any = { disponivel: true, emPrejuizo: false };
  if (skus.length) {
    where.OR = skus.map((sku) => ({
      OR: [
        { idPeca: { equals: sku, mode: 'insensitive' } },
        { idPeca: { startsWith: `${sku}-`, mode: 'insensitive' } },
      ],
    }));
  }
  if (!skus.length && (input.dataDe || input.dataAte)) {
    where.cadastro = {
      ...(input.dataDe ? { gte: parseDateStart(input.dataDe) } : {}),
      ...(input.dataAte ? { lte: parseDateEnd(input.dataAte) } : {}),
    };
  }

  const pecas = await prisma.peca.findMany({
    where,
    select: {
      id: true,
      idPeca: true,
      descricao: true,
      motoId: true,
      fotoCapaNome: true,
      fotoCapaArquivo: true,
      mercadoLivreItemId: true,
      mercadoLivreLink: true,
      cadastro: true,
      moto: { select: { marca: true, modelo: true, ano: true } },
    },
    orderBy: { idPeca: 'asc' },
    take: 1000,
  });

  const map = new Map<string, typeof pecas[number]>();
  for (const peca of pecas) {
    const sku = baseSku(peca.idPeca);
    if (!map.has(sku)) map.set(sku, { ...peca, idPeca: sku });
  }
  return Array.from(map.values());
}

async function montarLinhaCadastroFotos(peca: any, verificarExternos: boolean) {
  const sku = baseSku(peca.idPeca);
  const anbFotos = peca.fotoCapaArquivo ? 1 : 0;

  let nuvemshopProdutoId: number | null = null;
  let nuvemshopFotos = 0;
  let nuvemshopEncontrado = false;
  let nuvemshopErro = '';
  let mlFotos = 0;
  let mlEncontrado = false;
  let mlErro = '';
  const mlItemId = normalizeText(peca.mercadoLivreItemId) || parseMercadoLivreItemId(peca.mercadoLivreLink);

  if (verificarExternos) {
    try {
      const produto = await buscarProdutoNuvemshopPorSku(sku);
      if (produto?.id) {
        nuvemshopEncontrado = true;
        nuvemshopProdutoId = Number(produto.id);
        nuvemshopFotos = Array.isArray(produto.images) ? produto.images.length : (await listarImagensNuvemshop(produto.id)).length;
      }
    } catch (e: any) {
      nuvemshopErro = e?.message || String(e);
    }

    try {
      if (mlItemId) {
        const item = await mercadoLivreReq(`/items/${encodeURIComponent(mlItemId)}`);
        mlEncontrado = true;
        mlFotos = Array.isArray(item?.pictures) ? item.pictures.length : 0;
      }
    } catch (e: any) {
      mlErro = e?.message || String(e);
    }
  }

  const flags = {
    anb: anbFotos === 0,
    nuvemshop: verificarExternos && nuvemshopEncontrado && nuvemshopFotos <= 2,
    ml: verificarExternos && mlEncontrado && mlFotos <= 2,
  };
  const temFlag = flags.anb || flags.nuvemshop || flags.ml;
  let driveResumo = { fotos: null as number | null, pasta: '' };

  if (flags.nuvemshop || flags.ml) {
    try {
      const drive = await buscarFotosDriveSku(peca.motoId, sku);
      driveResumo = { fotos: drive.fotos.length, pasta: drive.pasta };
    } catch {
      driveResumo = { fotos: 0, pasta: '' };
    }
  }

  return {
    sku,
    descricao: peca.descricao,
    motoId: peca.motoId,
    moto: peca.moto,
    anb: { fotos: anbFotos, ok: anbFotos > 0 },
    ml: { fotos: mlFotos, encontrado: mlEncontrado, itemId: mlItemId || null, erro: mlErro },
    nuvemshop: { fotos: nuvemshopFotos, encontrado: nuvemshopEncontrado, produtoId: nuvemshopProdutoId, erro: nuvemshopErro },
    flags,
    temFlag,
    drive: driveResumo,
    status: verificarExternos ? (temFlag ? 'pendente' : 'ok') : 'verificando',
  };
}

function ordenarLinhasCadastroFotos(linhas: any[]) {
  linhas.sort((a, b) => {
    if (a.temFlag !== b.temFlag) return a.temFlag ? -1 : 1;
    return a.sku.localeCompare(b.sku, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
  return linhas;
}

export async function buscarCadastroFotosAnb(input: { skus?: any; dataDe?: string; dataAte?: string }) {
  const pecas = await getPecasParaFotos(input);
  const linhas = await Promise.all(pecas.map((peca) => montarLinhaCadastroFotos(peca, false)));
  return { ok: true, total: linhas.length, linhas: ordenarLinhasCadastroFotos(linhas) };
}

export async function verificarCadastroFotoSku(input: { sku?: string }) {
  const sku = baseSku(input.sku);
  if (!sku) throw new Error('SKU obrigatorio.');
  const pecas = await getPecasParaFotos({ skus: [sku] });
  const peca = pecas.find((item) => baseSku(item.idPeca) === sku);
  if (!peca) throw new Error('SKU nao encontrado no ANB.');
  return { ok: true, linha: await montarLinhaCadastroFotos(peca, true) };
}

export async function buscarCadastroFotos(input: { skus?: any; dataDe?: string; dataAte?: string }) {
  const pecas = await getPecasParaFotos(input);
  const linhas: any[] = [];

  for (const peca of pecas) {
    linhas.push(await montarLinhaCadastroFotos(peca, true));
  }

  return { ok: true, total: linhas.length, linhas: ordenarLinhasCadastroFotos(linhas) };
}

export async function processarCadastroFotos(rowsInput: CadastroFotosRowInput[]) {
  if (!Array.isArray(rowsInput) || !rowsInput.length) {
    throw new Error('Informe ao menos um SKU para processar.');
  }

  const resultados: any[] = [];
  const driveCache = new Map<string, { fotos: DriveFoto[]; pasta: string }>();

  for (const row of rowsInput) {
    const sku = baseSku(row.sku);
    const flags = row.flags || {};
    const sistemas = (['anb', 'ml', 'nuvemshop'] as FotoDestino[]).filter((sistema) => !!flags[sistema]);
    if (!sku || !sistemas.length) continue;

    const peca = await prisma.peca.findFirst({
      where: { idPeca: { equals: sku, mode: 'insensitive' } },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        motoId: true,
        fotoCapaArquivo: true,
        fotoCapaNome: true,
        mercadoLivreItemId: true,
        mercadoLivreLink: true,
      },
    });
    if (!peca) {
      resultados.push({ sku, ok: false, error: 'SKU nao encontrado no ANB.' });
      continue;
    }

    let drive = driveCache.get(sku);
    if (!drive) {
      drive = await buscarFotosDriveSku(peca.motoId, sku);
      driveCache.set(sku, drive);
    }
    if (!drive.fotos.length) {
      resultados.push({ sku, ok: false, error: 'Nenhuma foto encontrada no Drive.', sistemas });
      continue;
    }

    const detalhes: any[] = [];

    if (flags.anb) {
      try {
        const capa = drive.fotos[0];
        const { fotoCapaNome, fotoCapaArquivo } = await prepararFotoCapaAnb(capa, sku);
        await prisma.peca.update({
          where: { id: peca.id },
          data: { fotoCapaNome, fotoCapaArquivo },
        });
        detalhes.push({ sistema: 'anb', ok: true, enviada: 1, nome: fotoCapaNome });
      } catch (e: any) {
        detalhes.push({ sistema: 'anb', ok: false, error: e?.message || String(e) });
      }
    }

    if (flags.nuvemshop) {
      try {
        const produto = await buscarProdutoNuvemshopPorSku(sku);
        if (!produto?.id) throw new Error('Produto nao encontrado na Nuvemshop.');
        const imagensAtuais = Array.isArray(produto.images) ? produto.images.length : (await listarImagensNuvemshop(produto.id)).length;
        const envios = await uploadNuvemshopDrive(produto.id, drive.fotos, imagensAtuais);
        detalhes.push({ sistema: 'nuvemshop', ok: envios.some((item) => item.ok), enviados: envios.filter((item) => item.ok).length, resultados: envios });
      } catch (e: any) {
        detalhes.push({ sistema: 'nuvemshop', ok: false, error: e?.message || String(e) });
      }
    }

    if (flags.ml) {
      try {
        const itemId = normalizeText(peca.mercadoLivreItemId) || parseMercadoLivreItemId(peca.mercadoLivreLink);
        if (!itemId) throw new Error('Item ID do Mercado Livre nao encontrado no SKU.');
        const item = await mercadoLivreReq(`/items/${encodeURIComponent(itemId)}`);
        const imagensAtuais = Array.isArray(item?.pictures) ? item.pictures.length : 0;
        const fotosBase = imagensAtuais > 0 ? drive.fotos.slice(1) : drive.fotos;
        const fotosParaEnviar = limitarFotosMercadoLivre(fotosBase, imagensAtuais);
        if (!fotosParaEnviar.length) {
          detalhes.push({ sistema: 'ml', ok: true, enviados: 0, limite: MERCADO_LIVRE_MAX_FOTOS, resultados: [{ sistema: 'ml', ok: true, pulada: true, error: 'Mercado Livre ja esta com 12 fotos.' }] });
        } else {
          const envios = await uploadMercadoLivreDrive(itemId, fotosParaEnviar);
          detalhes.push({ sistema: 'ml', ok: envios.some((item) => item.ok), enviados: envios.filter((item) => item.ok).length, resultados: envios });
        }
      } catch (e: any) {
        detalhes.push({ sistema: 'ml', ok: false, error: e?.message || String(e) });
      }
    }

    resultados.push({
      sku,
      ok: detalhes.length > 0 && detalhes.every((item) => item.ok !== false),
      drive: { total: drive.fotos.length, pasta: drive.pasta },
      detalhes,
    });
  }

  return { ok: true, total: resultados.length, resultados };
}

export async function buscarCadastroFotosDrive(input: { sku: string }) {
  const sku = baseSku(input.sku);
  if (!sku) throw new Error('SKU obrigatorio.');

  const peca = await prisma.peca.findFirst({
    where: { idPeca: { equals: sku, mode: 'insensitive' } },
    select: { id: true, idPeca: true, descricao: true, motoId: true },
  });
  if (!peca) throw new Error('SKU nao encontrado no ANB.');

  const drive = await buscarFotosDriveSku(peca.motoId, sku);
  return {
    ok: true,
    sku,
    descricao: peca.descricao,
    pasta: drive.pasta,
    fotos: drive.fotos,
    total: drive.fotos.length,
  };
}

export async function enviarCadastroFotosManual(input: {
  sku: string;
  sistema: FotoDestino;
  fotos: DriveFoto[];
  imagens?: ManualFoto[];
  origem?: 'drive' | 'manual';
}) {
  const sku = baseSku(input.sku);
  const sistema = input.sistema;
  const origem = input.origem === 'manual' ? 'manual' : 'drive';
  const fotosSelecionadas = Array.isArray(input.fotos)
    ? input.fotos.map((foto) => ({
        id: normalizeText(foto.id),
        nome: normalizeText(foto.nome),
        mimeType: normalizeText(foto.mimeType) || 'image/jpeg',
        size: foto.size ?? null,
      })).filter((foto) => foto.id)
    : [];
  const imagensManuais = normalizarManualFotos(input.imagens);

  if (!sku) throw new Error('SKU obrigatorio.');
  if (!(['anb', 'ml', 'nuvemshop'] as FotoDestino[]).includes(sistema)) throw new Error('Sistema invalido.');
  if (origem === 'manual' && !imagensManuais.length) throw new Error('Selecione ao menos uma foto do computador.');
  if (origem === 'drive' && !fotosSelecionadas.length) throw new Error('Selecione ao menos uma foto do Drive.');

  const peca = await prisma.peca.findFirst({
    where: { idPeca: { equals: sku, mode: 'insensitive' } },
    select: {
      id: true,
      idPeca: true,
      descricao: true,
      motoId: true,
      fotoCapaArquivo: true,
      mercadoLivreItemId: true,
      mercadoLivreLink: true,
    },
  });
  if (!peca) throw new Error('SKU nao encontrado no ANB.');

  if (sistema === 'anb') {
    const prepared = origem === 'manual'
      ? await compressDataUrlImage(manualFotoToDataUrl(imagensManuais[0]), 'a foto capa do ANB')
      : null;
    const drivePrepared = origem === 'drive' ? await prepararFotoCapaAnb(fotosSelecionadas[0], sku) : null;
    const fotoCapaNome = drivePrepared?.fotoCapaNome || normalizeImageFileName(buildAnbFotoCapaNome(sku, prepared?.extension || 'jpg'), prepared?.extension || 'jpg');
    const fotoCapaArquivo = drivePrepared?.fotoCapaArquivo || prepared?.dataUrl || '';
    await prisma.peca.update({
      where: { id: peca.id },
      data: { fotoCapaNome, fotoCapaArquivo },
    });
    return { ok: true, sistema, sku, enviadas: 1, resultados: [{ sistema, nome: fotoCapaNome, ok: true }] };
  }

  if (sistema === 'nuvemshop') {
    const produto = await buscarProdutoNuvemshopPorSku(sku);
    if (!produto?.id) throw new Error('Produto nao encontrado na Nuvemshop.');
    if (origem === 'manual') {
      const resultados = await uploadNuvemshopManual(produto.id, imagensManuais);
      return { ok: true, sistema, sku, enviadas: resultados.filter((item) => item.ok).length, resultados };
    }
    const imagensAtuais = Array.isArray(produto.images) ? produto.images.length : (await listarImagensNuvemshop(produto.id)).length;
    const drive = await buscarFotosDriveSku(peca.motoId, sku);
    const capaDriveId = drive.fotos[0]?.id || '';
    const fotosParaEnviar = imagensAtuais > 0
      ? fotosSelecionadas.filter((foto) => foto.id !== capaDriveId)
      : fotosSelecionadas;
    if (!fotosParaEnviar.length) return { ok: true, sistema, sku, enviadas: 0, resultados: [{ sistema, ok: true, pulada: true, error: 'Capa pulada porque o produto ja possui foto.' }] };
    const resultados = await uploadNuvemshopDrive(produto.id, fotosParaEnviar, 0);
    return { ok: true, sistema, sku, enviadas: resultados.filter((item) => item.ok).length, resultados };
  }

  const itemId = normalizeText(peca.mercadoLivreItemId) || parseMercadoLivreItemId(peca.mercadoLivreLink);
  if (!itemId) throw new Error('Item ID do Mercado Livre nao encontrado no SKU.');
  const item = await mercadoLivreReq(`/items/${encodeURIComponent(itemId)}`);
  const imagensAtuais = Array.isArray(item?.pictures) ? item.pictures.length : 0;
  if (origem === 'manual') {
    const fotosLimitadas = limitarFotosMercadoLivre(imagensManuais, imagensAtuais);
    if (!fotosLimitadas.length) return { ok: true, sistema, sku, enviadas: 0, resultados: [{ sistema, ok: true, pulada: true, error: 'Mercado Livre ja esta com 12 fotos.' }] };
    const resultados = await uploadMercadoLivreManual(itemId, fotosLimitadas);
    return { ok: true, sistema, sku, enviadas: resultados.filter((item) => item.ok).length, resultados };
  }
  const drive = await buscarFotosDriveSku(peca.motoId, sku);
  const capaDriveId = drive.fotos[0]?.id || '';
  const fotosParaEnviar = imagensAtuais > 0
    ? fotosSelecionadas.filter((foto) => foto.id !== capaDriveId)
    : fotosSelecionadas;
  const fotosLimitadas = limitarFotosMercadoLivre(fotosParaEnviar, imagensAtuais);
  if (!fotosParaEnviar.length) return { ok: true, sistema, sku, enviadas: 0, resultados: [{ sistema, ok: true, pulada: true, error: 'Capa pulada porque o anuncio ja possui foto.' }] };
  if (!fotosLimitadas.length) return { ok: true, sistema, sku, enviadas: 0, resultados: [{ sistema, ok: true, pulada: true, error: 'Mercado Livre ja esta com 12 fotos.' }] };
  const resultados = await uploadMercadoLivreDrive(itemId, fotosLimitadas);
  return { ok: true, sistema, sku, enviadas: resultados.filter((item) => item.ok).length, resultados };
}
