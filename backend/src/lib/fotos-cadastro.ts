import { prisma } from './prisma';
import { compressDataUrlImage, normalizeImageFileName } from './image';
import { createHash } from 'crypto';
import { inflateRawSync } from 'zlib';
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

// Leitor de ZIP nativo (sem dependencia externa). Le pela central directory:
// suporta metodo 0 (stored) e 8 (deflate), que e o que o Canva exporta.
function lerEntradasZip(buffer: Buffer): { nome: string; data: Buffer }[] {
  const out: { nome: string; data: Buffer }[] = [];
  // Localiza o End Of Central Directory (assinatura 0x06054b50), varrendo do fim.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo zip invalido (EOCD nao encontrado).');
  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16); // offset da central directory

  for (let n = 0; n < totalEntradas; n += 1) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(p + 10);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const nome = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (nome.endsWith('/')) continue; // diretorio
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lNameLen = buffer.readUInt16LE(localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buffer.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (metodo === 0) data = Buffer.from(comp);
    else if (metodo === 8) { try { data = inflateRawSync(comp); } catch { continue; } }
    else continue; // metodo nao suportado
    out.push({ nome, data });
  }
  return out;
}

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
  return {
    ...cfg,
    googleDriveClientId:     String(cfg.googleDriveClientId     || ''),
    googleDriveClientSecret: String(cfg.googleDriveClientSecret || ''),
    googleDriveRefreshToken: String(cfg.googleDriveRefreshToken || ''),
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

// ===== Varredura das pastas pendentes de tratamento de imagem (alerta WhatsApp) =====
// Uma pasta esta "tratada" quando ja tem alguma foto com nome no padrao (Capa, 01..NN);
// se tem 2+ fotos e NENHUMA no padrao, ainda esta crua (nomes "WhatsApp Image ...").
function ehNomeFotoTratada(nome: string) {
  const base = normalizeText(nome).replace(/\.[^.]+$/, '').trim();
  if (!base) return false;
  return /capa/i.test(base) || /^\d{1,2}$/.test(base);
}

function extrairSkuDaPasta(nome: string) {
  const n = normalizeText(nome);
  const m = n.match(/^([A-Za-z0-9]+_\d+)/);
  if (m) return m[1].toUpperCase();
  return n.split(/\s*[-–—]\s*/)[0].trim().toUpperCase();
}

export type PastaPendenteTratamento = { sku: string; nome: string; totalFotos: number };

export async function listarPastasPendentesTratamento(): Promise<PastaPendenteTratamento[]> {
  const cfg = await getGoogleDriveConfig();
  const pastaRaizId = normalizeText((cfg as any).googleDrivePreCadastroPastaId);
  if (!pastaRaizId) return [];

  const pastas = await listDriveFiles(
    `'${escapeDriveQueryValue(pastaRaizId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'files(id,name)',
  );

  const pendentes: PastaPendenteTratamento[] = [];
  for (const pasta of pastas) {
    const fotos = await listDriveFiles(
      `'${escapeDriveQueryValue(pasta.id)}' in parents and mimeType contains 'image/' and trashed = false`,
      'files(id,name)',
    );
    if (fotos.length < 2) continue;                       // precisa de 2+ fotos
    if (fotos.some((f: any) => ehNomeFotoTratada(f.name))) continue; // ja tratada
    pendentes.push({ sku: extrairSkuDaPasta(pasta.name), nome: normalizeText(pasta.name), totalFotos: fotos.length });
  }
  return pendentes;
}

// Requisicao ao Drive com metodo arbitrario (ex.: DELETE), com refresh de token.
async function driveRequest(path: string, init: any) {
  const execute = (token: string) => fetch(`${GOOGLE_DRIVE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
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

// Localiza a pasta de um SKU dentro da raiz do Pre-Cadastro e conta as fotos.
export async function getPastaPreCadastroDoSku(sku: string): Promise<{ pastaId: string | null; nome: string; fotos: number }> {
  const cfg = await getGoogleDriveConfig();
  const pastaRaizId = normalizeText((cfg as any).googleDrivePreCadastroPastaId);
  const skuUpper = normalizeText(sku).toUpperCase();
  if (!pastaRaizId || !skuUpper) return { pastaId: null, nome: '', fotos: 0 };

  const pastas = await listDriveFiles(
    `'${escapeDriveQueryValue(pastaRaizId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${escapeDriveQueryValue(skuUpper)}' and trashed = false`,
    'files(id,name)',
  );
  const pasta = pastas.find((p: any) => normalizeText(p.name).toUpperCase().startsWith(skuUpper)) || null;
  if (!pasta) return { pastaId: null, nome: '', fotos: 0 };

  const fotos = await listDriveFiles(
    `'${escapeDriveQueryValue(pasta.id)}' in parents and mimeType contains 'image/' and trashed = false`,
    'files(id)',
  );
  return { pastaId: String(pasta.id), nome: normalizeText(pasta.name), fotos: fotos.length };
}

// Apaga definitivamente uma pasta do Drive pelo id. 404 = ja nao existe (consideramos ok).
export async function apagarPastaDrive(pastaId: string): Promise<boolean> {
  if (!pastaId) return false;
  const resp = await driveRequest(buildDrivePath(`/files/${encodeURIComponent(pastaId)}`, {}), { method: 'DELETE' });
  return resp.ok || resp.status === 204 || resp.status === 404;
}

// ===== Fotos Drive: processamento do zip do Canva por pasta de SKU =====

function ehArquivoZip(nome: string) {
  return /\.zip$/i.test(normalizeText(nome));
}

function mimePorExtensao(nome: string) {
  const ext = normalizeText(nome).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// Baixa qualquer arquivo do Drive como Buffer (zip, imagem, etc).
async function downloadDriveArquivo(fileId: string): Promise<Buffer> {
  const resp = await driveFetch(buildDrivePath(`/files/${encodeURIComponent(fileId)}`, { alt: 'media' }));
  if (!resp.ok) {
    const data: any = await resp.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(data, `Erro ao baixar arquivo ${fileId}`));
  }
  return Buffer.from(await resp.arrayBuffer());
}

// Sobe um arquivo (imagem) para dentro de uma pasta do Drive via upload multipart.
async function uploadArquivoParaPasta(pastaId: string, nome: string, mimeType: string, buffer: Buffer) {
  const metadata = { name: nome, parents: [pastaId] };
  const boundary = `anbparts_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
  const url = `${GOOGLE_DRIVE_UPLOAD_URL}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`;
  const execute = (token: string) => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  let token = await getGoogleDriveToken();
  let resp = await execute(token);
  if (resp.status === 401 || resp.status === 403) {
    await clearGoogleDriveToken();
    token = await getGoogleDriveToken(true);
    resp = await execute(token);
  }
  if (!resp.ok) {
    const data: any = await resp.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(data, `Erro ao subir ${nome} (${resp.status})`));
  }
  return resp.json();
}

// Apaga definitivamente um arquivo do Drive. 404 = ja nao existe (ok).
// Faz retry com backoff em 429/5xx (rate limit). Em 403 nao insiste (provavel falta de permissao).
async function apagarArquivoDrive(fileId: string): Promise<{ ok: boolean; status?: number; erro?: string }> {
  if (!fileId) return { ok: false, erro: 'id vazio' };
  let ultimoErro = '';
  let ultimoStatus = 0;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const resp = await driveRequest(buildDrivePath(`/files/${encodeURIComponent(fileId)}`, {}), { method: 'DELETE' });
    if (resp.ok || resp.status === 204 || resp.status === 404) return { ok: true };
    const data: any = await resp.json().catch(() => ({}));
    ultimoStatus = resp.status;
    ultimoErro = getApiErrorMessage(data, `DELETE ${resp.status}`);
    if (resp.status === 429 || resp.status >= 500) {
      await sleep(700 * (tentativa + 1)); // backoff para rate limit
      continue;
    }
    return { ok: false, status: resp.status, erro: ultimoErro };
  }
  return { ok: false, status: ultimoStatus, erro: ultimoErro || 'falha apos retries' };
}

// Manda o arquivo para a lixeira (PATCH trashed=true). Exige so permissao de edicao
// (nao de dono), entao funciona em arquivos que o usuario do app nao pode apagar de vez.
async function lixeiraArquivoDrive(fileId: string): Promise<{ ok: boolean; erro?: string }> {
  if (!fileId) return { ok: false, erro: 'id vazio' };
  const resp = await driveRequest(
    buildDrivePath(`/files/${encodeURIComponent(fileId)}`, { fields: 'id,trashed' }),
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) },
  );
  if (resp.ok) return { ok: true };
  const data: any = await resp.json().catch(() => ({}));
  return { ok: false, erro: getApiErrorMessage(data, `trash ${resp.status}`) };
}

// Tira o arquivo de uma pasta (PATCH removeParents). E o "inverso" do mover, que funciona
// quando o app tem permissao na pasta. Deixa o arquivo orfao (fora da pasta do SKU).
async function removerDaPastaDrive(fileId: string, pastaId: string): Promise<{ ok: boolean; erro?: string }> {
  const resp = await driveRequest(
    buildDrivePath(`/files/${encodeURIComponent(fileId)}`, { removeParents: pastaId, fields: 'id,parents' }),
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (resp.ok) return { ok: true };
  const data: any = await resp.json().catch(() => ({}));
  return { ok: false, erro: getApiErrorMessage(data, `removeParents ${resp.status}`) };
}

// Remove um arquivo da pasta do SKU, na ordem mais "forte" para a mais "fraca":
// 1) apagar de vez  2) lixeira  3) tirar da pasta (removeParents). Garante pasta final limpa.
async function removerArquivoDrive(fileId: string, pastaId: string): Promise<{ ok: boolean; via?: 'delete' | 'lixeira' | 'removeParents'; erro?: string }> {
  const del = await apagarArquivoDrive(fileId);
  if (del.ok) return { ok: true, via: 'delete' };
  const tr = await lixeiraArquivoDrive(fileId);
  if (tr.ok) return { ok: true, via: 'lixeira' };
  const rp = await removerDaPastaDrive(fileId, pastaId);
  if (rp.ok) return { ok: true, via: 'removeParents' };
  return { ok: false, erro: del.erro || tr.erro || rp.erro };
}

// Move uma pasta: adiciona o novo parent (pasta da moto) e remove o atual (raiz pendente).
async function moverPastaDrive(pastaId: string, addParent: string, removeParent: string): Promise<boolean> {
  const resp = await driveRequest(
    buildDrivePath(`/files/${encodeURIComponent(pastaId)}`, { addParents: addParent, removeParents: removeParent, fields: 'id,parents' }),
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  return resp.ok;
}

// Resolve a pasta oficial da moto a partir do SKU (via motoId no banco -> googleDriveMotoDirs).
async function resolverPastaMotoDoSku(sku: string): Promise<{ motoId: number | null; pastaMotoId: string | null }> {
  const base = baseSku(sku);
  if (!base) return { motoId: null, pastaMotoId: null };
  const peca = await prisma.peca.findFirst({ where: { idPeca: base }, select: { motoId: true } })
    || await prisma.cadastroPeca.findFirst({ where: { idPeca: base }, select: { motoId: true } });
  const motoId = peca?.motoId ?? null;
  if (!motoId) return { motoId: null, pastaMotoId: null };
  const cfg = await getGoogleDriveConfig();
  const motoDirs = ((cfg as any).googleDriveMotoDirs as any) || {};
  const pastaMotoId = normalizeText(motoDirs[String(motoId)]);
  return { motoId, pastaMotoId: pastaMotoId || null };
}

export type FotoDrivePastaCandidata = {
  pastaId: string;
  nome: string;
  sku: string;
  fotosForaPadrao: number;
  zips: number;
};

// Varre a raiz do Pre-Cadastro e devolve as pastas que se qualificam:
// tem >=2 imagens fora do padrao (Capa/NN) E pelo menos 1 arquivo .zip.
// Filtros opcionais: sku (so a pasta daquele SKU) e intervalo de data de criacao.
export async function escanearFotosDrive(input: { sku?: any; dataDe?: any; dataAte?: any }): Promise<{ ok: boolean; pastas: FotoDrivePastaCandidata[]; total: number }> {
  const cfg = await getGoogleDriveConfig();
  const pastaRaizId = normalizeText((cfg as any).googleDrivePreCadastroPastaId);
  if (!pastaRaizId) return { ok: false, pastas: [], total: 0 };

  const skuFiltro = normalizeSku(input?.sku);
  const dataDe = normalizeText(input?.dataDe);
  const dataAte = normalizeText(input?.dataAte);

  let q = `'${escapeDriveQueryValue(pastaRaizId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (skuFiltro) q += ` and name contains '${escapeDriveQueryValue(skuFiltro)}'`;
  if (dataDe) q += ` and createdTime >= '${escapeDriveQueryValue(dataDe)}T00:00:00'`;
  if (dataAte) q += ` and createdTime <= '${escapeDriveQueryValue(dataAte)}T23:59:59'`;

  const pastas = await listDriveFiles(q, 'files(id,name,createdTime)', { orderBy: 'createdTime desc' });

  const candidatas: FotoDrivePastaCandidata[] = [];
  for (const pasta of pastas) {
    if (skuFiltro && !normalizeText(pasta.name).toUpperCase().startsWith(skuFiltro)) continue;
    const arquivos = await listDriveFiles(
      `'${escapeDriveQueryValue(pasta.id)}' in parents and trashed = false`,
      'files(id,name,mimeType)',
    );
    const imagens = arquivos.filter((f: any) => normalizeText(f.mimeType).startsWith('image/'));
    const zips = arquivos.filter((f: any) => ehArquivoZip(f.name));
    const foraPadrao = imagens.filter((f: any) => !ehNomeFotoTratada(f.name));
    if (zips.length >= 1 && foraPadrao.length >= 2) {
      candidatas.push({
        pastaId: String(pasta.id),
        nome: normalizeText(pasta.name),
        sku: extrairSkuDaPasta(pasta.name),
        fotosForaPadrao: foraPadrao.length,
        zips: zips.length,
      });
    }
  }
  return { ok: true, pastas: candidatas, total: candidatas.length };
}

export type FotoDriveEtapa = 'ok' | 'erro' | 'pulado' | 'pendente';
export type FotoDriveResultado = {
  pastaId: string;
  sku: string;
  nome: string;
  status: 'processando' | 'processado' | 'erro';
  mensagem: string;
  etapas: {
    extrairZip: FotoDriveEtapa;
    descartarBrancos: FotoDriveEtapa;
    gravarFotos: FotoDriveEtapa;
    limparAntigas: FotoDriveEtapa;
    moverPasta: FotoDriveEtapa;
  };
  fotosGravadas: number;
  brancosDescartados: number;
};

// Cria o objeto de progresso inicial (usado tambem pelo job em segundo plano).
export function novoResultadoFotoDrive(pastaId: string): FotoDriveResultado {
  return {
    pastaId, sku: '', nome: '', status: 'processando', mensagem: '', fotosGravadas: 0, brancosDescartados: 0,
    etapas: { extrairZip: 'pendente', descartarBrancos: 'pendente', gravarFotos: 'pendente', limparAntigas: 'pendente', moverPasta: 'pendente' },
  };
}

// Processa UMA pasta de SKU: extrai o zip, descarta brancos, grava as fotos boas, apaga as antigas
// + zip e move a pasta para a pasta oficial da moto. Muta `resultado` ao longo do caminho para que
// o progresso seja observavel por polling (job em segundo plano).
export async function processarPastaFotosDrive(pastaId: string, resultado: FotoDriveResultado = novoResultadoFotoDrive(pastaId)): Promise<FotoDriveResultado> {
  const etapas = resultado.etapas;

  try {
    const cfg = await getGoogleDriveConfig();
    const pastaRaizId = normalizeText((cfg as any).googleDrivePreCadastroPastaId);

    // Metadados da pasta.
    const meta = await driveGet(buildDrivePath(`/files/${encodeURIComponent(pastaId)}`, { fields: 'id,name' }));
    resultado.nome = normalizeText(meta?.name);
    resultado.sku = extrairSkuDaPasta(resultado.nome);

    // Valida a pasta da moto ANTES de qualquer acao destrutiva.
    const { pastaMotoId } = await resolverPastaMotoDoSku(resultado.sku);
    if (!pastaMotoId) {
      resultado.status = 'erro';
      resultado.mensagem = `Sem pasta da moto configurada para o SKU ${resultado.sku} (verifique o cadastro do SKU e o mapeamento da moto). Nada foi alterado.`;
      return resultado;
    }

    // Lista o conteudo atual da pasta.
    const arquivos = await listDriveFiles(
      `'${escapeDriveQueryValue(pastaId)}' in parents and trashed = false`,
      'files(id,name,mimeType)',
    );
    const zips = arquivos.filter((f: any) => ehArquivoZip(f.name));
    if (!zips.length) {
      resultado.status = 'erro';
      resultado.mensagem = 'Nenhum arquivo .zip encontrado na pasta.';
      return resultado;
    }
    const idsOriginais = arquivos.map((f: any) => String(f.id)); // tudo que existia antes (fotos antigas + zip)

    // 1) Extrair zip.
    let entradasImagens: { nome: string; buffer: Buffer; hash: string }[] = [];
    try {
      const zipBuffer = await downloadDriveArquivo(zips[0].id);
      const entries = lerEntradasZip(zipBuffer);
      for (const e of entries) {
        const nome = String(e.nome || '').split('/').pop() || '';
        if (!/\.(png|jpe?g|webp)$/i.test(nome)) continue;
        const buffer = e.data;
        if (!buffer || !buffer.length) continue;
        entradasImagens.push({ nome, buffer, hash: createHash('md5').update(buffer).digest('hex') });
      }
      if (!entradasImagens.length) {
        etapas.extrairZip = 'erro';
        resultado.status = 'erro';
        resultado.mensagem = 'O zip nao contem imagens validas.';
        return resultado;
      }
      etapas.extrairZip = 'ok';
    } catch (err: any) {
      etapas.extrairZip = 'erro';
      resultado.status = 'erro';
      resultado.mensagem = `Falha ao extrair o zip: ${err?.message || err}`;
      return resultado;
    }

    // 2) Descartar brancos do template: imagens do Canva com EXATAMENTE o mesmo tamanho em bytes
    // (repetido 2+ vezes) e pequenas (bem menores que a maior foto). Tambem pega as byte-a-byte
    // identicas (hash repetido). Fotos reais tem tamanho unico, entao nao sao afetadas.
    const contagemTam = new Map<number, number>();
    const contagemHash = new Map<string, number>();
    for (const e of entradasImagens) {
      contagemTam.set(e.buffer.length, (contagemTam.get(e.buffer.length) || 0) + 1);
      contagemHash.set(e.hash, (contagemHash.get(e.hash) || 0) + 1);
    }
    const maiorTam = Math.max(...entradasImagens.map((e) => e.buffer.length));
    const ehBranco = (e: { buffer: Buffer; hash: string }) => {
      const mesmoTamRepetido = (contagemTam.get(e.buffer.length) || 0) >= 2 && e.buffer.length < maiorTam * 0.6;
      const mesmoConteudoRepetido = (contagemHash.get(e.hash) || 0) >= 2;
      return mesmoTamRepetido || mesmoConteudoRepetido;
    };
    const boas = entradasImagens.filter((e) => !ehBranco(e));
    resultado.brancosDescartados = entradasImagens.length - boas.length;
    etapas.descartarBrancos = 'ok';
    if (!boas.length) {
      etapas.gravarFotos = 'erro';
      resultado.status = 'erro';
      resultado.mensagem = 'Todas as imagens do zip foram identificadas como brancos do template. Nada a gravar.';
      return resultado;
    }

    // 3) Gravar as fotos boas na pasta (antes de apagar qualquer coisa).
    try {
      for (let i = 0; i < boas.length; i += 1) {
        const e = boas[i];
        await uploadArquivoParaPasta(pastaId, e.nome, mimePorExtensao(e.nome), e.buffer);
        await pauseUploadBatch(i);
      }
      resultado.fotosGravadas = boas.length;
      etapas.gravarFotos = 'ok';
    } catch (err: any) {
      etapas.gravarFotos = 'erro';
      resultado.status = 'erro';
      resultado.mensagem = `Falha ao gravar fotos do zip (nada foi apagado): ${err?.message || err}`;
      return resultado;
    }

    // 4) Limpar antigas: remove tudo que existia antes (fotos antigas + zip).
    // Tenta apagar de vez; se nao tiver permissao, manda pra lixeira. Espaca para evitar rate limit.
    let falhasDelete = 0;
    let foiPraLixeira = 0;
    let primeiroErroDelete = '';
    for (const id of idsOriginais) {
      const r = await removerArquivoDrive(id, pastaId).catch((e: any) => ({ ok: false, erro: e?.message || String(e) } as any));
      if (!r.ok) {
        falhasDelete += 1;
        if (!primeiroErroDelete) primeiroErroDelete = r.erro || '';
      } else if (r.via === 'lixeira' || r.via === 'removeParents') {
        foiPraLixeira += 1;
      }
      await sleep(200);
    }
    etapas.limparAntigas = falhasDelete ? 'erro' : 'ok';
    if (falhasDelete && primeiroErroDelete) resultado.mensagem = `Limpar antigas: ${primeiroErroDelete}`;

    // 5) Mover a pasta para a pasta oficial da moto.
    try {
      const moved = await moverPastaDrive(pastaId, pastaMotoId, pastaRaizId);
      etapas.moverPasta = moved ? 'ok' : 'erro';
      if (!moved) {
        resultado.status = 'erro';
        resultado.mensagem = 'Fotos processadas, mas falhou ao mover a pasta para a moto.';
        return resultado;
      }
    } catch (err: any) {
      etapas.moverPasta = 'erro';
      resultado.status = 'erro';
      resultado.mensagem = `Fotos processadas, mas falhou ao mover a pasta: ${err?.message || err}`;
      return resultado;
    }

    resultado.status = 'processado';
    if (falhasDelete) {
      resultado.mensagem = `Processado, mas ${falhasDelete} arquivo(s) antigo(s) nao puderam ser removidos${primeiroErroDelete ? `: ${primeiroErroDelete}` : '.'}`;
    } else if (foiPraLixeira) {
      resultado.mensagem = `Processado. ${foiPraLixeira} arquivo(s) antigo(s) foram para a lixeira (sem permissao para apagar de vez).`;
    } else {
      resultado.mensagem = 'Processado com sucesso.';
    }
    return resultado;
  } catch (err: any) {
    resultado.status = 'erro';
    resultado.mensagem = err?.message || String(err);
    return resultado;
  }
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

async function resizeForNuvemshop(buffer: Buffer): Promise<string> {
  try {
    const jimpModule: any = await import('jimp');
    const Jimp = jimpModule?.Jimp || jimpModule?.default?.Jimp || jimpModule?.default || jimpModule;
    if (!Jimp?.read && !Jimp?.fromBuffer) return buffer.toString('base64');
    const image = Jimp.fromBuffer ? await Jimp.fromBuffer(buffer) : await Jimp.read(buffer);
    const MAX = 1280;
    const w = Number(image?.bitmap?.width || 0);
    const h = Number(image?.bitmap?.height || 0);
    if (w > MAX || h > MAX) {
      if (w >= h) image.resize({ w: MAX });
      else image.resize({ h: MAX });
    }
    const out = Buffer.from(await image.getBuffer('image/jpeg', { quality: 82 }));
    return out.toString('base64');
  } catch {
    return buffer.toString('base64');
  }
}

async function uploadNuvemshopDrive(produtoId: number | string, fotos: DriveFoto[], imagensAtuais: number) {
  const fotosParaEnviar = imagensAtuais > 0 ? fotos.slice(1) : fotos;
  const proximaPosicaoBase = imagensAtuais + 1;

  // Download + resize all photos in parallel to avoid sequential Drive latency
  const downloads = await Promise.all(
    fotosParaEnviar.map(async (foto) => {
      try {
        const downloaded = await downloadDriveFoto(foto);
        const base64 = await resizeForNuvemshop(downloaded.buffer);
        return { foto, base64, ok: true as const, error: '' };
      } catch (e: any) {
        return { foto, base64: '', ok: false as const, error: e?.message || String(e) };
      }
    }),
  );

  const resultados: any[] = [];
  let proximaPosicao = proximaPosicaoBase;

  for (const dl of downloads) {
    if (!dl.ok) {
      resultados.push({ sistema: 'nuvemshop', nome: dl.foto.nome, ok: false, error: dl.error });
      continue;
    }
    try {
      const data = await nuvemReq<any>(`/products/${encodeURIComponent(String(produtoId))}/images`, {
        method: 'POST',
        body: JSON.stringify({
          attachment: dl.base64,
          filename: dl.foto.nome || 'foto.jpg',
          position: proximaPosicao,
        }),
      });
      resultados.push({ sistema: 'nuvemshop', nome: dl.foto.nome, ok: true, id: data?.id, position: proximaPosicao });
      proximaPosicao++;
      await pauseUploadBatch(resultados.length - 1);
    } catch (e: any) {
      resultados.push({ sistema: 'nuvemshop', nome: dl.foto.nome, ok: false, error: e?.message || String(e) });
    }
  }

  return resultados;
}

async function uploadNuvemshopManual(produtoId: number | string, fotos: ManualFoto[]) {
  let proximaPosicao = 1;
  try {
    const imagens = await listarImagensNuvemshop(produtoId);
    proximaPosicao = imagens.reduce((max, img) => Math.max(max, Number(img?.position || 0) || 0), 0) + 1;
  } catch {
    // Falha ao listar imagens existentes — começa da posição 1
  }
  const resultados: any[] = [];

  for (const foto of fotos) {
    try {
      const rawBase64 = manualFotoToBase64(foto);
      const rawBuffer = Buffer.from(rawBase64, 'base64');
      const base64 = await resizeForNuvemshop(rawBuffer);
      const data = await nuvemReq<any>(`/products/${encodeURIComponent(String(produtoId))}/images`, {
        method: 'POST',
        body: JSON.stringify({
          attachment: base64,
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
    return {
      ok: true,
      sistema,
      sku,
      enviadas: 1,
      resultados: [{
        sistema,
        nome: origem === 'manual' ? imagensManuais[0]?.nome : fotosSelecionadas[0]?.nome,
        filename: fotoCapaNome,
        ok: true,
      }],
    };
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

async function contarFotosPreCadastroPastaRaiz(sku: string): Promise<number> {
  const cfg = await getConfiguracaoGeral();
  const pastaRaizId = normalizeText((cfg as any).googleDrivePreCadastroPastaId);
  if (!pastaRaizId) return 0;
  const skuUpper = normalizeSku(sku);
  const pastas = await listDriveFiles(
    `'${escapeDriveQueryValue(pastaRaizId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${escapeDriveQueryValue(skuUpper)}' and trashed = false`,
    'files(id,name)',
    { pageSize: '50' },
  );
  const pasta = pastas.find((p: any) => normalizeText(p.name).toUpperCase().startsWith(skuUpper));
  if (!pasta) return 0;
  const fotos = await listDriveFiles(
    `'${escapeDriveQueryValue(pasta.id)}' in parents and mimeType contains 'image/' and trashed = false`,
    'files(id)',
    { pageSize: '10' },
  );
  return fotos.length;
}

export async function verificarFotosCadastroPeca(motoId: number, sku: string): Promise<number> {
  const [driveResult, preCadastroCount] = await Promise.allSettled([
    buscarFotosDriveSku(motoId, sku),
    contarFotosPreCadastroPastaRaiz(sku),
  ]);
  const motoCount = driveResult.status === 'fulfilled' ? driveResult.value.fotos.length : 0;
  const preCount  = preCadastroCount.status === 'fulfilled' ? preCadastroCount.value : 0;
  return Math.max(motoCount, preCount);
}
