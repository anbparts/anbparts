'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { formatEtiquetaMotoLabel, printSkuLabels } from '@/lib/estoque-label-print';
import { compressFotoCapaFile } from '@/lib/image-compression';
import { canProcessAction } from '@/lib/permissions';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2, display: 'block' },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 12.5, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  badge: (color: string, bg: string, border: string) => ({ fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, padding: '2px 8px', borderRadius: 12 }),
  th: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '10px 12px', textAlign: 'left' as const, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const },
  td: { fontSize: 13, color: 'var(--gray-700)', padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const DETRAN_TIPOS = [
  'Balança', 'Banco', 'Bengala direita', 'Bengala esquerda', 'Bloco do motor',
  'Cabeçote', 'Carburador', 'Carenagem direita', 'Carenagem esquerda',
  'Carenagem frontal', 'Carenagem traseira', 'Estribo', 'Farol',
  'Guidão / semi-guidão', 'Lanterna', 'Mesa', 'Módulo de injeção/CDI',
  'Motor de arranque', 'Painel', 'Para-lama dianteiro', 'Para-lama traseiro',
  'Pedaleira direita', 'Pedaleira esquerda', 'Retrovisor direito',
  'Retrovisor esquerdo', 'Roda dianteira', 'Roda traseira', 'Tanque',
  'Cardã', 'Cavalete lateral', 'Corpo de injeção', 'Diferencial',
  'Escapamento', 'Radiador',
];

function parseEtiquetaCartela(etq: string) {
  const normalized = etq.replace(/\s+/g, '').toUpperCase();
  const match = normalized.match(/^(.*?)(\d{3})$/);
  if (!match) return null;
  const pos = Number(match[2]);
  if (pos < 1 || pos > 34) return null;
  return { tipo: DETRAN_TIPOS[pos - 1], posicao: pos };
}

type CadastroPeca = {
  id: number; motoId: number; idPeca: string; descricao: string;
  descricaoPeca?: string; precoVenda: number; condicao: string;
  peso?: number; largura?: number; altura?: number; profundidade?: number;
  numeroPeca?: string; detranEtiqueta?: string; tipoPecaAvulsa?: string; localizacao?: string;
  estoque: number; categoriaMLId?: string; categoriaMLNome?: string;
  urlRef?: string; fotoCapa?: string; fotoCapaNome?: string; status: string; blingProdutoId?: string;
  createdAt?: string;
  updatedAt?: string;
  moto: { id: number; marca: string; modelo: string; ano?: number; descricaoModelo?: string };
};

type CadastroFotosLinha = {
  sku: string;
  descricao: string;
  motoId: number;
  moto?: { marca: string; modelo: string; ano?: number };
  anb: { fotos: number; ok: boolean };
  ml: { fotos: number; encontrado: boolean; itemId?: string | null; erro?: string };
  nuvemshop: { fotos: number; encontrado: boolean; produtoId?: number | null; erro?: string };
  flags: { anb: boolean; ml: boolean; nuvemshop: boolean };
  temFlag: boolean;
  drive?: { fotos: number | null; pasta?: string };
  status?: string;
};

type CadastroFotosSistema = 'anb' | 'ml' | 'nuvemshop';
type CadastroFotoDrive = { id: string; nome: string; mimeType: string; size?: string | number | null };
type CadastroFotoManualLocal = { id: string; nome: string; dataUrl: string; base64: string; mimeType: string; status?: 'aguardando' | 'enviando' | 'ok' | 'erro'; erro?: string };
type CategoriaNuvemshop = { id: number; nome?: string; name?: any; parent_id?: number | null };
type CadastroCategoriaLinha = {
  sku: string;
  titulo: string;
  moto: { marca?: string; modelo?: string; ano?: number } | null;
  encontradoNuvemshop: boolean;
  produtoId: number | null;
  categorias: { id: number; nome: string }[];
  tags: string[];
  semCategoria: boolean;
  semTags: boolean;
  temFlag: boolean;
  status: 'pendente' | 'ok' | 'erro' | 'nao-encontrado';
  erroConsulta?: string;
};
type CadastroCategoriaSugestao = { sku: string; categorias: { id: number; nome: string }[]; tags: string[] };

const FOTOS_SISTEMAS_PROCESSAMENTO: CadastroFotosSistema[] = ['anb', 'ml', 'nuvemshop'];
const FOTOS_SISTEMA_LABEL: Record<CadastroFotosSistema, string> = {
  anb: 'ANB',
  ml: 'Mercado Livre',
  nuvemshop: 'Nuvemshop',
};
const CATEGORIA_PACOTES_STORAGE_KEY = 'anb.cadastro.categoria.pacotes';

const EMPTY_FORM = {
  motoId: '', idPeca: '', descricao: '', descricaoPeca: '', precoVenda: '', sufixoTitulo: '',
  condicao: 'usado', peso: '', largura: '', altura: '', profundidade: '',
  numeroPeca: '', detranEtiqueta: '', tipoPecaAvulsa: '', localizacao: '', estoque: '1',
  categoriaMLId: '', categoriaMLNome: '', urlRef: '', fotoCapa: '', fotoCapaNome: '',
};

async function readApiResponse(resp: Response, fallback: string) {
  const text = await resp.text().catch(() => '');
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!resp.ok || data.ok === false) {
    const rawMessage = data.error || data.message || text || fallback;
    const cleanMessage = String(rawMessage).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(cleanMessage || `${fallback} (${resp.status})`);
  }
  return data;
}

function camposOk(form: any) {
  return !!(form.motoId && form.idPeca && form.descricao && form.precoVenda &&
    form.peso && form.largura && form.altura && form.profundidade &&
    form.localizacao && form.numeroPeca && form.estoque && form.categoriaMLId);
}

function ordenarFotosLinhas(linhas: CadastroFotosLinha[]) {
  return [...linhas].sort((a, b) => {
    if (a.temFlag !== b.temFlag) return a.temFlag ? -1 : 1;
    return a.sku.localeCompare(b.sku, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

function formatDateBr(value?: string | Date | null) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function normalizarListaSkus(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((sku) => sku.trim().replace(/^"+|"+$/g, '').toUpperCase())
    .filter(Boolean);
}

function clampPacote(value: number, fallback: number) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

function normalizarLinhaCategoria(produto: any): CadastroCategoriaLinha {
  const encontradoNuvemshop = !!produto.encontradoNuvemshop;
  const semCategoria = !!produto.semCategoria;
  const semTags = !!produto.semTags;
  const temFlag = encontradoNuvemshop && (semCategoria || semTags);
  return {
    sku: String(produto.sku || '').trim().toUpperCase(),
    titulo: String(produto.titulo || produto.descricao || ''),
    moto: produto.moto || null,
    encontradoNuvemshop,
    produtoId: produto.produtoId || null,
    categorias: Array.isArray(produto.categorias) ? produto.categorias : [],
    tags: Array.isArray(produto.tags) ? produto.tags : [],
    semCategoria,
    semTags,
    temFlag,
    status: produto.erroConsulta ? 'erro' : (!encontradoNuvemshop ? 'nao-encontrado' : (temFlag ? 'pendente' : 'ok')),
    erroConsulta: produto.erroConsulta,
  };
}

function ordenarCategoriaLinhas(linhas: CadastroCategoriaLinha[]) {
  const pesoStatus: Record<string, number> = { pendente: 0, erro: 1, 'nao-encontrado': 2, ok: 3 };
  return [...linhas].sort((a, b) => {
    const pesoA = pesoStatus[a.status] ?? 9;
    const pesoB = pesoStatus[b.status] ?? 9;
    if (pesoA !== pesoB) return pesoA - pesoB;
    return a.sku.localeCompare(b.sku, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

function dividirEmLotes<T>(itens: T[], tamanho = 4) {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

function ChecklistValidacao({ form }: { form: any }) {
  const campos = [
    { key: 'motoId', label: 'Moto' },
    { key: 'idPeca', label: 'ID Peça (SKU)' },
    { key: 'descricao', label: 'Descrição (título)' },
    { key: 'precoVenda', label: 'Preço de Venda' },
    { key: 'estoque', label: 'Estoque' },
    { key: 'peso', label: 'Peso' },
    { key: 'largura', label: 'Largura' },
    { key: 'altura', label: 'Altura' },
    { key: 'profundidade', label: 'Profundidade' },
    { key: 'localizacao', label: 'Localização' },
    { key: 'numeroPeca', label: 'Número da Peça' },
    { key: 'categoriaMLId', label: 'Categoria ML' },
  ];
  const invalidos = campos.filter(c => !form[c.key]);
  if (invalidos.length === 0) return null;
  return (
    <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Campos pendentes:</div>
      {invalidos.map((c: any) => (
        <div key={c.key} style={{ color: '#dc2626', marginBottom: 2 }}>
          ✗ {c.label}
        </div>
      ))}
    </div>
  );
}

function getDetranEtiquetasResumo(etiquetas: string[], estoque: any) {
  const qtdEstoque = Math.max(1, Number(estoque) || 1);
  const preenchidas = etiquetas.filter((e) => String(e || '').trim()).length;
  const faltantes = Math.max(0, qtdEstoque - preenchidas);
  const excedentes = Math.max(0, preenchidas - qtdEstoque);
  const possuiAlguma = preenchidas > 0;

  return {
    qtdEstoque,
    preenchidas,
    faltantes,
    excedentes,
    possuiAlguma,
    invalida: possuiAlguma && (faltantes > 0 || excedentes > 0),
  };
}

function buildCadastroSkuEtiquetas(item: CadastroPeca) {
  const quantidade = Math.max(1, Number(item.estoque) || 1);
  const skuAtual = String(item.idPeca || '').trim().toUpperCase();
  const skuBase = skuAtual.replace(/-\d+$/, '');
  const skuInicial = quantidade > 1 ? skuBase : skuAtual;
  const motoLabel = formatEtiquetaMotoLabel(item);
  const descricao = String(item.descricao || '').trim();

  return Array.from({ length: quantidade }, (_, index) => ({
    motoLabel,
    sku: index === 0 ? skuInicial : `${skuBase}-${index + 1}`,
    descricao,
  }));
}

export default function CadastroPage() {
  const { user } = useAuth();
  const [motos, setMotos] = useState<any[]>([]);
  const [caixas, setCaixas] = useState<string[]>([]);
  const [data, setData] = useState<{ total: number; data: CadastroPeca[] }>({ total: 0, data: [] });
  const [loading, setLoading] = useState(true);
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [filters, setFilters] = useState({ motoId: '', search: '', semDimensoes: '' });
  const [searchInput, setSearchInput] = useState('');
  const [paginaCadastro, setPaginaCadastro] = useState<'sku' | 'fotos' | 'categoria'>('sku');
  const hoje = new Date().toISOString().slice(0, 10);
  const [fotosModo, setFotosModo] = useState<'skus' | 'data'>('data');
  const [fotosSkusInput, setFotosSkusInput] = useState('');
  const [fotosDataDe, setFotosDataDe] = useState(hoje);
  const [fotosDataAte, setFotosDataAte] = useState(hoje);
  const [fotosLinhas, setFotosLinhas] = useState<CadastroFotosLinha[]>([]);
  const [fotosSelecionados, setFotosSelecionados] = useState<Set<string>>(new Set());
  const [fotosBuscando, setFotosBuscando] = useState(false);
  const [fotosProcessando, setFotosProcessando] = useState(false);
  const [fotosProcessandoSku, setFotosProcessandoSku] = useState('');
  const [fotosProcessandoSistema, setFotosProcessandoSistema] = useState<CadastroFotosSistema | ''>('');
  const [fotosResultado, setFotosResultado] = useState('');
  const [fotosBuscaStatus, setFotosBuscaStatus] = useState('');
  const [fotosBuscaProgresso, setFotosBuscaProgresso] = useState({ atual: 0, total: 0 });
  const [fotoManualModal, setFotoManualModal] = useState<{
    linha: CadastroFotosLinha;
    sistema: CadastroFotosSistema;
    fotos: CadastroFotoDrive[];
    imagens: CadastroFotoManualLocal[];
    origem: 'drive' | 'manual';
    selecionadas: Set<string>;
    carregando: boolean;
    enviando: boolean;
    status: { nome: string; status: 'aguardando' | 'enviando' | 'ok' | 'erro' | 'pulada'; erro?: string }[];
  } | null>(null);
  const [categoriaModo, setCategoriaModo] = useState<'data' | 'skus'>('data');
  const [categoriaSkusInput, setCategoriaSkusInput] = useState('');
  const [categoriaDataDe, setCategoriaDataDe] = useState(hoje);
  const [categoriaDataAte, setCategoriaDataAte] = useState(hoje);
  const [categoriaLinhas, setCategoriaLinhas] = useState<CadastroCategoriaLinha[]>([]);
  const [categoriaSelecionados, setCategoriaSelecionados] = useState<Set<string>>(new Set());
  const [categoriaBuscando, setCategoriaBuscando] = useState(false);
  const [categoriaProcessando, setCategoriaProcessando] = useState(false);
  const [categoriaSkuProcessando, setCategoriaSkuProcessando] = useState('');
  const [categoriaResultado, setCategoriaResultado] = useState('');
  const [categoriaStatus, setCategoriaStatus] = useState('');
  const [categoriaFase, setCategoriaFase] = useState('');
  const [categoriaProgresso, setCategoriaProgresso] = useState({ atual: 0, total: 0 });
  const [categoriaPacoteIa, setCategoriaPacoteIa] = useState(20);
  const [categoriaPacoteNuvemshop, setCategoriaPacoteNuvemshop] = useState(20);
  const [categoriaPacoteSalvoMsg, setCategoriaPacoteSalvoMsg] = useState('');
  const [categoriasNuvemshop, setCategoriasNuvemshop] = useState<CategoriaNuvemshop[]>([]);
  const [categoriaSugestoes, setCategoriaSugestoes] = useState<Record<string, CadastroCategoriaSugestao>>({});
  const [viewportMode, setViewportMode] = useState<'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop'>('desktop');

  useEffect(() => {
    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');
    const sync = () => {
      if (phoneMedia.matches) { setViewportMode('phone'); return; }
      if (tabletPortraitMedia.matches) { setViewportMode('tablet-portrait'); return; }
      if (tabletLandscapeMedia.matches) { setViewportMode('tablet-landscape'); return; }
      setViewportMode('desktop');
    };
    sync();
    phoneMedia.addEventListener('change', sync);
    tabletPortraitMedia.addEventListener('change', sync);
    tabletLandscapeMedia.addEventListener('change', sync);
    return () => {
      phoneMedia.removeEventListener('change', sync);
      tabletPortraitMedia.removeEventListener('change', sync);
      tabletLandscapeMedia.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CATEGORIA_PACOTES_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      setCategoriaPacoteIa(clampPacote(Number(data?.ia), 20));
      setCategoriaPacoteNuvemshop(clampPacote(Number(data?.nuvemshop), 20));
    } catch {
      // Se a configuracao local estiver corrompida, mantem o padrao.
    }
  }, []);

  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const isMobile = isPhone || isTabletPortrait;
  const canCriarPreCadastro = canProcessAction(user, 'cadastro', 'criar_pre_cadastro');
  const canEditarPreCadastro = canProcessAction(user, 'cadastro', 'editar_pre_cadastro');
  const canCriarProdutoBling = canProcessAction(user, 'cadastro', 'criar_bling');
  const canEnviarFotos = canProcessAction(user, 'cadastro', 'enviar_fotos');
  const canProcessarCategoria = canProcessAction(user, 'cadastro', 'processar_categoria');

  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<CadastroPeca | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [buscandoCategoria, setBuscandoCategoria] = useState(false);
  const categoriaTimerRef = useRef<any>(null);
  const descricaoPecaTituloRef = useRef<HTMLInputElement | null>(null);
  const descricaoPecaEditorRef = useRef<HTMLDivElement | null>(null);
  const [modalFinalizar, setModalFinalizar] = useState(false);
  const [itemFinalizar, setItemFinalizar] = useState<CadastroPeca | null>(null);
  const [previewBling, setPreviewBling] = useState<any>(null);
  const [previewDiff, setPreviewDiff] = useState<any>({});
  const [previewFrete, setPreviewFrete] = useState(29.9);
  const [previewTaxa, setPreviewTaxa] = useState(17);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [etiquetas, setEtiquetas] = useState<string[]>(['']); // array de etiquetas detran
  const [imprimindoItemId, setImprimindoItemId] = useState<number | null>(null);
  const [eliminandoLinhaId, setEliminandoLinhaId] = useState<number | null>(null);
  const [uploadingFotoCapa, setUploadingFotoCapa] = useState(false);
  const [fotoPreviewOpen, setFotoPreviewOpen] = useState(false);
  const [finalizarFotoCapa, setFinalizarFotoCapa] = useState('');
  const [finalizarFotoCapaNome, setFinalizarFotoCapaNome] = useState('');
  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const isBruno = String(user?.username || '').trim().toLowerCase() === 'bruno';

  useEffect(() => { loadSupportData(); }, []);
  useEffect(() => { loadCadastros(); }, [filters, somentePendentes]);
  useEffect(() => {
    if (!modal) return;
    const timer = window.setTimeout(() => descricaoPecaTituloRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const editor = descricaoPecaEditorRef.current;
    const value = form.descricaoPeca || '';
    if (editor && document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [modal, form.descricaoPeca]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadSupportData() {
    try {
      const [resp, catResp] = await Promise.all([
        fetch(`${API}/cadastro/opcoes`, { credentials: 'include' }),
        fetch(`${API}/nuvemshop/categorias`, { credentials: 'include' }).catch(() => null),
      ]);
      const d = await resp.json();
      setMotos(Array.isArray(d?.motos) ? d.motos : []);
      setCaixas(Array.isArray(d?.caixas) ? d.caixas : []);
      if (catResp) {
        const catData = await readApiResponse(catResp, 'Erro ao carregar categorias').catch(() => null);
        if (catData?.ok) setCategoriasNuvemshop(Array.isArray(catData.categorias) ? catData.categorias : []);
      }
    } catch { }
  }

  async function loadCadastros() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (somentePendentes) params.set('somentePendentes', 'true');
      if (filters.motoId) params.set('motoId', filters.motoId);
      if (filters.search) params.set('search', filters.search);
      if (filters.semDimensoes) params.set('semDimensoes', filters.semDimensoes);
      params.set('per', '200');
      const d = await fetch(`${API}/cadastro?${params}`, { credentials: 'include' }).then(r => r.json());
      const linhas = Array.isArray(d?.data) ? [...d.data].sort((a: CadastroPeca, b: CadastroPeca) => {
        const dataA = new Date(a.createdAt || 0).getTime();
        const dataB = new Date(b.createdAt || 0).getTime();
        return dataB - dataA;
      }) : [];
      setData({ total: Number(d?.total || linhas.length), data: linhas });
    } catch { }
    setLoading(false);
  }

  function normalizarListaFotosSkus(value: string) {
    return normalizarListaSkus(value);
  }

  async function buscarFotosCadastro() {
    setFotosBuscando(true);
    setFotosResultado('');
    setFotosSelecionados(new Set());
    setFotosBuscaStatus('Buscando materiais do ANB...');
    setFotosBuscaProgresso({ atual: 0, total: 0 });
    try {
      const body = fotosModo === 'skus'
        ? { skus: normalizarListaFotosSkus(fotosSkusInput) }
        : { dataDe: fotosDataDe, dataAte: fotosDataAte };
      const resp = await fetch(`${API}/cadastro/fotos/anb`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readApiResponse(resp, 'Erro ao buscar fotos');
      let linhas = ordenarFotosLinhas(Array.isArray(data.linhas) ? data.linhas : []);
      setFotosLinhas(linhas);
      setFotosSelecionados(new Set(linhas.filter((linha: CadastroFotosLinha) => linha.temFlag).map((linha: CadastroFotosLinha) => linha.sku)));
      setFotosBuscaProgresso({ atual: 0, total: linhas.length });
      const skusParaVerificar = linhas.map((linha) => linha.sku);

      for (let index = 0; index < skusParaVerificar.length; index += 1) {
        const sku = skusParaVerificar[index];
        setFotosBuscaStatus(`Buscando fotos Nuvemshop, Mercado Livre e Drive (${index + 1}/${skusParaVerificar.length}) - ${sku}`);
        try {
          const skuResp = await fetch(`${API}/cadastro/fotos/verificar-sku`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku }),
          });
          const skuData = await readApiResponse(skuResp, `Erro ao verificar fotos do SKU ${sku}`);
          if (skuData.linha) {
            linhas = ordenarFotosLinhas(linhas.map((linha) => linha.sku === sku ? skuData.linha : linha));
            setFotosLinhas(linhas);
            setFotosSelecionados(new Set(linhas.filter((linha: CadastroFotosLinha) => linha.temFlag).map((linha: CadastroFotosLinha) => linha.sku)));
          }
        } catch (skuError: any) {
          linhas = linhas.map((linha) => linha.sku === sku ? { ...linha, status: 'erro', ml: { ...linha.ml, erro: skuError?.message || String(skuError) } } : linha);
          setFotosLinhas(linhas);
        }
        setFotosBuscaProgresso({ atual: index + 1, total: skusParaVerificar.length });
      }

      setFotosBuscaStatus(`Busca concluida: ${linhas.length} SKU(s) verificado(s).`);
    } catch (e: any) {
      alert(e?.message || String(e));
      setFotosBuscaStatus('');
    } finally {
      setFotosBuscando(false);
    }
  }

  async function buscarCategoriaCadastro() {
    setCategoriaBuscando(true);
    setCategoriaResultado('');
    setCategoriaSelecionados(new Set());
    setCategoriaSugestoes({});
    setCategoriaSkuProcessando('');
    setCategoriaFase('');
    setCategoriaStatus('Buscando produtos na Nuvemshop...');
    setCategoriaProgresso({ atual: 0, total: 0 });
    try {
      const body = categoriaModo === 'skus'
        ? { skus: normalizarListaSkus(categoriaSkusInput) }
        : { dataDe: categoriaDataDe, dataAte: categoriaDataAte };

      const resp = await fetch(`${API}/nuvemshop/buscar-produtos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readApiResponse(resp, 'Erro ao buscar produtos para categoria');
      const linhas = ordenarCategoriaLinhas((Array.isArray(data.produtos) ? data.produtos : []).map(normalizarLinhaCategoria));
      setCategoriaLinhas(linhas);
      setCategoriaSelecionados(new Set(linhas.filter((linha) => linha.temFlag).map((linha) => linha.sku)));
      setCategoriaProgresso({ atual: linhas.length, total: linhas.length });
      setCategoriaStatus(`Busca concluida: ${linhas.length} SKU(s) verificado(s).`);
    } catch (e: any) {
      alert(e.message || 'Erro ao buscar categorias');
      setCategoriaStatus('');
    } finally {
      setCategoriaBuscando(false);
    }
  }

  function toggleCategoriaSelecionado(sku: string) {
    setCategoriaSelecionados((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  }

  function selecionarCategoriaPendentes() {
    setCategoriaSelecionados(new Set(categoriaLinhas.filter((linha) => linha.temFlag).map((linha) => linha.sku)));
  }

  function salvarPacotesCategoria() {
    const ia = clampPacote(categoriaPacoteIa, 20);
    const nuvemshop = clampPacote(categoriaPacoteNuvemshop, 20);
    setCategoriaPacoteIa(ia);
    setCategoriaPacoteNuvemshop(nuvemshop);
    window.localStorage.setItem(CATEGORIA_PACOTES_STORAGE_KEY, JSON.stringify({ ia, nuvemshop }));
    setCategoriaPacoteSalvoMsg('Configuracao salva');
    window.setTimeout(() => setCategoriaPacoteSalvoMsg(''), 2500);
  }

  async function processarCategoriasCadastro() {
    if (!canProcessarCategoria) return alert('Seu usuario nao tem permissao para processar categoria.');
    const alvo = categoriaLinhas.filter((linha) => categoriaSelecionados.has(linha.sku) && linha.temFlag && linha.encontradoNuvemshop && linha.produtoId);
    if (!alvo.length) return alert('Nenhum SKU pendente selecionado.');
    if (!categoriasNuvemshop.length) return alert('Categorias da Nuvemshop nao carregadas. Reabra a tela ou tente buscar novamente.');

    setCategoriaProcessando(true);
    setCategoriaResultado('');
    setCategoriaSugestoes({});
    setCategoriaFase('IA');
    setCategoriaProgresso({ atual: 0, total: alvo.length });
    const sugestoesMap: Record<string, CadastroCategoriaSugestao> = {};
    const pacoteIa = clampPacote(categoriaPacoteIa, 20);
    const pacoteNuvemshop = clampPacote(categoriaPacoteNuvemshop, 20);

    try {
      const lotesIa = dividirEmLotes(alvo, pacoteIa);
      let analisados = 0;
      for (let loteIndex = 0; loteIndex < lotesIa.length; loteIndex += 1) {
        const lote = lotesIa[loteIndex];
        const primeiroSku = lote[0]?.sku || '';
        const ultimoSku = lote[lote.length - 1]?.sku || primeiroSku;
        setCategoriaSkuProcessando('');
        setCategoriaFase('IA');
        setCategoriaStatus(`IA analisando lote ${loteIndex + 1}/${lotesIa.length}: ${lote.length} SKU(s) (${primeiroSku}${ultimoSku && ultimoSku !== primeiroSku ? ` ate ${ultimoSku}` : ''})`);
        const resp = await fetch(`${API}/nuvemshop/sugerir-ia`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produtos: lote.map((linha) => ({ sku: linha.sku, titulo: linha.titulo, moto: linha.moto })),
            categorias: categoriasNuvemshop.map((cat: any) => ({ id: cat.id, name: cat.name, parent_id: cat.parent_id })),
          }),
        });
        const data = await readApiResponse(resp, 'Erro IA ao sugerir categorias');
        (Array.isArray(data.sugestoes) ? data.sugestoes : []).forEach((sugestao: CadastroCategoriaSugestao) => {
          if (sugestao?.sku) sugestoesMap[sugestao.sku] = sugestao;
        });
        analisados += lote.length;
        setCategoriaSugestoes({ ...sugestoesMap });
        setCategoriaProgresso({ atual: analisados, total: alvo.length });
      }

      const aplicacoes = alvo
        .map((linha) => {
          const sugestao = sugestoesMap[linha.sku];
          if (!sugestao) return null;
          return { sku: linha.sku, produtoId: linha.produtoId, categorias: sugestao.categorias || [], tags: sugestao.tags || [] };
        })
        .filter(Boolean) as any[];

      if (!aplicacoes.length) throw new Error('IA nao retornou sugestoes para os SKUs selecionados.');

      let atualizados = 0;
      let erros = 0;
      const lotesNuvemshop = dividirEmLotes(aplicacoes, pacoteNuvemshop);
      setCategoriaProgresso({ atual: 0, total: aplicacoes.length });
      for (let loteIndex = 0; loteIndex < lotesNuvemshop.length; loteIndex += 1) {
        const lote = lotesNuvemshop[loteIndex];
        const primeiroSku = lote[0]?.sku || '';
        const ultimoSku = lote[lote.length - 1]?.sku || primeiroSku;
        setCategoriaSkuProcessando('');
        setCategoriaFase('Nuvemshop');
        setCategoriaStatus(`Nuvemshop aplicando lote ${loteIndex + 1}/${lotesNuvemshop.length}: ${lote.length} SKU(s) (${primeiroSku}${ultimoSku && ultimoSku !== primeiroSku ? ` ate ${ultimoSku}` : ''})`);
        const resp = await fetch(`${API}/nuvemshop/aplicar`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aplicacoes: lote.map(({ produtoId, categorias, tags }) => ({ produtoId, categorias, tags })) }),
        });
        const data = await readApiResponse(resp, 'Erro ao aplicar categorias na Nuvemshop');
        const resultados = Array.isArray(data.resultados) ? data.resultados : [];
        const errosLote = resultados.filter((item: any) => !item.ok).length;
        erros += errosLote;
        atualizados += lote.length - errosLote;

        const skusOk = new Set(lote.filter((item) => {
          const resultado = resultados.find((r: any) => Number(r.produtoId) === Number(item.produtoId));
          return !resultado || resultado.ok;
        }).map((item) => item.sku));

        setCategoriaLinhas((prev) => ordenarCategoriaLinhas(prev.map((linha) => {
          if (!skusOk.has(linha.sku)) return linha;
          const sugestao = sugestoesMap[linha.sku];
          return { ...linha, categorias: sugestao?.categorias || linha.categorias, tags: sugestao?.tags || linha.tags, semCategoria: false, semTags: false, temFlag: false, status: 'ok' };
        })));
        setCategoriaSelecionados((prev) => {
          const next = new Set(prev);
          skusOk.forEach((sku) => next.delete(sku));
          return next;
        });
        setCategoriaProgresso({ atual: Math.min(atualizados + erros, aplicacoes.length), total: aplicacoes.length });
      }

      setCategoriaResultado(`Processamento concluido: ${atualizados} SKU(s) atualizado(s), ${erros} com erro.`);
      setCategoriaStatus(`Categorias concluidas: ${atualizados} SKU(s) OK, ${erros} com erro.`);
      setCategoriaFase('Concluido');
    } catch (e: any) {
      alert(e.message || 'Erro ao processar categorias');
      setCategoriaStatus('');
      setCategoriaFase('');
    } finally {
      setCategoriaProcessando(false);
      setCategoriaSkuProcessando('');
      setCategoriaProgresso((prev) => ({ atual: prev.total || prev.atual, total: prev.total }));
    }
  }

  function atualizarFlagFoto(sku: string, sistema: 'anb' | 'ml' | 'nuvemshop', checked: boolean) {
    setFotosLinhas((prev) => prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const flags = { ...linha.flags, [sistema]: checked };
      return { ...linha, flags, temFlag: flags.anb || flags.ml || flags.nuvemshop };
    }));
    if (checked) {
      setFotosSelecionados((prev) => new Set(prev).add(sku));
    }
  }

  function toggleFotosSelecionado(sku: string) {
    setFotosSelecionados((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  }

  function selecionarFotosPendentes() {
    setFotosSelecionados(new Set(fotosLinhas.filter((linha) => linha.temFlag).map((linha) => linha.sku)));
  }

  function marcarLinhaFotosProcessando(sku: string, sistema: CadastroFotosSistema) {
    setFotosLinhas((prev) => prev.map((linha) => (
      linha.sku === sku ? { ...linha, status: `processando-${sistema}` } : linha
    )));
  }

  function atualizarContadorFotosLocal(sku: string, sistema: CadastroFotosSistema, enviadas: number) {
    let removerSelecao = false;
    setFotosLinhas((prev) => ordenarFotosLinhas(prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const atual = Number((linha as any)[sistema]?.fotos || 0);
      const proximo = sistema === 'anb' ? Math.max(1, atual) : Math.min(sistema === 'ml' ? 12 : 999, atual + Math.max(0, enviadas));
      const flags = { ...linha.flags, [sistema]: false };
      const temFlag = flags.anb || flags.ml || flags.nuvemshop;
      if (!temFlag) removerSelecao = true;
      return {
        ...linha,
        [sistema]: { ...(linha as any)[sistema], fotos: proximo, ok: sistema === 'anb' ? proximo > 0 : (linha as any)[sistema]?.ok },
        flags,
        temFlag,
        status: temFlag ? 'pendente' : 'ok',
      } as CadastroFotosLinha;
    })));
    if (removerSelecao) {
      setFotosSelecionados((prev) => {
        const next = new Set(prev);
        next.delete(sku);
        return next;
      });
    }
  }

  function aplicarResultadoProcessamentoLocal(sku: string, detalhes: any[]) {
    for (const detalhe of detalhes || []) {
      if (detalhe?.ok === false) continue;
      const sistema = detalhe.sistema as CadastroFotosSistema;
      if (!(['anb', 'ml', 'nuvemshop'] as CadastroFotosSistema[]).includes(sistema)) continue;
      atualizarContadorFotosLocal(sku, sistema, sistema === 'anb' ? 1 : Number(detalhe.enviados || detalhe.enviada || 0));
    }
  }

  function marcarErroFotosLocal(sku: string, sistema?: CadastroFotosSistema) {
    setFotosLinhas((prev) => prev.map((item) => item.sku === sku ? {
      ...item,
      status: 'erro',
      ...(sistema ? { [sistema]: { ...(item as any)[sistema], erro: `Erro ao enviar ${FOTOS_SISTEMA_LABEL[sistema]}` } } : {}),
    } as CadastroFotosLinha : item));
  }

  async function processarFotosCadastro() {
    if (!canEnviarFotos) return alert('Seu usuario nao tem permissao para enviar fotos.');
    const linhas = fotosLinhas
      .filter((linha) => fotosSelecionados.has(linha.sku) && (linha.flags.anb || linha.flags.ml || linha.flags.nuvemshop))
      .map((linha) => ({ sku: linha.sku, flags: linha.flags }));
    if (!linhas.length) return alert('Nenhum SKU pendente selecionado.');

    setFotosProcessando(true);
    setFotosResultado('');
    setFotosProcessandoSku('');
    setFotosProcessandoSistema('');
    setFotosBuscaProgresso({ atual: 0, total: linhas.length });
    try {
      let ok = 0;
      let erro = 0;

      for (let index = 0; index < linhas.length; index += 1) {
        const linha = linhas[index];
        setFotosProcessandoSku(linha.sku);
        setFotosProcessandoSistema('');
        setFotosBuscaStatus(`Preparando envio (${index + 1}/${linhas.length}) - ${linha.sku}`);
        setFotosBuscaProgresso({ atual: index, total: linhas.length });
        const sistemas = FOTOS_SISTEMAS_PROCESSAMENTO.filter((sistema) => !!linha.flags[sistema]);
        let skuComErro = false;

        for (const sistema of sistemas) {
          setFotosProcessandoSistema(sistema);
          marcarLinhaFotosProcessando(linha.sku, sistema);
          setFotosBuscaStatus(`Enviando ${FOTOS_SISTEMA_LABEL[sistema]} (${index + 1}/${linhas.length}) - ${linha.sku}`);

          try {
            const resp = await fetch(`${API}/cadastro/fotos/processar`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ linhas: [{ sku: linha.sku, flags: { anb: false, ml: false, nuvemshop: false, [sistema]: true } }] }),
            });
            const data = await readApiResponse(resp, `Erro ao processar fotos ${FOTOS_SISTEMA_LABEL[sistema]} do SKU ${linha.sku}`);
            const resultado = Array.isArray(data.resultados) ? data.resultados[0] : null;
            const detalhes = Array.isArray(resultado?.detalhes) ? resultado.detalhes : [];
            const detalheSistema = detalhes.find((detalhe: any) => detalhe?.sistema === sistema);
            if (detalhes.length) {
              aplicarResultadoProcessamentoLocal(linha.sku, detalhes);
            }
            if (!resultado?.ok || detalheSistema?.ok === false || (!detalheSistema && !detalhes.length)) {
              skuComErro = true;
              marcarErroFotosLocal(linha.sku, sistema);
            }
          } catch {
            skuComErro = true;
            marcarErroFotosLocal(linha.sku, sistema);
          }
        }

        setFotosProcessandoSistema('');
        if (skuComErro) {
          erro++;
        } else {
          ok++;
          setFotosSelecionados((prev) => {
            const next = new Set(prev);
            next.delete(linha.sku);
            return next;
          });
        }

        setFotosBuscaProgresso({ atual: index + 1, total: linhas.length });
      }

      setFotosResultado(`Processamento concluido: ${ok} SKU(s) OK, ${erro} com erro.`);
      setFotosBuscaStatus(`Envio concluido: ${ok} SKU(s) OK, ${erro} com erro.`);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setFotosProcessando(false);
      setFotosProcessandoSku('');
      setFotosProcessandoSistema('');
    }
  }

  async function abrirModalFotosManual(linha: CadastroFotosLinha, sistema: CadastroFotosSistema) {
    if (!canEnviarFotos) return alert('Seu usuario nao tem permissao para enviar fotos.');
    setFotoManualModal({ linha, sistema, fotos: [], imagens: [], origem: 'drive', selecionadas: new Set(), carregando: true, enviando: false, status: [] });
    try {
      const resp = await fetch(`${API}/cadastro/fotos/drive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: linha.sku }),
      });
      const data = await readApiResponse(resp, 'Erro ao buscar fotos do Drive');
      const fotos: CadastroFotoDrive[] = Array.isArray(data.fotos) ? data.fotos : [];
      const fotosAtuais = Number((linha as any)[sistema]?.fotos || 0);
      const selecionadas = new Set((fotosAtuais > 0 ? fotos.slice(1) : fotos).map((foto) => foto.id));
      setFotoManualModal({ linha, sistema, fotos, imagens: [], origem: 'drive', selecionadas, carregando: false, enviando: false, status: [] });
    } catch (e: any) {
      alert(e?.message || String(e));
      setFotoManualModal(null);
    }
  }

  async function adicionarFotosManuais(files: File[]) {
    if (!files.length) return;
    const imagens = await Promise.all(files.map((file, index) => new Promise<CadastroFotoManualLocal>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result || '');
        resolve({
          id: `${Date.now()}-${index}-${file.name}`,
          nome: file.name,
          dataUrl,
          base64: dataUrl.split(',')[1] || '',
          mimeType: file.type || 'image/jpeg',
          status: 'aguardando',
        });
      };
      reader.onerror = () => reject(reader.error || new Error('Erro ao ler imagem.'));
      reader.readAsDataURL(file);
    })));
    setFotoManualModal((prev) => prev ? { ...prev, origem: 'manual', imagens: [...prev.imagens, ...imagens] } : prev);
  }

  async function enviarFotosManual() {
    if (!fotoManualModal || fotoManualModal.enviando) return;
    const origem = fotoManualModal.origem;
    const fotos = fotoManualModal.fotos.filter((foto) => fotoManualModal.selecionadas.has(foto.id));
    const imagens = fotoManualModal.imagens.filter((foto) => foto.status !== 'ok' && foto.status !== 'enviando');
    if (origem === 'drive' && !fotos.length) return alert('Selecione ao menos uma foto do Drive.');
    if (origem === 'manual' && !imagens.length) return alert('Selecione ao menos uma foto do computador.');

    setFotoManualModal((prev) => prev ? {
      ...prev,
      enviando: true,
      imagens: prev.origem === 'manual' ? prev.imagens.map((foto) => ({ ...foto, status: 'aguardando' as const, erro: undefined })) : prev.imagens,
      status: prev.origem === 'drive' ? prev.fotos.map((foto, idx) => ({
        nome: foto.nome,
        status: prev.selecionadas.has(foto.id)
          ? 'aguardando'
          : (idx === 0 && Number((prev.linha as any)[prev.sistema]?.fotos || 0) > 0 ? 'pulada' : 'pulada'),
      })) : [],
    } : prev);

    try {
      setFotoManualModal((prev) => prev ? { ...prev, status: prev.status.map((item) => item.status === 'aguardando' ? { ...item, status: 'enviando' } : item) } : prev);
      const itensEnvio = fotoManualModal.sistema === 'anb'
        ? (origem === 'manual' ? imagens.slice(0, 1) : fotos.slice(0, 1))
        : (origem === 'manual' ? imagens : fotos);
      const lotes = dividirEmLotes(itensEnvio, 4);
      const resultados: any[] = [];
      let enviadasTotal = 0;

      for (const lote of lotes) {
        const loteIds = new Set(lote.map((item: any) => item.id || item.nome));
        if (origem === 'manual') {
          setFotoManualModal((prev) => prev ? {
            ...prev,
            imagens: prev.imagens.map((foto) => loteIds.has(foto.id) || loteIds.has(foto.nome) ? { ...foto, status: 'enviando' as const, erro: undefined } : foto),
          } : prev);
        }
        const resp = await fetch(`${API}/cadastro/fotos/enviar-manual`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: fotoManualModal.linha.sku,
            sistema: fotoManualModal.sistema,
            origem,
            fotos: origem === 'drive' ? lote : [],
            imagens: origem === 'manual' ? lote : [],
          }),
        });
        const data = await readApiResponse(resp, 'Erro ao enviar fotos');
        const parcial = Array.isArray(data.resultados) ? data.resultados : [];
        resultados.push(...parcial);
        enviadasTotal += Number(data.enviadas || parcial.filter((item: any) => item.ok && !item.pulada).length || 0);
        atualizarContadorFotosLocal(fotoManualModal.linha.sku, fotoManualModal.sistema, Number(data.enviadas || parcial.filter((item: any) => item.ok && !item.pulada).length || 0));
      }
      const enviadosIds = new Set(itensEnvio.map((item: any) => item.id || item.nome));
      setFotoManualModal((prev) => prev ? {
        ...prev,
        enviando: false,
        imagens: prev.origem === 'manual' ? prev.imagens.map((foto) => {
          if (!enviadosIds.has(foto.id) && !enviadosIds.has(foto.nome)) return { ...foto, status: 'aguardando' as const };
          const r = resultados.find((res: any) => res.nome === foto.nome || res.filename === foto.nome);
          return { ...foto, status: r?.ok ? 'ok' : 'erro', erro: r?.error || 'Falha no envio' };
        }) : prev.imagens,
        status: prev.status.map((item) => {
          if (item.status === 'pulada') return item;
          const r = resultados.find((res: any) => res.nome === item.nome || res.filename === item.nome);
          return { ...item, status: r?.ok ? 'ok' : 'erro', erro: r?.error || 'Falha no envio' };
        }),
      } : prev);
      if (enviadasTotal > 0) setTimeout(() => setFotoManualModal(null), 1200);
    } catch (e: any) {
      setFotoManualModal((prev) => prev ? {
        ...prev,
        enviando: false,
        imagens: prev.imagens.map((foto) => foto.status === 'enviando' ? { ...foto, status: 'erro', erro: e?.message || String(e) } : foto),
        status: prev.status.map((item) => item.status === 'enviando' ? { ...item, status: 'erro', erro: e?.message || String(e) } : item),
      } : prev);
    }
  }

  const fotosPendentes = fotosLinhas.filter((linha) => linha.temFlag).length;
  const categoriaPendentes = categoriaLinhas.filter((linha) => linha.temFlag).length;
  const categoriaOk = categoriaLinhas.filter((linha) => linha.status === 'ok').length;
  const renderFotosStatus = (linha: CadastroFotosLinha) => {
    if (linha.sku === fotosProcessandoSku && fotosProcessandoSistema) {
      return <span style={s.badge('#6d28d9', '#faf5ff', '#c4b5fd')}>Enviando {FOTOS_SISTEMA_LABEL[fotosProcessandoSistema]}</span>;
    }
    if (linha.status === 'verificando') return <span style={s.badge('#6d28d9', '#faf5ff', '#c4b5fd')}>Verificando</span>;
    if (linha.status === 'erro') return <span style={s.badge('#b91c1c', '#fef2f2', '#fecaca')}>Erro</span>;
    return linha.temFlag
      ? <span style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca') }}>Pendente</span>
      : <span style={s.badge('var(--green)', '#f0fdf4', '#86efac')}>OK</span>;
  };
  const renderCategoriaStatus = (linha: CadastroCategoriaLinha) => {
    if (linha.status === 'erro') return <span style={s.badge('#b91c1c', '#fef2f2', '#fecaca')}>Erro</span>;
    if (linha.status === 'nao-encontrado') return <span style={s.badge('#92400e', '#fffbeb', '#fde68a')}>Nao encontrado</span>;
    return linha.temFlag
      ? <span style={s.badge('#dc2626', '#fef2f2', '#fecaca')}>Pendente</span>
      : <span style={s.badge('var(--green)', '#f0fdf4', '#86efac')}>OK</span>;
  };

  async function openNovo() {
    if (!canCriarPreCadastro) return alert('Seu usuario nao tem permissao para criar pre-cadastro.');
    // Moto default = a de ID mais alto (última adicionada)
    const motoOrdenada = [...motos].sort((a, b) => b.id - a.id);
    const motoId = motoOrdenada[0]?.id ? String(motoOrdenada[0].id) : '';
    const form0 = { ...EMPTY_FORM, motoId };
    setForm(form0); setEditItem(null); setCategorias([]); setEtiquetas(['']); setFotoPreviewOpen(false);
    if (motoId) await carregarProximoId(motoId, form0);
    setModal(true);
  }

  async function openEditar(item: CadastroPeca) {
    if (!canEditarPreCadastro) return alert('Seu usuario nao tem permissao para editar pre-cadastro.');
    if (item.status === 'cadastrado') return;
    setEditItem(item);
    setForm({
      motoId: String(item.motoId), idPeca: item.idPeca, descricao: item.descricao,
      descricaoPecaTitulo: item.descricao || '', sufixoTitulo: '',
      descricaoPeca: item.descricaoPeca || '', precoVenda: String(item.precoVenda),
      condicao: item.condicao,
      peso: item.peso != null ? String(item.peso) : '',
      largura: item.largura != null ? String(item.largura) : '',
      altura: item.altura != null ? String(item.altura) : '',
      profundidade: item.profundidade != null ? String(item.profundidade) : '',
      numeroPeca: item.numeroPeca || '', detranEtiqueta: item.detranEtiqueta || '',
      tipoPecaAvulsa: item.tipoPecaAvulsa || '', localizacao: item.localizacao || '', estoque: String(item.estoque),
      categoriaMLId: item.categoriaMLId || '', categoriaMLNome: item.categoriaMLNome || '',
      urlRef: item.urlRef || '', fotoCapa: item.fotoCapa || '', fotoCapaNome: item.fotoCapaNome || '',
    });
    // Carregar etiquetas do campo concatenado (SP001 / SP002 / SP003)
    const etiquetasCarregadas = item.detranEtiqueta
      ? item.detranEtiqueta.split('/').map((e: string) => e.trim()).filter(Boolean)
      : [''];
    setEtiquetas(etiquetasCarregadas.length > 0 ? etiquetasCarregadas : ['']);
    setCategorias([]); setFotoPreviewOpen(false); setModal(true);
  }

  async function carregarProximoId(motoId: string, formAtual?: any) {
    if (!motoId) return;
    try {
      const [idResp, modeloResp] = await Promise.all([
        fetch(`${API}/cadastro/proximo-id/${motoId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/cadastro/motos/${motoId}/descricao-modelo`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setForm((prev: any) => {
        const base = formAtual || prev;
        const sufixoTitulo = modeloResp.sufixoTitulo || '';
        const descricaoPecaTitulo = base.descricaoPecaTitulo || '';
        const sufixo = sufixoTitulo ? ` ${sufixoTitulo}` : '';
        return {
          ...base,
          idPeca: idResp.sugestao || prev.idPeca,
          descricaoPeca: modeloResp.descricaoModelo || prev.descricaoPeca,
          sufixoTitulo,
          descricao: descricaoPecaTitulo ? `${descricaoPecaTitulo}${sufixo}`.slice(0, 60) : base.descricao,
        };
      });
    } catch { }
  }

  async function buscarCategoriaML(titulo: string) {
    if (!titulo || titulo.length < 5) { setCategorias([]); return; }
    setBuscandoCategoria(true);
    try {
      const resp = await fetch(`${API}/mercado-livre/categoria-predictor?titulo=${encodeURIComponent(titulo + ' moto')}`, { credentials: 'include' });
      const d = await resp.json();
      const sugestoes = Array.isArray(d) ? d : [];
      setCategorias(sugestoes.slice(0, 5));
      if (sugestoes.length > 0) {
        const m = sugestoes[0];
        setForm((prev: any) => ({ ...prev, categoriaMLId: m.category_id || m.id || '', categoriaMLNome: m.category_name || m.name || '' }));
      }
    } catch { }
    setBuscandoCategoria(false);
  }

  function handleDescricaoChange(val: string) {
    setForm((prev: any) => ({ ...prev, descricao: val.slice(0, 60) }));
    clearTimeout(categoriaTimerRef.current);
    categoriaTimerRef.current = setTimeout(() => buscarCategoriaML(val), 800);
  }

  function handleDescricaoPecaTituloChange(parte: string) {
    const sufixo = form.sufixoTitulo ? ` ${form.sufixoTitulo}` : '';
    const titulo = `${parte}${sufixo}`.slice(0, 60);
    setForm((prev: any) => ({ ...prev, descricaoPecaTitulo: parte, descricao: titulo }));
    clearTimeout(categoriaTimerRef.current);
    categoriaTimerRef.current = setTimeout(() => buscarCategoriaML(titulo), 800);
  }

  function inserirHtml(cmd: string) {
    document.execCommand(cmd, false);
    const el = document.getElementById('descricaoPeca-wysiwyg');
    if (el) setForm((p: any) => ({ ...p, descricaoPeca: el.innerHTML }));
  }

  async function handleFotoCapaChange(event: any) {
    const file = event.target?.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setUploadingFotoCapa(true);
      const image = await compressFotoCapaFile(file);

      // Padrão de nome: SKU_Capa.jpg (igual ao módulo Estoque)
      const idPeca = itemFinalizar?.idPeca || form?.idPeca || '';
      const skuNome = idPeca
        ? `${String(idPeca).toUpperCase()}_Capa.jpg`
        : image.fileName;

      setFinalizarFotoCapa(image.dataUrl);
      setFinalizarFotoCapaNome(skuNome);
    } catch (e: any) {
      alert(e.message || 'Erro ao importar foto capa');
    }
    setUploadingFotoCapa(false);
  }

  async function salvar() {
    if (editItem && !canEditarPreCadastro) return alert('Seu usuario nao tem permissao para editar pre-cadastro.');
    if (!editItem && !canCriarPreCadastro) return alert('Seu usuario nao tem permissao para criar pre-cadastro.');
    if (!form.motoId || !form.idPeca || !form.descricao) return alert('Moto, ID da Peça e Descrição são obrigatórios');
    if (!form.peso || !form.largura || !form.altura || !form.profundidade) return alert('Dimensões e Peso são obrigatórios');
    // Validar Tipo de Peça para etiquetas avulsas
    const etiquetasValidas = etiquetas.filter(e => e.trim());
    const possuiAvulsa = etiquetasValidas.some(e => !parseEtiquetaCartela(e));
    if (possuiAvulsa && !form.tipoPecaAvulsa) return alert('Selecione o Tipo de Peça para a etiqueta avulsa');
    const detranResumo = getDetranEtiquetasResumo(etiquetas, form.estoque);
    if (detranResumo.possuiAlguma && detranResumo.faltantes > 0) {
      return alert(`Falta o preenchimento de ${detranResumo.faltantes} etiqueta(s) Detran ainda para bater com o estoque (${detranResumo.qtdEstoque}).`);
    }
    if (detranResumo.excedentes > 0) {
      return alert(`Existem ${detranResumo.excedentes} etiqueta(s) Detran a mais para o estoque (${detranResumo.qtdEstoque}).`);
    }
    setSaving(true);
    try {
      const body = {
        motoId: Number(form.motoId), idPeca: form.idPeca, descricao: form.descricao,
        descricaoPeca: form.descricaoPeca || null, precoVenda: Number(form.precoVenda) || 0,
        condicao: form.condicao,
        peso: form.peso ? Number(form.peso) : null, largura: form.largura ? Number(form.largura) : null,
        altura: form.altura ? Number(form.altura) : null, profundidade: form.profundidade ? Number(form.profundidade) : null,
        numeroPeca: form.numeroPeca || null,
        detranEtiqueta: etiquetas.filter(e => e.trim()).length > 0
          ? etiquetas.filter(e => e.trim()).map(e => e.trim()).join(' / ')
          : null,
        localizacao: form.localizacao || null, estoque: Number(form.estoque) || 1,
        categoriaMLId: form.categoriaMLId || null, categoriaMLNome: form.categoriaMLNome || null,
        urlRef: form.urlRef || null,
        tipoPecaAvulsa: form.tipoPecaAvulsa || null,
      };
      const url = editItem ? `${API}/cadastro/${editItem.id}` : `${API}/cadastro`;
      const method = editItem ? 'PUT' : 'POST';
      const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || 'Erro ao salvar');
      if (d._blingErro) alert(`Salvo no ANB, mas erro no Bling:\n${d._blingErro}`);
      setModal(false);
      await loadCadastros();
    } catch (e: any) { alert(e.message || 'Erro ao salvar'); }
    setSaving(false);
  }

  async function excluir(force = false) {
    if (!editItem) return;
    if (!isBruno) {
      alert('Apenas o usuario Bruno pode excluir linhas do cadastro.');
      return;
    }
    const msg = force
      ? `FORÇAR exclusão de ${editItem.idPeca} ignorando verificação do Bling?`
      : `Excluir o pré-cadastro ${editItem.idPeca}?`;
    if (!confirm(msg)) return;
    setExcluindo(true);
    try {
      const url = `${API}/cadastro/${editItem.id}${force ? '?force=true' : ''}`;
      const resp = await fetch(url, { method: 'DELETE', credentials: 'include' });
      const d = await resp.json();
      if (!resp.ok) {
        // Se bloqueado pelo Bling, oferecer força
        if (!force && d.error?.includes('Bling')) {
          const forcar = confirm(`${d.error}

Deseja forçar a exclusão mesmo assim?`);
          if (forcar) { setExcluindo(false); return excluir(true); }
        }
        throw new Error(d.error || 'Erro ao excluir');
      }
      setModal(false);
      await loadCadastros();
    } catch (e: any) { alert(e.message); }
    setExcluindo(false);
  }

  async function eliminarLinhaCadastro(item: CadastroPeca) {
    if (!isBruno) {
      alert('Apenas o usuario Bruno pode eliminar linhas do cadastro.');
      return;
    }
    if (!confirm(`Eliminar a linha ${item.idPeca} do cadastro?`)) return;
    if (!confirm(`Tem certeza que deseja eliminar ${item.idPeca}? Essa acao remove a linha mesmo se ela ja estiver finalizada.`)) return;

    setEliminandoLinhaId(item.id);
    try {
      const resp = await fetch(`${API}/cadastro/${item.id}?force=true`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || 'Erro ao eliminar linha');
      if (editItem?.id === item.id) {
        setModal(false);
        setEditItem(null);
      }
      await loadCadastros();
    } catch (e: any) {
      alert(e.message || 'Erro ao eliminar linha');
    }
    setEliminandoLinhaId(null);
  }

  async function abrirFinalizar(item: CadastroPeca) {
    if (!canCriarProdutoBling) return alert('Seu usuario nao tem permissao para criar produto Bling.');
    if (!item.blingProdutoId) return alert('Produto não foi enviado ao Bling ainda. Salve o pré-cadastro primeiro.');
    setItemFinalizar(item); setPreviewBling(null); setPreviewDiff({});
    setFinalizarFotoCapa(item.fotoCapa || '');
    setFinalizarFotoCapaNome(item.fotoCapaNome || '');
    setFotoPreviewOpen(false);
    setModalFinalizar(true); setLoadingPreview(true);
    try {
      const resp = await fetch(`${API}/cadastro/${item.id}/finalizar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({}),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || 'Erro');
      setPreviewBling(d.preview); setPreviewDiff(d.diff || {});
      setPreviewFrete(d.preview.frete); setPreviewTaxa(d.preview.taxaPct);
    } catch (e: any) { alert(e.message); setModalFinalizar(false); }
    setLoadingPreview(false);
  }

  async function confirmarFinalizar() {
    if (!canCriarProdutoBling) return alert('Seu usuario nao tem permissao para criar produto Bling.');
    if (!itemFinalizar) return;
    setConfirmando(true);
    try {
      const resp = await fetch(`${API}/cadastro/${itemFinalizar.id}/finalizar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          confirmar: true,
          frete: previewFrete,
          taxaPct: previewTaxa,
          fotoCapa: finalizarFotoCapa || null,
          fotoCapaNome: finalizarFotoCapaNome || null,
        }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || 'Erro');
      alert(`✓ ${d.pecasCriadas?.length || 0} peça(s) lançada(s) no estoque!`);
      setModalFinalizar(false); await loadCadastros();
    } catch (e: any) { alert(e.message); }
    setConfirmando(false);
  }

  async function imprimirEtiquetasCadastro(item: CadastroPeca) {
    setImprimindoItemId(item.id);
    try {
      await printSkuLabels(buildCadastroSkuEtiquetas(item));
    } catch (e: any) {
      alert(e.message || 'Erro ao imprimir etiquetas');
    } finally {
      setImprimindoItemId(null);
    }
  }

  const valorTaxas = previewBling ? parseFloat((previewBling.precoML * previewTaxa / 100).toFixed(2)) : 0;
  const valorLiq = previewBling ? parseFloat((previewBling.precoML - previewFrete - valorTaxas).toFixed(2)) : 0;
  const motoSelecionada = motos.find((m) => String(m.id) === String(form.motoId));
  const formOk = camposOk(form);
  const fotoCapaDisplayName = finalizarFotoCapaNome || (finalizarFotoCapa ? 'foto-capa.jpg' : '');
  const categoriaPercentual = categoriaProgresso.total > 0 ? Math.round((categoriaProgresso.atual / categoriaProgresso.total) * 100) : (categoriaBuscando || categoriaProcessando ? 12 : 100);
  const renderCategoriaConteudo = () => (
    <>
      <div style={{ ...s.card, padding: isPhone ? '14px' : '18px' }}>
        <div style={{ display: isPhone ? 'grid' : 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>Buscar SKUs para categoria</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3 }}>Pacotes configuram quantos registros vao em cada chamada.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '120px 140px auto', gap: 8, minWidth: isPhone ? 0 : 390, alignItems: 'end' }}>
            <div>
              <label style={s.label}>Pacote IA</label>
              <input
                type="number"
                min={1}
                max={100}
                value={categoriaPacoteIa}
                onChange={(e) => setCategoriaPacoteIa(clampPacote(Number(e.target.value), 20))}
                disabled={categoriaProcessando || categoriaBuscando}
                style={{ ...s.input, minHeight: 34 }}
              />
            </div>
            <div>
              <label style={s.label}>Pacote Nuvemshop</label>
              <input
                type="number"
                min={1}
                max={100}
                value={categoriaPacoteNuvemshop}
                onChange={(e) => setCategoriaPacoteNuvemshop(clampPacote(Number(e.target.value), 20))}
                disabled={categoriaProcessando || categoriaBuscando}
                style={{ ...s.input, minHeight: 34 }}
              />
            </div>
            <div style={{ gridColumn: isPhone ? '1 / -1' : 'auto' }}>
              <button
                type="button"
                onClick={salvarPacotesCategoria}
                disabled={categoriaProcessando || categoriaBuscando}
                style={{ ...s.btn, minHeight: 34, width: isPhone ? '100%' : undefined, justifyContent: 'center', background: '#0f172a', color: '#fff', opacity: (categoriaProcessando || categoriaBuscando) ? 0.65 : 1 }}
              >
                Salvar configuracao
              </button>
              {categoriaPacoteSalvoMsg && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--green)', fontWeight: 800 }}>{categoriaPacoteSalvoMsg}</div>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, flexDirection: isPhone ? 'column' : 'row' }}>
          {(['data', 'skus'] as const).map((modo) => (
            <button key={modo} onClick={() => setCategoriaModo(modo)}
              style={{ ...s.btn, background: categoriaModo === modo ? 'var(--gray-800)' : 'var(--white)', color: categoriaModo === modo ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
              {modo === 'data' ? 'Data de Cadastro' : 'Por Lista de SKUs'}
            </button>
          ))}
        </div>

        {categoriaModo === 'skus' ? (
          <div>
            <label style={s.label}>SKUs</label>
            <textarea style={{ ...s.input, minHeight: isPhone ? 150 : 110, resize: 'vertical' }} value={categoriaSkusInput} onChange={(e) => setCategoriaSkusInput(e.target.value)} placeholder={'HD04_0001\nPN_0001\nYM01_0001'} />
            <button onClick={buscarCategoriaCadastro} disabled={categoriaBuscando || !categoriaSkusInput.trim()}
              style={{ ...s.btn, marginTop: 10, background: '#7c3aed', color: '#fff', opacity: categoriaBuscando ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
              {categoriaBuscando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        ) : (
          <div style={{ display: isPhone ? 'grid' : 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div><label style={s.label}>De</label><input type="date" style={{ ...s.input, minHeight: isPhone ? 42 : undefined }} value={categoriaDataDe} onChange={(e) => setCategoriaDataDe(e.target.value)} /></div>
            <div><label style={s.label}>Ate</label><input type="date" style={{ ...s.input, minHeight: isPhone ? 42 : undefined }} value={categoriaDataAte} onChange={(e) => setCategoriaDataAte(e.target.value)} /></div>
            <button onClick={buscarCategoriaCadastro} disabled={categoriaBuscando || !categoriaDataDe || !categoriaDataAte}
              style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: categoriaBuscando ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
              {categoriaBuscando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        )}
      </div>

      {categoriaStatus && (
        <div style={{ ...s.card, padding: isPhone ? 12 : 14, borderColor: categoriaFase === 'Concluido' ? '#86efac' : '#c4b5fd', background: categoriaFase === 'Concluido' ? '#f0fdf4' : '#faf5ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: isPhone ? 'flex-start' : 'center', marginBottom: 8, flexDirection: isPhone ? 'column' : 'row' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {categoriaFase && <span style={s.badge(categoriaFase === 'Concluido' ? '#166534' : '#6d28d9', categoriaFase === 'Concluido' ? '#dcfce7' : '#ede9fe', categoriaFase === 'Concluido' ? '#86efac' : '#c4b5fd')}>{categoriaFase}</span>}
                <span style={{ fontSize: 13, fontWeight: 800, color: categoriaFase === 'Concluido' ? '#166534' : '#5b21b6' }}>{categoriaStatus}</span>
              </div>
              {categoriaProcessando && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#6d28d9', fontWeight: 700 }}>
                  Pacote IA: {clampPacote(categoriaPacoteIa, 20)} registro(s) | Pacote Nuvemshop: {clampPacote(categoriaPacoteNuvemshop, 20)} registro(s)
                </div>
              )}
            </div>
            {categoriaProgresso.total > 0 && (
              <div style={{ fontSize: 12, color: categoriaFase === 'Concluido' ? '#166534' : '#6d28d9', fontWeight: 800, whiteSpace: 'nowrap' }}>{categoriaProgresso.atual}/{categoriaProgresso.total} ({categoriaPercentual}%)</div>
            )}
          </div>
          <div style={{ height: 10, borderRadius: 999, background: categoriaFase === 'Concluido' ? '#dcfce7' : '#ede9fe', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${categoriaPercentual}%`, background: categoriaFase === 'Concluido' ? '#22c55e' : '#7c3aed', transition: 'width .2s ease' }} />
          </div>
        </div>
      )}

      {categoriaLinhas.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'SKUs', value: categoriaLinhas.length, color: 'var(--gray-800)' },
              { label: 'Pendentes', value: categoriaPendentes, color: '#dc2626' },
              { label: 'Selecionados', value: categoriaSelecionados.size, color: '#7c3aed' },
              { label: 'OK', value: categoriaOk, color: 'var(--green)' },
            ].map((card) => (
              <div key={card.label} style={{ ...s.card, marginBottom: 0, padding: isPhone ? 12 : 16 }}>
                <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ ...s.card, background: '#faf5ff', border: '1px solid #c4b5fd', display: isPhone ? 'grid' : 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#5b21b6' }}>{categoriaPendentes} SKU(s) com pendencia de categoria/tag</div>
              <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 2 }}>Selecionar pendentes pega somente linhas com flag automatico.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row' }}>
              <button onClick={selecionarCategoriaPendentes} style={{ ...s.btn, background: 'var(--white)', border: '1px solid #c4b5fd', color: '#5b21b6', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Selecionar pendentes</button>
              <button onClick={() => setCategoriaSelecionados(new Set())} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Limpar selecao</button>
              <button onClick={processarCategoriasCadastro} disabled={!canProcessarCategoria || categoriaProcessando || categoriaSelecionados.size === 0} style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (!canProcessarCategoria || categoriaProcessando) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                {categoriaProcessando ? `Processando ${categoriaFase || 'categorias'}...` : 'Processar categorias selecionadas'}
              </button>
            </div>
          </div>

          {categoriaResultado && <div style={{ ...s.card, padding: 14, borderColor: '#86efac', background: '#f0fdf4', color: '#166534', fontSize: 13, fontWeight: 700 }}>{categoriaResultado}</div>}

          {isPhone ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {categoriaLinhas.map((linha) => {
                const sugestao = categoriaSugestoes[linha.sku];
                return (
                  <div key={linha.sku} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: linha.temFlag ? 'var(--white)' : '#f8fafc', display: 'grid', gap: 10, opacity: linha.temFlag ? 1 : 0.78 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', fontWeight: 800 }}>{linha.sku}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-800)', fontWeight: 700, lineHeight: 1.3 }}>{linha.titulo}</div>
                        <div style={{ marginTop: 8 }}>{renderCategoriaStatus(linha)}</div>
                      </div>
                      <input type="checkbox" checked={categoriaSelecionados.has(linha.sku)} disabled={!linha.temFlag} onChange={() => toggleCategoriaSelecionado(linha.sku)} style={{ width: 18, height: 18 }} />
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 700 }}>Categorias</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(sugestao?.categorias?.length ? sugestao.categorias : linha.categorias).map((cat) => <span key={cat.id} style={s.badge(sugestao ? '#166534' : 'var(--gray-600)', sugestao ? '#f0fdf4' : '#f8fafc', sugestao ? '#86efac' : 'var(--border)')}>{cat.nome}</span>)}
                        {!(sugestao?.categorias?.length || linha.categorias.length) && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Sem categoria</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 700 }}>Tags</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(sugestao?.tags?.length ? sugestao.tags : linha.tags).map((tag) => <span key={tag} style={s.badge(sugestao ? '#166534' : 'var(--gray-600)', sugestao ? '#f0fdf4' : '#f8fafc', sugestao ? '#86efac' : 'var(--border)')}>{tag}</span>)}
                        {!(sugestao?.tags?.length || linha.tags.length) && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Sem tags</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)' }}><tr>
                    <th style={{ ...s.th, width: 38 }}><input type="checkbox" checked={categoriaPendentes > 0 && categoriaSelecionados.size === categoriaPendentes} onChange={(e) => e.target.checked ? selecionarCategoriaPendentes() : setCategoriaSelecionados(new Set())} /></th>
                    {['SKU', 'Descricao', 'Categorias', 'Tags', 'Status'].map((h) => <th key={h} style={s.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {categoriaLinhas.map((linha) => {
                      const sugestao = categoriaSugestoes[linha.sku];
                      return (
                        <tr key={linha.sku} style={{ background: linha.temFlag ? 'var(--white)' : '#f8fafc', opacity: linha.temFlag ? 1 : 0.72 }}>
                          <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" checked={categoriaSelecionados.has(linha.sku)} disabled={!linha.temFlag} onChange={() => toggleCategoriaSelecionado(linha.sku)} /></td>
                          <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', color: 'var(--blue-600)', fontWeight: 700, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                          <td style={{ ...s.td, maxWidth: 360 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha.titulo}</div></td>
                          <td style={{ ...s.td, minWidth: 190 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {(sugestao?.categorias?.length ? sugestao.categorias : linha.categorias).map((cat) => <span key={cat.id} style={s.badge(sugestao ? '#166534' : 'var(--gray-600)', sugestao ? '#f0fdf4' : '#f8fafc', sugestao ? '#86efac' : 'var(--border)')}>{sugestao ? `IA ${cat.nome}` : cat.nome}</span>)}
                              {!(sugestao?.categorias?.length || linha.categorias.length) && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Sem categoria</span>}
                            </div>
                          </td>
                          <td style={{ ...s.td, minWidth: 190 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {(sugestao?.tags?.length ? sugestao.tags : linha.tags).slice(0, 8).map((tag) => <span key={tag} style={s.badge(sugestao ? '#166534' : 'var(--gray-600)', sugestao ? '#f0fdf4' : '#f8fafc', sugestao ? '#86efac' : 'var(--border)')}>{tag}</span>)}
                              {!(sugestao?.tags?.length || linha.tags.length) && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Sem tags</span>}
                            </div>
                          </td>
                          <td style={s.td}>{renderCategoriaStatus(linha)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      <div style={{ ...s.topbar, height: isPhone ? 'auto' : 'var(--topbar-h)', minHeight: 'var(--topbar-h)', padding: isPhone ? '12px 14px' : '0 28px', gap: 10, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Cadastro</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Pré-cadastro e cadastro de peças</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isPhone ? '100%' : undefined, justifyContent: isPhone ? 'space-between' : 'flex-end' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--white)' }}>
            {(['sku', 'fotos', 'categoria'] as const).map((tab, index, arr) => (
              <button
                key={tab}
                onClick={() => setPaginaCadastro(tab)}
                style={{
                  border: 'none',
                  borderRight: index < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  background: paginaCadastro === tab ? 'var(--gray-800)' : 'var(--white)',
                  color: paginaCadastro === tab ? '#fff' : 'var(--gray-600)',
                  padding: isPhone ? '7px 12px' : '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab === 'sku' ? 'SKU' : tab === 'fotos' ? 'Fotos' : 'Categoria'}
              </button>
            ))}
          </div>
          {paginaCadastro === 'sku' && canCriarPreCadastro && (
            <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', fontSize: isPhone ? 12 : 12.5, padding: isPhone ? '7px 12px' : '7px 14px' }} onClick={openNovo}>+ Novo Pré-cadastro</button>
          )}
        </div>
      </div>

      <div style={{ padding: isPhone ? '14px' : '20px 24px' }}>
        {paginaCadastro === 'categoria' ? renderCategoriaConteudo() : paginaCadastro === 'fotos' ? (
          <>
            <div style={{ ...s.card, padding: isPhone ? '14px' : '18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>Buscar SKUs para fotos</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, flexDirection: isPhone ? 'column' : 'row' }}>
                {(['data', 'skus'] as const).map((modo) => (
                  <button key={modo} onClick={() => setFotosModo(modo)}
                    style={{ ...s.btn, background: fotosModo === modo ? 'var(--gray-800)' : 'var(--white)', color: fotosModo === modo ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                    {modo === 'skus' ? 'Por Lista de SKUs' : 'Data de Cadastro'}
                  </button>
                ))}
              </div>

              {fotosModo === 'skus' ? (
                <div>
                  <label style={s.label}>SKUs</label>
                  <textarea style={{ ...s.input, minHeight: isPhone ? 150 : 110, resize: 'vertical' }} value={fotosSkusInput} onChange={(e) => setFotosSkusInput(e.target.value)} placeholder={'HD04_0001\nPN_0001\nYM01_0001'} />
                  <button onClick={buscarFotosCadastro} disabled={fotosBuscando || !fotosSkusInput.trim()}
                    style={{ ...s.btn, marginTop: 10, background: '#7c3aed', color: '#fff', opacity: fotosBuscando ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                    {fotosBuscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              ) : (
                <div style={{ display: isPhone ? 'grid' : 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div><label style={s.label}>De</label><input type="date" style={{ ...s.input, minHeight: isPhone ? 42 : undefined }} value={fotosDataDe} onChange={(e) => setFotosDataDe(e.target.value)} /></div>
                  <div><label style={s.label}>Ate</label><input type="date" style={{ ...s.input, minHeight: isPhone ? 42 : undefined }} value={fotosDataAte} onChange={(e) => setFotosDataAte(e.target.value)} /></div>
                  <button onClick={buscarFotosCadastro} disabled={fotosBuscando || !fotosDataDe || !fotosDataAte}
                    style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: fotosBuscando ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                    {fotosBuscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              )}
            </div>

            {fotosBuscaStatus && (
              <div style={{ ...s.card, padding: isPhone ? 12 : 14, borderColor: '#c4b5fd', background: '#faf5ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#5b21b6' }}>{fotosBuscaStatus}</div>
                  {fotosBuscaProgresso.total > 0 && (
                    <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700, whiteSpace: 'nowrap' }}>{fotosBuscaProgresso.atual}/{fotosBuscaProgresso.total}</div>
                  )}
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#ede9fe', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${fotosBuscaProgresso.total > 0 ? Math.round((fotosBuscaProgresso.atual / fotosBuscaProgresso.total) * 100) : (fotosBuscando ? 12 : 100)}%`, background: '#7c3aed', transition: 'width .2s ease' }} />
                </div>
              </div>
            )}

            {fotosLinhas.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'SKUs', value: fotosLinhas.length, color: 'var(--gray-800)' },
                    { label: 'Pendentes', value: fotosPendentes, color: '#dc2626' },
                    { label: 'Selecionados', value: fotosSelecionados.size, color: '#7c3aed' },
                    { label: 'OK', value: fotosLinhas.length - fotosPendentes, color: 'var(--green)' },
                  ].map((card) => (
                    <div key={card.label} style={{ ...s.card, marginBottom: 0, padding: isPhone ? 12 : 16 }}>
                      <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{card.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...s.card, background: '#faf5ff', border: '1px solid #c4b5fd', display: isPhone ? 'grid' : 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#5b21b6' }}>{fotosPendentes} SKU(s) com pendencia de fotos</div>
                    <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 2 }}>Selecionar todos pega somente linhas com flag automatico.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row' }}>
                    <button onClick={selecionarFotosPendentes} style={{ ...s.btn, background: 'var(--white)', border: '1px solid #c4b5fd', color: '#5b21b6', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Selecionar pendentes</button>
                    <button onClick={() => setFotosSelecionados(new Set())} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Limpar selecao</button>
                    <button onClick={processarFotosCadastro} disabled={!canEnviarFotos || fotosProcessando || fotosSelecionados.size === 0} style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (!canEnviarFotos || fotosProcessando) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                      {fotosProcessando ? `Enviando ${fotosProcessandoSistema ? FOTOS_SISTEMA_LABEL[fotosProcessandoSistema] : 'fotos'} ${fotosProcessandoSku || ''}...` : 'Enviar fotos selecionadas'}
                    </button>
                  </div>
                </div>

                {fotosResultado && <div style={{ ...s.card, padding: 14, borderColor: '#86efac', background: '#f0fdf4', color: '#166534', fontSize: 13, fontWeight: 700 }}>{fotosResultado}</div>}

                {isPhone ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {fotosLinhas.map((linha) => (
                      <div key={linha.sku} style={{ border: linha.sku === fotosProcessandoSku ? '2px solid #7c3aed' : '1px solid var(--border)', borderRadius: 12, padding: 12, background: linha.sku === fotosProcessandoSku ? '#faf5ff' : (linha.temFlag ? 'var(--white)' : '#f8fafc'), display: 'grid', gap: 12, opacity: linha.temFlag || linha.sku === fotosProcessandoSku ? 1 : 0.78 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', fontWeight: 800 }}>{linha.sku}</div>
                            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-800)', fontWeight: 700, lineHeight: 1.3 }}>{linha.descricao}</div>
                            <div style={{ marginTop: 5, fontSize: 12, color: '#7c3aed', fontWeight: 800 }}>Drive: {linha.drive?.fotos == null ? '-' : `${linha.drive.fotos} foto(s)`}</div>
                            <div style={{ marginTop: 8 }}>{renderFotosStatus(linha)}</div>
                          </div>
                          <input type="checkbox" checked={fotosSelecionados.has(linha.sku)} disabled={!linha.temFlag} onChange={() => toggleFotosSelecionado(linha.sku)} style={{ width: 18, height: 18 }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                          {(['anb', 'ml', 'nuvemshop'] as const).map((sistema) => {
                            const info: any = linha[sistema];
                            const isSistemaProcessando = linha.sku === fotosProcessandoSku && sistema === fotosProcessandoSistema;
                            return (
                              <div key={sistema} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: isSistemaProcessando ? '2px solid #7c3aed' : '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', background: isSistemaProcessando ? '#f5f3ff' : '#fcfdff' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>{sistema === 'anb' ? 'ANB' : sistema === 'ml' ? 'ML' : 'Nuvemshop'}: {Number(info?.fotos || 0)} foto(s)</span>
                                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                  <button type="button" disabled={!canEnviarFotos} onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirModalFotosManual(linha, sistema); }} style={{ border: 'none', background: 'transparent', cursor: canEnviarFotos ? 'pointer' : 'not-allowed', color: Number(info?.fotos || 0) > 0 ? 'var(--green)' : '#dc2626', fontSize: 16, padding: 0, opacity: canEnviarFotos ? 1 : 0.45 }}>📷</button>
                                  <input type="checkbox" checked={!!linha.flags[sistema]} onChange={(e) => atualizarFlagFoto(linha.sku, sistema, e.target.checked)} />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--gray-50)' }}><tr>
                          <th style={{ ...s.th, width: 38 }}><input type="checkbox" checked={fotosPendentes > 0 && fotosSelecionados.size === fotosPendentes} onChange={(e) => e.target.checked ? selecionarFotosPendentes() : setFotosSelecionados(new Set())} /></th>
                          {['SKU', 'Descricao', 'Drive', 'ANB', 'ML', 'Nuvemshop', 'Status'].map((h) => <th key={h} style={s.th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {fotosLinhas.map((linha) => (
                            <tr key={linha.sku} style={{ background: linha.sku === fotosProcessandoSku ? '#faf5ff' : (linha.temFlag ? 'var(--white)' : '#f8fafc'), opacity: linha.temFlag || linha.sku === fotosProcessandoSku ? 1 : 0.72, outline: linha.sku === fotosProcessandoSku ? '2px solid #7c3aed' : 'none', outlineOffset: -2 }}>
                              <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" checked={fotosSelecionados.has(linha.sku)} disabled={!linha.temFlag} onChange={() => toggleFotosSelecionado(linha.sku)} /></td>
                              <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', color: 'var(--blue-600)', fontWeight: 700, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                              <td style={{ ...s.td, maxWidth: 320 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha.descricao}</div></td>
                              <td style={{ ...s.td, textAlign: 'center' }}>
                                {linha.drive?.fotos == null ? (
                                  <span style={{ fontSize: 11, color: 'var(--gray-300)' }}>-</span>
                                ) : linha.drive.fotos > 0 ? (
                                  <span title={linha.drive.pasta || undefined} style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed' }}>📂 {linha.drive.fotos}</span>
                                ) : (
                                  <span style={{ fontSize: 12, fontWeight: 800, color: '#dc2626' }}>📂 0</span>
                                )}
                              </td>
                              {(['anb', 'ml', 'nuvemshop'] as const).map((sistema) => {
                                const info: any = linha[sistema];
                                const isSistemaProcessando = linha.sku === fotosProcessandoSku && sistema === fotosProcessandoSistema;
                                return (
                                  <td key={sistema} style={{ ...s.td, textAlign: 'center', background: isSistemaProcessando ? '#f5f3ff' : undefined }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                      <input type="checkbox" checked={!!linha.flags[sistema]} onChange={(e) => atualizarFlagFoto(linha.sku, sistema, e.target.checked)} />
                                      <button type="button" disabled={!canEnviarFotos} onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirModalFotosManual(linha, sistema); }} style={{ border: 'none', background: 'transparent', cursor: canEnviarFotos ? 'pointer' : 'not-allowed', color: Number(info?.fotos || 0) > 0 ? 'var(--green)' : '#dc2626', fontSize: 12, fontWeight: 800, textDecoration: 'underline dotted', padding: 0, opacity: canEnviarFotos ? 1 : 0.45 }}>
                                        📷 {Number(info?.fotos || 0)}
                                      </button>
                                    </div>
                                  </td>
                                );
                              })}
                              <td style={s.td}>{renderFotosStatus(linha)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
        <div style={{ ...s.card, padding: isPhone ? '10px 12px' : '14px 18px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', flexDirection: isPhone ? 'column' : 'row' }}>
            <button
              style={{ ...s.btn, fontSize: 12, background: somentePendentes ? 'var(--gray-800)' : 'var(--white)', color: somentePendentes ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined }}
              onClick={() => setSomentePendentes(!somentePendentes)}
            >{somentePendentes ? '📋 Só Pendentes' : '📋 Todos'}</button>
            <select style={{ ...s.input, width: isPhone ? '100%' : 200 }} value={filters.motoId} onChange={(e) => setFilters((prev) => ({ ...prev, motoId: e.target.value }))}>
              <option value="">Todas as motos</option>
              {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
            </select>
            <input style={{ ...s.input, width: isPhone ? '100%' : 200 }} placeholder="Buscar ID ou descrição..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12, width: isPhone ? '100%' : undefined }} onClick={() => { setSearchInput(''); setFilters({ motoId: '', search: '', semDimensoes: '' }); }}>Limpar</button>
          </div>
        </div>

        <div style={{ ...s.card, overflow: 'hidden', maxWidth: '100%' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>{data.total} registro(s){somentePendentes ? ' (pendentes)' : ''}</div>
          {loading ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Carregando...</div> :
            data.data.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Nenhum cadastro encontrado.</div> : isPhone ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.data.map((item) => {
                const cadastOk = item.status === 'cadastrado';
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--white)', display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', fontWeight: 700 }}>{item.idPeca}</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-800)', fontWeight: 600, marginTop: 3, lineHeight: 1.25 }}>{item.descricao}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 4 }}>{item.moto?.marca} {item.moto?.modelo}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 3 }}>Pre-cadastro: {formatDateBr(item.createdAt)}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-800)' }}>R$ {Number(item.precoVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 3 }}>Estoque {item.estoque}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 4 }}>Pré-cadastro</div>
                        {cadastOk
                          ? <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>OK</span>
                          : canEditarPreCadastro
                            ? <button onClick={() => openEditar(item)} style={{ ...s.badge('var(--green)', '#f0fdf4', '#86efac'), cursor: 'pointer', width: '100%', justifyContent: 'center' }}>OK</button>
                            : <span style={{ ...s.badge('var(--green)', '#f0fdf4', '#86efac'), width: '100%', justifyContent: 'center' }}>OK</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 4 }}>Cadastro</div>
                        {cadastOk ? (
                          <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>OK</span>
                        ) : (
                          canCriarProdutoBling ? <button onClick={() => abrirFinalizar(item)}
                            style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca'), cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                            Pendente
                          </button> : <span style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca'), width: '100%', justifyContent: 'center' }}>Pendente</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isBruno ? '1fr 1fr' : '1fr', gap: 8 }}>
                      <button
                        style={{ ...s.btn, fontSize: 12, padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', opacity: imprimindoItemId === item.id ? 0.7 : 1, justifyContent: 'center' }}
                        onClick={() => imprimirEtiquetasCadastro(item)}
                        disabled={imprimindoItemId === item.id}
                      >
                        {imprimindoItemId === item.id ? 'Imprimindo...' : 'Impressão'}
                      </button>
                      {!cadastOk && canEditarPreCadastro && (
                        <button style={{ ...s.btn, fontSize: 12, padding: '8px 10px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', justifyContent: 'center' }} onClick={() => openEditar(item)}>Editar</button>
                      )}
                      {isBruno && (
                        <button
                          style={{ ...s.btn, gridColumn: !cadastOk ? 'span 2' : undefined, fontSize: 12, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', opacity: eliminandoLinhaId === item.id ? 0.7 : 1, justifyContent: 'center' }}
                          onClick={() => eliminarLinhaCadastro(item)}
                          disabled={eliminandoLinhaId === item.id}
                        >
                          {eliminandoLinhaId === item.id ? 'Eliminando...' : 'Eliminar linha'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' as const }}>
                <colgroup>
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead><tr>{['ID Peça', 'Descrição', 'Moto', 'Data Pré-Cadastro', 'Preço', 'Estoque', 'Pré-Cadastro', 'Cadastro', 'Ações'].map(h => <th key={h} style={{ ...s.th, padding: '9px 6px', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.data.map((item) => {
                    const cadastOk = item.status === 'cadastrado';
                    return (
                      <tr key={item.id}>
                        <td style={{ ...s.td, padding: '10px 6px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.idPeca}</td>
                        <td style={{ ...s.td, padding: '10px 6px' }}><div title={item.descricao} style={{ whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</div></td>
                        <td style={{ ...s.td, padding: '10px 6px', fontSize: 12 }}><div title={`${item.moto?.marca || ''} ${item.moto?.modelo || ''}`} style={{ whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.moto?.marca} {item.moto?.modelo}</div></td>
                        <td style={{ ...s.td, padding: '10px 6px', whiteSpace: 'nowrap' as const, fontSize: 12 }}>{formatDateBr(item.createdAt)}</td>
                        <td style={{ ...s.td, padding: '10px 6px', whiteSpace: 'nowrap' as const }}>R$ {Number(item.precoVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ ...s.td, padding: '10px 6px' }}>{item.estoque}</td>
                        <td style={{ ...s.td, padding: '10px 6px' }}>
                          {cadastOk
                            ? <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>✓ OK</span>
                            : canEditarPreCadastro
                              ? <button onClick={() => openEditar(item)} style={{ ...s.badge('var(--green)', '#f0fdf4', '#86efac'), cursor: 'pointer' }}>✓ OK</button>
                              : <span style={s.badge('var(--green)', '#f0fdf4', '#86efac')}>✓ OK</span>}
                        </td>
                        <td style={{ ...s.td, padding: '10px 6px' }}>
                          {cadastOk ? (
                            <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>✓ OK</span>
                          ) : (
                            canCriarProdutoBling ? <button onClick={() => abrirFinalizar(item)}
                              style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca'), cursor: 'pointer' }}>
                              Pendente
                            </button> : <span style={s.badge('#dc2626', '#fef2f2', '#fecaca')}>Pendente</span>
                          )}
                        </td>
                        <td style={{ ...s.td, padding: '10px 6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 5, alignItems: 'center' }}>
                            <button
                              style={{ ...s.btn, fontSize: 10.5, padding: '4px 6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', opacity: imprimindoItemId === item.id ? 0.7 : 1, justifyContent: 'center', minWidth: 0 }}
                              onClick={() => imprimirEtiquetasCadastro(item)}
                              disabled={imprimindoItemId === item.id}
                            >
                              {imprimindoItemId === item.id ? 'Imprimindo...' : 'Impressão'}
                            </button>
                            {!cadastOk && canEditarPreCadastro && (
                              <button style={{ ...s.btn, fontSize: 10.5, padding: '4px 6px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', justifyContent: 'center', minWidth: 0 }} onClick={() => openEditar(item)}>Editar</button>
                            )}
                            {isBruno && (
                              <button
                                style={{ ...s.btn, fontSize: 10.5, padding: '4px 6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', opacity: eliminandoLinhaId === item.id ? 0.7 : 1, justifyContent: 'center', minWidth: 0 }}
                                onClick={() => eliminarLinhaCadastro(item)}
                                disabled={eliminandoLinhaId === item.id}
                              >
                                {eliminandoLinhaId === item.id ? '...' : 'Eliminar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {fotoManualModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 260, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : 720, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: isPhone ? '14px 16px' : '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Fotos - {fotoManualModal.linha.sku}</div>
                <div style={{ fontSize: 12, color: fotoManualModal.sistema === 'ml' ? '#2563eb' : fotoManualModal.sistema === 'nuvemshop' ? '#7c3aed' : '#166534', marginTop: 3, fontWeight: 800 }}>
                  Destino: {fotoManualModal.sistema === 'anb' ? 'ANB' : fotoManualModal.sistema === 'ml' ? 'Mercado Livre' : 'Nuvemshop'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fotoManualModal.linha.descricao}</div>
              </div>
              <button onClick={() => setFotoManualModal(null)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            <div style={{ padding: isPhone ? 16 : '16px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: isPhone ? 'grid' : 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 220px', gap: 10, marginBottom: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${fotoManualModal.origem === 'manual' ? '#7c3aed' : 'var(--border)'}`, borderRadius: 10, padding: 16, cursor: fotoManualModal.enviando ? 'default' : 'pointer', background: fotoManualModal.origem === 'manual' ? '#faf5ff' : '#fafafa', gap: 4 }}>
                  <div style={{ fontSize: 24 }}>📁</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>Selecionar do computador</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{fotoManualModal.imagens.length} foto(s) selecionada(s)</div>
                  <input type="file" multiple accept="image/*" disabled={fotoManualModal.enviando} style={{ display: 'none' }} onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    await adicionarFotosManuais(files);
                  }} />
                </label>
                <button type="button" onClick={() => setFotoManualModal((prev) => prev ? { ...prev, origem: 'drive' } : prev)} disabled={fotoManualModal.enviando || fotoManualModal.carregando || fotoManualModal.fotos.length === 0}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${fotoManualModal.origem === 'drive' ? '#7c3aed' : '#c4b5fd'}`, borderRadius: 10, padding: 16, cursor: fotoManualModal.fotos.length ? 'pointer' : 'default', background: '#faf5ff', gap: 4, opacity: fotoManualModal.fotos.length === 0 ? 0.55 : 1 }}>
                  <div style={{ fontSize: 24 }}>{fotoManualModal.carregando ? '⏳' : '📂'}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{fotoManualModal.carregando ? 'Buscando no Drive...' : 'Usar fotos do Drive'}</div>
                  <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{fotoManualModal.fotos.length} foto(s) encontrada(s)</div>
                </button>
              </div>

              {fotoManualModal.origem === 'manual' ? (
                fotoManualModal.imagens.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)', border: '1px dashed var(--border)', borderRadius: 10 }}>Selecione uma pasta ou imagens do computador.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(135px, 1fr))', gap: 10 }}>
                    {fotoManualModal.imagens.map((foto) => (
                      <div key={foto.id} style={{ border: `2px solid ${foto.status === 'ok' ? '#86efac' : foto.status === 'erro' ? '#fca5a5' : foto.status === 'enviando' ? '#93c5fd' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#fff' }}>
                        <img src={foto.dataUrl} alt={foto.nome} style={{ width: '100%', height: 105, objectFit: 'cover', display: 'block' }} />
                        {foto.status === 'aguardando' && (
                          <button type="button" onClick={() => setFotoManualModal((prev) => prev ? { ...prev, imagens: prev.imagens.filter((item) => item.id !== foto.id) } : prev)} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,.62)', color: '#fff', cursor: 'pointer' }}>×</button>
                        )}
                        <div style={{ padding: '5px 7px', fontSize: 10.5, color: foto.status === 'erro' ? '#dc2626' : 'var(--gray-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{foto.status === 'erro' ? (foto.erro || 'Erro') : foto.nome}</div>
                      </div>
                    ))}
                  </div>
                )
              ) : fotoManualModal.carregando ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Buscando fotos no Drive...</div>
              ) : fotoManualModal.fotos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Nenhuma foto encontrada no Drive.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #c4b5fd', background: '#faf5ff', fontSize: 12, color: '#5b21b6', fontWeight: 700 }}>
                    {Number((fotoManualModal.linha as any)[fotoManualModal.sistema]?.fotos || 0) > 0
                      ? 'Este sistema ja possui foto. A capa do Drive fica desmarcada por padrao.'
                      : 'Este sistema esta sem foto. A capa do Drive fica selecionada.'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                    {fotoManualModal.fotos.map((foto, idx) => {
                      const status = fotoManualModal.status.find((item) => item.nome === foto.nome)?.status;
                      const erro = fotoManualModal.status.find((item) => item.nome === foto.nome)?.erro;
                      const selected = fotoManualModal.selecionadas.has(foto.id);
                      return (
                        <label key={foto.id} style={{ border: `2px solid ${selected ? '#7c3aed' : 'var(--border)'}`, borderRadius: 10, padding: 10, background: idx === 0 ? '#fffbeb' : 'var(--white)', cursor: fotoManualModal.enviando ? 'default' : 'pointer', display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: idx === 0 ? '#92400e' : 'var(--gray-600)' }}>{idx === 0 ? 'CAPA' : `FOTO ${idx + 1}`}</span>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={fotoManualModal.enviando}
                              onChange={(e) => {
                                setFotoManualModal((prev) => {
                                  if (!prev) return prev;
                                  const selecionadas = new Set(prev.selecionadas);
                                  e.target.checked ? selecionadas.add(foto.id) : selecionadas.delete(foto.id);
                                  return { ...prev, selecionadas };
                                });
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--gray-700)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foto.nome}</div>
                          {status && (
                            <div style={{ fontSize: 11, color: status === 'ok' ? 'var(--green)' : status === 'erro' ? '#dc2626' : status === 'pulada' ? '#92400e' : '#7c3aed', fontWeight: 700 }}>
                              {status === 'ok' ? 'Enviada' : status === 'erro' ? (erro || 'Erro') : status === 'pulada' ? 'Pulada' : status === 'enviando' ? 'Enviando...' : 'Aguardando'}
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: isPhone ? 16 : '14px 22px', borderTop: '1px solid var(--border)', display: isPhone ? 'grid' : 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{fotoManualModal.origem === 'manual' ? fotoManualModal.imagens.filter((foto) => foto.status !== 'ok').length : fotoManualModal.selecionadas.size} foto(s) selecionada(s)</div>
              <div style={{ display: isPhone ? 'grid' : 'flex', gap: 8 }}>
                <button onClick={() => setFotoManualModal(null)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Fechar</button>
                <button onClick={enviarFotosManual} disabled={fotoManualModal.enviando || (fotoManualModal.origem === 'drive' && (fotoManualModal.carregando || fotoManualModal.selecionadas.size === 0)) || (fotoManualModal.origem === 'manual' && fotoManualModal.imagens.filter((foto) => foto.status !== 'ok').length === 0)} style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (fotoManualModal.enviando || (fotoManualModal.origem === 'drive' && (fotoManualModal.carregando || fotoManualModal.selecionadas.size === 0)) || (fotoManualModal.origem === 'manual' && fotoManualModal.imagens.filter((foto) => foto.status !== 'ok').length === 0)) ? 0.65 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                  {fotoManualModal.enviando ? 'Enviando...' : 'Enviar selecionadas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRÉ-CADASTRO */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'flex-start', justifyContent: 'center', padding: isPhone ? 0 : isTabletLandscape ? '12px' : '20px 16px', overflowY: 'hidden' }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : isMobile ? 680 : 1100, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: isPhone ? 0 : 20, display: 'flex', flexDirection: 'column', maxHeight: isPhone ? '100dvh' : isTabletLandscape ? 'calc(100dvh - 24px)' : 'calc(100dvh - 40px)', minHeight: isPhone ? '100dvh' : undefined, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: isPhone ? '14px 14px 12px' : '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: isPhone ? 16 : 14, fontWeight: 600 }}>{editItem ? 'Editar Pré-Cadastro' : 'Novo Pré-Cadastro'}</div>
              <button onClick={() => setModal(false)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
            </div>

            {/* Corpo */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: isPhone ? 'block' : 'grid', gridTemplateColumns: isPhone ? undefined : isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'stretch', gap: 0 }}>

              {/* COLUNA ESQUERDA — campos do produto */}
              <div style={{ padding: isPhone ? '12px 14px' : '10px 14px', display: 'grid', alignContent: 'start', gap: isPhone ? 8 : 5, borderRight: (!isPhone && !isMobile) ? '1px solid var(--border)' : 'none', borderBottom: isMobile && !isPhone ? '1px solid var(--border)' : 'none', overflowY: 'auto', minHeight: 0 }}>

                <div>
                  <label style={s.label}>Moto *</label>
                  <select style={s.input} value={form.motoId} onChange={async (e) => { setForm((p: any) => ({ ...p, motoId: e.target.value })); if (!editItem) await carregarProximoId(e.target.value); }}>
                    <option value="">Selecione a moto</option>
                    {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo} {m.ano || ''}</option>)}
                  </select>
                  {motoSelecionada && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>Marca: {motoSelecionada.marca}</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={s.label}>ID Peça (SKU) *</label>
                    <input style={s.input} value={form.idPeca} onChange={(e) => setForm((p: any) => ({ ...p, idPeca: e.target.value.toUpperCase() }))} disabled={!!editItem} placeholder="Ex: HD04_0023" />
                  </div>
                  <div>
                    <label style={s.label}>Condição</label>
                    <select style={s.input} value={form.condicao} onChange={(e) => setForm((p: any) => ({ ...p, condicao: e.target.value }))}>
                      <option value="usado">Usado</option>
                      <option value="novo">Novo</option>
                    </select>
                  </div>
                </div>

                <div>
                  {/* Sufixo da moto */}
                  {form.sufixoTitulo && (
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                        {form.sufixoTitulo}
                      </span>
                      <span style={{ color: 'var(--ink-muted)' }}>será adicionado automaticamente ao título</span>
                    </div>
                  )}
                  {/* Campo Descrição da Peça */}
                  <label style={s.label}>Descrição da Peça *</label>
                  <input
                    ref={descricaoPecaTituloRef}
                    style={s.input}
                    value={form.descricaoPecaTitulo || ''}
                    onChange={(e) => handleDescricaoPecaTituloChange(e.target.value)}
                    placeholder="Ex: Bloco do Motor"
                  />
                </div>

                <div>
                  <label style={s.label}>Descrição (título) * — {form.descricao.length}/60</label>
                  <input
                    style={{ ...s.input, borderColor: form.descricao.length >= 55 ? '#fcd34d' : undefined }}
                    value={form.descricao}
                    onChange={(e) => handleDescricaoChange(e.target.value)}
                    placeholder="Título para ML e Nuvemshop"
                    tabIndex={-1}
                  />
                </div>

                <div>
                  <label style={s.label}>Categoria ML *{form.categoriaMLId && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--gray-400)', fontWeight: 400 }}>ID: {form.categoriaMLId}</span>}</label>
                  <div style={{ display: 'flex', gap: 8, flexDirection: isPhone ? 'column' : 'row' }}>
                    {categorias.length > 0 ? (
                      <select style={{ ...s.input, flex: 1 }} value={form.categoriaMLId} tabIndex={-1} onChange={(e) => {
                        const cat = categorias.find((c: any) => (c.category_id || c.id) === e.target.value);
                        setForm((p: any) => ({ ...p, categoriaMLId: e.target.value, categoriaMLNome: cat?.category_name || cat?.name || '' }));
                      }}>
                        <option value="">Selecione</option>
                        {categorias.map((c: any) => <option key={c.category_id || c.id} value={c.category_id || c.id}>{c.category_name || c.name}</option>)}
                      </select>
                    ) : (
                      <input style={{ ...s.input, flex: 1 }} value={form.categoriaMLNome || ''} tabIndex={-1} onChange={(e) => setForm((p: any) => ({ ...p, categoriaMLNome: e.target.value }))}
                        placeholder={buscandoCategoria ? 'Buscando...' : 'Clique buscar para sugerir'} readOnly={buscandoCategoria} />
                    )}
                    <button type="button" style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12, whiteSpace: 'nowrap' as const, opacity: buscandoCategoria ? 0.6 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
                      tabIndex={-1}
                      onClick={() => { setCategorias([]); buscarCategoriaML(form.descricao); }} disabled={buscandoCategoria || !form.descricao}>
                      {buscandoCategoria ? '...' : '🔍 Buscar'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div><label style={s.label}>Preço de Venda (R$) *</label><input style={s.input} type="number" min="0" step="0.01" value={form.precoVenda} onChange={(e) => setForm((p: any) => ({ ...p, precoVenda: e.target.value }))} placeholder="0.00" /></div>
                  <div><label style={s.label}>Estoque *</label><input style={s.input} type="number" min="1" value={form.estoque} onChange={(e) => setForm((p: any) => ({ ...p, estoque: e.target.value }))} /></div>
                </div>

                <div>
                  <label style={s.label}>Dimensões e Peso *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4,1fr)', gap: 8 }}>
                    {[{ key: 'peso', label: 'Peso (kg)' }, { key: 'largura', label: 'Largura (cm)' }, { key: 'altura', label: 'Altura (cm)' }, { key: 'profundidade', label: 'Prof. (cm)' }].map(({ key, label }) => (
                      <div key={key}><div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>{label}</div><input style={s.input} type="number" min="0" step="0.01" value={form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder="0" /></div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={s.label}>Localização (Caixa) *</label>
                    <input style={s.input} list="caixas-list" value={form.localizacao} onChange={(e) => setForm((p: any) => ({ ...p, localizacao: e.target.value }))} placeholder="Nome da caixa" />
                    <datalist id="caixas-list">{caixas.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div><label style={s.label}>Número da Peça *</label><input style={s.input} value={form.numeroPeca} onChange={(e) => setForm((p: any) => ({ ...p, numeroPeca: e.target.value }))} placeholder="Código do fabricante" /></div>
                </div>

                {/* Etiquetas Detran */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ ...s.label, marginBottom: 0 }}>Etiqueta Detran</label>
                    <button type="button"
                      onClick={() => setEtiquetas((prev: string[]) => [...prev, ''])}
                      style={{ ...s.btn, fontSize: 11, padding: '3px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb' }}>
                      + Adicionar Etiqueta
                    </button>
                  </div>
                  {etiquetas.map((etq: string, idx: number) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', minWidth: isPhone ? 80 : 130, whiteSpace: 'nowrap' as const }}>
                        {idx === 0 ? 'Etiqueta Detran' : `Detran - ${idx + 1}`}
                      </div>
                      <input
                        style={{ ...s.input, flex: 1 }}
                        value={etq}
                        onChange={(e) => setEtiquetas((prev: string[]) => prev.map((v, i) => i === idx ? e.target.value : v))}
                        placeholder="Ex: SP83838383"
                      />
                      {etiquetas.length > 1 && (
                        <button type="button"
                          onClick={() => setEtiquetas((prev: string[]) => prev.filter((_: string, i: number) => i !== idx))}
                          style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                  {(() => {
                    const resumoDetran = getDetranEtiquetasResumo(etiquetas, form.estoque);
                    if (resumoDetran.possuiAlguma && resumoDetran.faltantes > 0) {
                      return <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠ Falta o preenchimento de {resumoDetran.faltantes} etiqueta(s) Detran ainda. Estoque = {resumoDetran.qtdEstoque}.</div>;
                    }
                    if (resumoDetran.excedentes > 0) {
                      return <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠ Existem {resumoDetran.excedentes} etiqueta(s) Detran a mais. Estoque = {resumoDetran.qtdEstoque}.</div>;
                    }
                    return null;
                  })()}
                  {/* Tipo de Peça para etiquetas avulsas */}
                  {etiquetas.some(e => e.trim() && !parseEtiquetaCartela(e)) && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ ...s.label, marginBottom: 4 }}>
                        Tipo de Peça <span style={{ color: '#dc2626' }}>*</span>
                        <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 6, fontWeight: 400 }}>(etiqueta avulsa)</span>
                      </label>
                      <select
                        style={{ ...s.input }}
                        value={form.tipoPecaAvulsa || ''}
                        onChange={(e) => setForm((p: any) => ({ ...p, tipoPecaAvulsa: e.target.value }))}
                      >
                        <option value="">Selecione o tipo de peça...</option>
                        {DETRAN_TIPOS.map((tipo) => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label style={s.label}>URL de Referência</label>
                  <input style={s.input} value={form.urlRef || ''} onChange={(e) => setForm((p: any) => ({ ...p, urlRef: e.target.value }))} placeholder="Ex: www.site.com.br/produto" />
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'none' }}>
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFotoCapaChange}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <label style={{ ...s.label, marginBottom: 4 }}>Foto Capa</label>
                      {form.fotoCapa ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setFotoPreviewOpen(true)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              cursor: 'pointer',
                              color: '#2563eb',
                              fontSize: 12.5,
                              fontWeight: 600,
                              textDecoration: 'underline',
                              textAlign: 'left' as const,
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const,
                            }}
                          >
                            {fotoCapaDisplayName}
                          </button>
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray-500)' }}>A imagem salva aqui segue junto quando a peça for lançada no estoque.</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Nenhuma foto importada</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      disabled={uploadingFotoCapa}
                      style={{
                        ...s.btn,
                        background: 'var(--white)',
                        border: '1px solid var(--border)',
                        color: 'var(--gray-600)',
                        opacity: uploadingFotoCapa ? 0.7 : 1,
                      }}
                    >
                      {uploadingFotoCapa ? 'Importando...' : (form.fotoCapa ? 'Trocar Foto Capa' : 'Importar Foto Capa')}
                    </button>
                  </div>
                </div>
              </div>

              {/* COLUNA DIREITA — checklist + descrição */}
              <div style={{ padding: isPhone ? '0 14px 12px' : '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: isPhone ? 8 : 5, overflowY: 'auto', minHeight: 0 }}>

                <ChecklistValidacao form={form} />

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const }}>
                  <label style={s.label}>Descrição da Peça (corpo do anúncio)</label>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const }}>
                    <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                      {[{ label: 'B', cmd: 'bold', style: { fontWeight: 700 } }, { label: 'I', cmd: 'italic', style: { fontStyle: 'italic' } }, { label: 'U', cmd: 'underline', style: { textDecoration: 'underline' } }].map(({ label, cmd, style }) => (
                        <button key={cmd} type="button"
                          onMouseDown={(e) => { e.preventDefault(); inserirHtml(cmd); }}
                          style={{ ...style, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 4, padding: '4px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'serif' }}>{label}</button>
                      ))}
                      {!isPhone && <span style={{ fontSize: 11, color: 'var(--gray-400)', alignSelf: 'center', marginLeft: 4 }}>Selecione e clique para formatar</span>}
                    </div>
                    <div
                      id="descricaoPeca-wysiwyg"
                      ref={descricaoPecaEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      style={{ ...s.input, flex: '1 1 auto', minHeight: isPhone ? 200 : 220, maxHeight: isPhone ? 320 : isTabletLandscape ? 'calc(100dvh - 210px)' : 'calc(100dvh - 260px)', borderRadius: 0, border: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', outline: 'none' }}
                      onInput={(e) => setForm((p: any) => ({ ...p, descricaoPeca: (e.target as HTMLDivElement).innerHTML }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: isPhone ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexDirection: isPhone ? 'column-reverse' : 'row', flexShrink: 0 }}>
              <button onClick={() => setModal(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>Cancelar</button>
              {editItem && isBruno && (
                <button onClick={() => excluir()} disabled={excluindo}
                  style={{ ...s.btn, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', opacity: excluindo ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>
                  {excluindo ? 'Excluindo...' : '🗑️ Excluir'}
                </button>
              )}
              <button onClick={salvar} disabled={saving || (editItem ? !canEditarPreCadastro : !canCriarPreCadastro)} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: (saving || (editItem ? !canEditarPreCadastro : !canCriarPreCadastro)) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>
                {saving ? 'Enviando...' : editItem ? '🔄 Atualizar Produto Bling' : '🚀 Criar Produto Bling'}
              </button>
            </div>
          </div>
        </div>
      )}
      {modalFinalizar && fotoPreviewOpen && finalizarFotoCapa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 205, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 960, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.24)' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Foto Capa</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fotoCapaDisplayName}</div>
              </div>
              <button onClick={() => setFotoPreviewOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 'calc(90vh - 70px)', overflow: 'auto' }}>
              <img src={finalizarFotoCapa} alt={`Foto capa ${itemFinalizar?.idPeca || 'cadastro'}`} style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 120px)', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,.08)' }} />
            </div>
          </div>
        </div>
      )}
      {/* MODAL FINALIZAR */}
      {modalFinalizar && itemFinalizar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : 680, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: isPhone ? '100dvh' : '90vh', minHeight: isPhone ? '100dvh' : undefined, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: isPhone ? '16px 14px 14px' : '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Lançar no Estoque</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{itemFinalizar.idPeca} — {itemFinalizar.descricao}</div>
              </div>
              <button onClick={() => { setModalFinalizar(false); setFotoPreviewOpen(false); }} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>
            <div style={{ padding: isPhone ? '14px' : '20px 24px', flex: 1, overflowY: 'auto' }}>
              {loadingPreview ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Buscando dados do Bling...</div> : previewBling ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'none' }}>{[
                    { key: 'descricao', label: 'Título', val: previewBling.descricao },
                    { key: 'precoVenda', label: 'Preço ML', val: `R$ ${Number(previewBling.precoML).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                    { key: 'peso', label: 'Peso (kg)', val: previewBling.peso },
                    { key: 'largura', label: 'Largura (cm)', val: previewBling.largura },
                    { key: 'altura', label: 'Altura (cm)', val: previewBling.altura },
                    { key: 'profundidade', label: 'Profundidade (cm)', val: previewBling.profundidade },
                    { key: null, label: 'Localização', val: previewBling.localizacao },
                    { key: null, label: 'Etiquetas Detran', val: previewBling.detranEtiqueta || '—' },
                    { key: null, label: 'Estoque', val: previewBling.estoque },
                  ].map(({ key, label, val }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{String(val ?? '—')}</div>
                      {key && previewDiff[key] && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>↑ Ajustado (era {String(previewDiff[key].anb ?? '')} no ANB)</div>}
                    </div>
                  ))}</div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Titulo</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{String(previewBling.descricao ?? '-')}</div>
                    {previewDiff.descricao && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Ajustado (era {String(previewDiff.descricao.anb ?? '')} no ANB)</div>}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Preco ML</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{`R$ ${Number(previewBling.precoML).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</div>
                    {previewDiff.precoVenda && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Ajustado (era {String(previewDiff.precoVenda.anb ?? '')} no ANB)</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    {[
                      { key: 'peso', label: 'Peso (kg)', val: previewBling.peso },
                      { key: 'largura', label: 'Largura (cm)', val: previewBling.largura },
                      { key: 'altura', label: 'Altura (cm)', val: previewBling.altura },
                      { key: 'profundidade', label: 'Profundidade (cm)', val: previewBling.profundidade },
                    ].map(({ key, label, val }) => (
                      <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: '#fcfdff' }}>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{String(val ?? '-')}</div>
                        {previewDiff[key] && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Ajustado (era {String(previewDiff[key].anb ?? '')})</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1.4fr) minmax(140px, .6fr)', gap: 10 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: '#fcfdff' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Localizacao</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{String(previewBling.localizacao ?? '-')}</div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: '#fcfdff' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Estoque</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{String(previewBling.estoque ?? '-')}</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Etiquetas Detran</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{String(previewBling.detranEtiqueta || '-')}</div>
                    {/* Mostrar tipo de peça por etiqueta */}
                    {previewBling.detranEtiqueta && (() => {
                      const etqs = String(previewBling.detranEtiqueta).split('/').map((e: string) => e.trim()).filter(Boolean);
                      const linhas: React.ReactNode[] = [];
                      etqs.forEach((etq: string) => {
                        const cartela = parseEtiquetaCartela(etq);
                        if (cartela) {
                          linhas.push(<div key={etq} style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>↳ {etq}: {cartela.tipo} (posição {cartela.posicao})</div>);
                        } else if (itemFinalizar?.tipoPecaAvulsa) {
                          linhas.push(<div key={etq} style={{ fontSize: 11, color: '#7c3aed', marginTop: 3 }}>↳ {etq}: {itemFinalizar.tipoPecaAvulsa} (avulsa)</div>);
                        }
                      });
                      return linhas.length > 0 ? <div style={{ marginTop: 4 }}>{linhas}</div> : null;
                    })()}
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFotoCapaChange}
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isPhone ? 'stretch' : 'flex-start', gap: 12, flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 4 }}>Foto Capa</div>
                        {finalizarFotoCapa ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setFotoPreviewOpen(true)}
                              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#2563eb', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', textAlign: 'left' as const, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}
                            >
                              {fotoCapaDisplayName}
                            </button>
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray-500)' }}>Essa foto sera gravada na peca ao confirmar o lancamento no estoque.</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Nenhuma foto importada</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fotoInputRef.current?.click()}
                        disabled={uploadingFotoCapa}
                        style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', opacity: uploadingFotoCapa ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
                      >
                        {uploadingFotoCapa ? 'Importando...' : (finalizarFotoCapa ? 'Trocar Foto Capa' : 'Importar Foto Capa')}
                      </button>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
                    <div><label style={s.label}>Frete (R$)</label><input style={s.input} type="number" step="0.01" value={previewFrete} onChange={(e) => setPreviewFrete(Number(e.target.value))} /></div>
                    <div><label style={s.label}>Taxa ML (%)</label><input style={s.input} type="number" step="0.1" value={previewTaxa} onChange={(e) => setPreviewTaxa(Number(e.target.value))} /></div>
                  </div>

                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr', gap: 8, textAlign: 'center' as const }}>
                      <div><div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 2 }}>PREÇO ML</div><div style={{ fontSize: 15, fontWeight: 700 }}>R$ {Number(previewBling.precoML).toFixed(2)}</div></div>
                      <div><div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 2 }}>TAXAS + FRETE</div><div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>- R$ {(valorTaxas + previewFrete).toFixed(2)}</div></div>
                      <div><div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 2 }}>LÍQUIDO</div><div style={{ fontSize: 15, fontWeight: 700, color: valorLiq >= 0 ? 'var(--green)' : '#dc2626' }}>R$ {valorLiq.toFixed(2)}</div></div>
                    </div>
                  </div>

                  {/* Link ML */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>Anúncio ML</div>
                    {previewBling.mercadoLivreLink ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 10 }}>✓ OK</span>
                        <a href={previewBling.mercadoLivreLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb' }}>Ver anúncio</a>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 10 }}>Pendente</span>
                    )}
                  </div>

                  {Number(previewBling.estoque) > 1 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                      ⚠ Estoque = {previewBling.estoque} → serão criados {previewBling.estoque} registros: {itemFinalizar.idPeca}{Number(previewBling.estoque) > 1 ? `, ${itemFinalizar.idPeca}-2` : ''}{Number(previewBling.estoque) > 2 ? '...' : ''}
                    </div>
                  )}
                  {previewBling.detranEtiqueta && (() => {
                    const etqs = previewBling.detranEtiqueta.split('/').map((e: string) => e.trim()).filter(Boolean);
                    const qtd = Number(previewBling.estoque) || 1;
                    if (etqs.length !== qtd) {
                      return (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, color: '#dc2626' }}>
                          ✗ {etqs.length} etiqueta(s) Detran mas estoque = {qtd}. Corrija no pré-cadastro antes de confirmar.
                        </div>
                      );
                    }
                    return (
                      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 10, fontSize: 12, color: '#16a34a' }}>
                        ✓ {etqs.length} etiqueta(s) Detran — cada variação receberá a sua: {etqs.map((e: string, i: number) => `${itemFinalizar.idPeca}${i > 0 ? `-${i+1}` : ''} → ${e}`).join(', ')}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </div>
            <div style={{ padding: isPhone ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isPhone ? 'column-reverse' : 'row', flexShrink: 0 }}>
              <button onClick={() => { setModalFinalizar(false); setFotoPreviewOpen(false); }} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>Cancelar</button>
              <button onClick={confirmarFinalizar} disabled={!canCriarProdutoBling || confirmando || !previewBling || loadingPreview}
                style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: (!canCriarProdutoBling || confirmando || !previewBling || loadingPreview) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>
                {confirmando ? 'Lançando...' : '✓ Confirmar e Lançar no Estoque'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
