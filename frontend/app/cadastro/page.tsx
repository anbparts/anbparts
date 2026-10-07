'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEtiquetaMotoLabel, printSkuLabels } from '@/lib/estoque-label-print';
import ModalImpressaoA4 from '@/app/components/ModalImpressaoA4';
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
  numeroPeca?: string; numeroMotor?: string; detranEtiqueta?: string; tipoPecaAvulsa?: string; localizacao?: string;
  estoque: number; categoriaMLId?: string; categoriaMLNome?: string;
  urlRef?: string; fotoCapa?: string; fotoCapaNome?: string; status: string; blingProdutoId?: string;
  pecaRestrita?: boolean;
  sucata?: boolean;
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
  shopee: { fotos: number; encontrado: boolean; itemId?: string | null; erro?: string };
  magalu: { fotos: number; encontrado: boolean; itemId?: string | null; erro?: string };
  flags: { anb: boolean; ml: boolean; nuvemshop: boolean; shopee: boolean; magalu: boolean };
  temFlag: boolean;
  drive?: { fotos: number | null; pasta?: string };
  status?: string;
};

type CadastroFotosSistema = 'anb' | 'ml' | 'nuvemshop' | 'shopee' | 'magalu';
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

type ManutencaoFotosLinha = {
  sku: string;
  ok: boolean;
  erro: string;
  totalFotos: number;
  pastaFotos: string;
  temMl: boolean;
  temNuvemshop: boolean;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  etapaAtual: string;
  mlOk: boolean | null;
  mlErro: string;
  nuvemshopOk: boolean | null;
  nuvemshopErro: string;
};

const FOTOS_SISTEMAS_PROCESSAMENTO: CadastroFotosSistema[] = ['anb', 'ml', 'nuvemshop', 'shopee', 'magalu'];
const FOTOS_SISTEMA_LABEL: Record<CadastroFotosSistema, string> = {
  anb: 'ANB',
  ml: 'Mercado Livre',
  nuvemshop: 'Nuvemshop',
  shopee: 'Shopee',
  magalu: 'Magalu',
};
const CATEGORIA_PACOTES_STORAGE_KEY = 'anb.cadastro.categoria.pacotes';

const EMPTY_FORM = {
  motoId: '', idPeca: '', descricao: '', descricaoPeca: '', precoVenda: '', sufixoTitulo: '',
  condicao: 'usado', peso: '', largura: '', altura: '', profundidade: '',
  numeroPeca: '', numeroMotor: '', detranEtiqueta: '', tipoPecaAvulsa: '', localizacao: '', estoque: '1',
  categoriaMLId: '', categoriaMLNome: '', urlRef: '', fotoCapa: '', fotoCapaNome: '',
  pecaRestrita: false,
  sucata: false,
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

function ReferenciaSkuModal({
  open,
  skuInput,
  loading,
  error,
  resultado,
  onChangeSkuInput,
  onBuscar,
  onAplicar,
  onClose,
}: {
  open: boolean;
  skuInput: string;
  loading: boolean;
  error: string;
  resultado: any;
  onChangeSkuInput: (value: string) => void;
  onBuscar: () => void;
  onAplicar: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  function Field({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
    const display = value != null && value !== '' ? String(value) : '—';
    return (
      <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: display === '—' ? 'var(--gray-300)' : 'var(--gray-800)', fontFamily: mono ? 'Geist Mono, monospace' : 'inherit', overflowWrap: 'anywhere' as const }}>{display}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Puxar Referência do Bling</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>Consulta em tempo real — nada é salvo, só serve de apoio pra preencher o pré-cadastro.</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          <label style={s.label}>SKU de referência</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={s.input}
              value={skuInput}
              onChange={(e) => onChangeSkuInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && skuInput.trim() && !loading) onBuscar(); }}
              placeholder="Ex: HD03_0048"
              autoFocus
            />
            <button
              type="button"
              onClick={onBuscar}
              disabled={loading || !skuInput.trim()}
              style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: (loading || !skuInput.trim()) ? 0.6 : 1, whiteSpace: 'nowrap' as const }}
            >
              {loading ? 'Buscando...' : '🔍 Buscar'}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 12, background: '#fff7f7', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 12px', fontSize: 12.5 }}>
              {error}
            </div>
          )}

          {resultado && (
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <Field label="SKU" value={resultado.sku} mono />
              <Field label="Descrição (título)" value={resultado.nome} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <Field label="Peso (kg)" value={resultado.peso} />
                <Field label="Largura (cm)" value={resultado.largura} />
                <Field label="Altura (cm)" value={resultado.altura} />
                <Field label="Prof. (cm)" value={resultado.profundidade} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Preço de Venda" value={resultado.precoVenda != null ? `R$ ${Number(resultado.precoVenda).toFixed(2)}` : null} />
                <Field label="Localização (Bling)" value={resultado.localizacaoBling} />
              </div>
              <Field label="Número da Peça (fabricante)" value={resultado.numeroPeca} mono />
              <Field label="URL de Referência" value={resultado.urlRef} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Descrição da Peça (corpo do anúncio)</div>
                <div
                  style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, maxHeight: 220, overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: resultado.descricaoPeca || '<span style="color:var(--gray-300)">—</span>' }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>
                Localização, número da peça e URL são só referência — não serão copiados (são específicos daquele SKU/moto).
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Fechar</button>
          <button
            onClick={onAplicar}
            disabled={!resultado}
            style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: !resultado ? 0.5 : 1 }}
          >
            ✅ Aplicar ao formulário
          </button>
        </div>
      </div>
    </div>
  );
}

// Colunas da tabela de Cadastro (SKU). key=null => não ordenável.
const CADASTRO_COLUNAS: { label: string; key: string | null }[] = [
  { label: 'ID Peça', key: 'idPeca' },
  { label: 'Descrição', key: 'descricao' },
  { label: 'Moto', key: 'moto' },
  { label: 'Data Pré-Cadastro', key: 'createdAt' },
  { label: 'Preço', key: 'precoVenda' },
  { label: 'Estoque', key: 'estoque' },
  { label: 'Pré-Cadastro', key: null },
  { label: 'Cadastro', key: 'status' },
  { label: 'Ações', key: null },
];

function valorOrdenacaoCadastro(item: any, key: string): number | string {
  switch (key) {
    case 'idPeca': return String(item.idPeca || '');
    case 'descricao': return String(item.descricao || '').toLowerCase();
    case 'moto': return `${item.moto?.marca || ''} ${item.moto?.modelo || ''}`.trim().toLowerCase();
    case 'createdAt': return new Date(item.createdAt || 0).getTime();
    case 'precoVenda': return Number(item.precoVenda) || 0;
    case 'estoque': return Number(item.estoque) || 0;
    case 'status': return item.status === 'cadastrado' ? 1 : 0;
    default: return '';
  }
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
  const [sortCadastro, setSortCadastro] = useState<{ key: string | null; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });
  const [a4Sel, setA4Sel] = useState<Set<number>>(new Set());
  const [modalA4Open, setModalA4Open] = useState(false);
  const [loading, setLoading] = useState(true);
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [filters, setFilters] = useState({ motoId: '', search: '', skus: '', semDimensoes: '', comDimensoes: '', preCadastroCompleto: '' });
  const [searchInput, setSearchInput] = useState('');
  const [skusListaAberta, setSkusListaAberta] = useState(false);
  const [skusListaTexto, setSkusListaTexto] = useState('');
  const [resumoOpen, setResumoOpen] = useState(false);
  const [resumoLoading, setResumoLoading] = useState(false);
  const [resumoData, setResumoData] = useState<any>(null);
  const [resumoFiltro, setResumoFiltro] = useState<'' | 'liberadas' | 'pendentes' | 'pendente_imagens' | 'sem_fotos'>('');
  const [resumoFiltroSku, setResumoFiltroSku] = useState('');
  const [skusCopiados, setSkusCopiados] = useState(false);
  const [paginaCadastro, setPaginaCadastro] = useState<'sku' | 'fotos-drive' | 'anuncio' | 'fotos' | 'categoria' | 'fotos-manutencao'>('sku');
  // Aba Anuncio: cria anuncios de verdade em varios marketplaces (busca SKUs, categoria com ajuste
  // manual, fila 1-a-1 com progresso — mesmo padrao da aba Fotos Anuncios), avisando o Bling
  // automaticamente em seguida. Hoje: Shopee (categoria mapeada) e Magalu (categoria ainda
  // pendente de mapeamento — ver reference_magalu_api). Cada SKU pode ser criado em 1+ marketplaces
  // no mesmo lote; cada marketplace tem seu proprio status/erro, independente dos outros.
  type AnuncioMarketplaceId = 'shopee' | 'magalu' | 'nuvemshop' | 'mercado-livre';
  const ANUNCIO_MARKETPLACES: { id: AnuncioMarketplaceId; label: string; cor: string }[] = [
    { id: 'shopee', label: 'Shopee', cor: '#ee4d2d' },
    { id: 'magalu', label: 'Magalu', cor: '#0047bb' },
    { id: 'nuvemshop', label: 'Nuvemshop', cor: '#0f766e' },
    { id: 'mercado-livre', label: 'Mercado Livre', cor: '#b45309' },
  ];
  type ShopeeCategoriaOpcao = { id: number | string; categoria?: string; subcategoria?: string; nivel3?: string; nivel4?: string; permitido: boolean; caminho: string; generica: boolean };
  type AnuncioLinhaMarketplace = {
    disponivel: boolean; // esse marketplace foi incluido nessa busca
    jaTemAnuncio: boolean;
    itemId: string | null;
    categoriaAtual: ShopeeCategoriaOpcao | null;
    categoriaEscolhidaId: number | string | null;
    categoriaPendente: boolean; // true = mapeamento automatico de categoria ainda nao existe (Magalu)
    selecionado: boolean;
    status: 'pendente' | 'processando' | 'ok' | 'erro';
    resultado: any;
    erroProcessamento: string;
    restricoes?: string[]; // Mercado Livre: restricoes da categoria sugerida/escolhida (bloqueia a criacao ate ajustar)
    categoriaPreCadastro?: { id: string; nome: string } | null;
    sugestaoOrigem?: string;
    // Campos obrigatorios da categoria que o sistema nao sabe preencher (ex: Magalu/Pneu): a tela pede o valor.
    fichaFaltando?: { nome: string; exemplo: string; escolhas: string[] | null }[];
    fichaValores?: Record<string, string>;
  };
  type AnuncioAjuste = { aberto: boolean; carregando: boolean; salvando: boolean; titulo: string; descricao: string; condicao: 'usado' | 'novo'; original: { titulo: string; descricao: string; condicao: string } | null; msg: string; erro: string };
  type AnuncioCriarLinha = {
    sku: string;
    encontrado: boolean;
    bloqueioTexto?: string; // motivo especifico do bloqueio (ex: pneu usado)
    semEstoque?: boolean; // sem unidade disponivel: nada e' criado
    fotosOk: boolean; // pasta do SKU ja esta na pasta oficial da moto (Fotos Anuncios processado)
    origem?: string;
    erro?: string;
    descricao?: string;
    moto?: { marca?: string; modelo?: string; ano?: number } | null;
    preco?: number;
    peso?: number | null;
    largura?: number | null;
    altura?: number | null;
    profundidade?: number | null;
    estoque?: number;
    marketplaces: Record<AnuncioMarketplaceId, AnuncioLinhaMarketplace>;
  };
  function criarMarketplaceVazio(): AnuncioLinhaMarketplace {
    return { disponivel: false, jaTemAnuncio: false, itemId: null, categoriaAtual: null, categoriaEscolhidaId: null, categoriaPendente: false, selecionado: false, status: 'pendente', resultado: null, erroProcessamento: '' };
  }
  const [shopeeCategorias, setShopeeCategorias] = useState<ShopeeCategoriaOpcao[]>([]);
  const [magaluCategorias, setMagaluCategorias] = useState<ShopeeCategoriaOpcao[]>([]);
  const [nuvemshopCategorias, setNuvemshopCategorias] = useState<ShopeeCategoriaOpcao[]>([]);
  const [mlCategorias, setMlCategorias] = useState<ShopeeCategoriaOpcao[]>([]);
  const categoriasDoMarketplace = (mk: AnuncioMarketplaceId) => (mk === 'magalu' ? magaluCategorias : mk === 'nuvemshop' ? nuvemshopCategorias : mk === 'mercado-livre' ? mlCategorias : shopeeCategorias);
  const carregarCategoriasDoMarketplace = (mk: AnuncioMarketplaceId) => { if (mk === 'magalu') carregarMagaluCategorias(); else if (mk === 'nuvemshop') carregarNuvemshopCategorias(); else if (mk === 'mercado-livre') carregarMlCategorias(); else carregarShopeeCategorias(); };
  // Ajuste de titulo/condicao/texto por SKU (Bling + cadastro), pra corrigir falha de cadastro na hora de anunciar.
  const [anuncioAjustes, setAnuncioAjustes] = useState<Record<string, AnuncioAjuste>>({});
  // IDs de anuncio por SKU/marketplace: no nosso sistema x no Bling (vinculo produto-loja).
  type AnuncioVinculoMk = { sistemaId: string | null; blingCodigo: string | null; blingVinculoId: string | null; blingAnuncioId: string | null; situacao?: { texto: string; ok: boolean } | null; status: 'livre' | 'ok' | 'divergente' | 'so_bling' | 'so_sistema' };
  const [anuncioVinculos, setAnuncioVinculos] = useState<Record<string, { erroBling?: string; mercados: Record<string, AnuncioVinculoMk> }>>({});
  const [anuncioVinculoOcupado, setAnuncioVinculoOcupado] = useState<string>('');
  const [anuncioMarketplacesSelecionados, setAnuncioMarketplacesSelecionados] = useState<Set<AnuncioMarketplaceId>>(new Set<AnuncioMarketplaceId>(['shopee', 'magalu', 'nuvemshop', 'mercado-livre']));
  const [anuncioCriarSkusInput, setAnuncioCriarSkusInput] = useState('');
  const [anuncioCriarBuscando, setAnuncioCriarBuscando] = useState(false);
  const [anuncioCriarLinhas, setAnuncioCriarLinhas] = useState<AnuncioCriarLinha[]>([]);
  const [anuncioCriarProcessando, setAnuncioCriarProcessando] = useState(false);
  const [anuncioCriarSkuAtual, setAnuncioCriarSkuAtual] = useState('');
  const [anuncioCriarMarketplaceAtual, setAnuncioCriarMarketplaceAtual] = useState<AnuncioMarketplaceId | ''>('');
  const [anuncioCriarProgresso, setAnuncioCriarProgresso] = useState({ atual: 0, total: 0 });
  const [anuncioExpandidos, setAnuncioExpandidos] = useState<Set<string>>(new Set<string>());
  const [anuncioFiltro, setAnuncioFiltro] = useState<'todos' | 'prontos' | 'problema'>('todos');
  const [anuncioPagina, setAnuncioPagina] = useState(0);
  const [anuncioStatusRapido, setAnuncioStatusRapido] = useState<Record<string, Record<string, { texto: string; ok: boolean } | null>>>({});
  const [anuncioVerificando, setAnuncioVerificando] = useState(false);
  const [skuCopiado, setSkuCopiado] = useState('');
  const [excluirModal, setExcluirModal] = useState<{ sku: string; mk: AnuncioMarketplaceId } | null>(null);
  const [categoriaModalSku, setCategoriaModalSku] = useState<string | null>(null);
  const [categoriaModalMarketplace, setCategoriaModalMarketplace] = useState<AnuncioMarketplaceId>('shopee');
  const [categoriaModalBusca, setCategoriaModalBusca] = useState('');
  // Fotos - Manutencao: substitui as fotos de anuncios ja publicados (ML/Nuvemshop) pelas fotos
  // ja tratadas na pasta oficial da moto (rodar Fotos Drive antes e' obrigatorio). Processa 1 SKU
  // por vez, etapa por etapa, pra mostrar o avanco na tela (igual a aba Fotos Anúncios).
  const [manutencaoSkusInput, setManutencaoSkusInput] = useState('');
  const [manutencaoPreparando, setManutencaoPreparando] = useState(false);
  const [manutencaoProcessando, setManutencaoProcessando] = useState(false);
  const [manutencaoLinhas, setManutencaoLinhas] = useState<ManutencaoFotosLinha[]>([]);
  const [manutencaoSkuAtual, setManutencaoSkuAtual] = useState('');
  const [manutencaoErro, setManutencaoErro] = useState('');

  function atualizarManutencaoLinha(sku: string, patch: Partial<ManutencaoFotosLinha>) {
    setManutencaoLinhas((prev: ManutencaoFotosLinha[]) => prev.map((l) => (l.sku === sku ? { ...l, ...patch } : l)));
  }

  async function prepararManutencaoUi() {
    if (!manutencaoSkusInput.trim()) return;
    setManutencaoPreparando(true);
    setManutencaoErro('');
    setManutencaoLinhas([]);
    try {
      const resp = await fetch(`${API}/cadastro/fotos/manutencao/preparar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: manutencaoSkusInput }),
      });
      const data = await readApiResponse(resp, 'Erro ao preparar manutencao de fotos');
      const itens: any[] = Array.isArray(data.itens) ? data.itens : [];
      setManutencaoLinhas(itens.map((item) => ({
        sku: item.sku,
        ok: Boolean(item.ok),
        erro: item.erro || '',
        totalFotos: item.totalFotos || 0,
        pastaFotos: item.pastaFotos || '',
        temMl: Boolean(item.temMl),
        temNuvemshop: Boolean(item.temNuvemshop),
        status: item.ok ? 'pendente' : 'erro',
        etapaAtual: '',
        mlOk: null,
        mlErro: '',
        nuvemshopOk: null,
        nuvemshopErro: '',
      })));
    } catch (e: any) {
      setManutencaoErro(e?.message || 'Erro ao preparar manutencao de fotos.');
    }
    setManutencaoPreparando(false);
  }

  async function manutencaoPostJson(path: string, body: any) {
    const resp = await fetch(`${API}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return readApiResponse(resp, 'Erro na manutencao de fotos');
  }

  async function processarManutencaoTodos() {
    const pendentes = manutencaoLinhas.filter((l: ManutencaoFotosLinha) => l.ok && l.status === 'pendente');
    if (!pendentes.length) return;
    setManutencaoProcessando(true);

    for (const linha of pendentes) {
      setManutencaoSkuAtual(linha.sku);
      atualizarManutencaoLinha(linha.sku, { status: 'processando' });

      if (linha.temMl) {
        atualizarManutencaoLinha(linha.sku, { etapaAtual: 'Subindo fotos novas no Mercado Livre...' });
        try {
          const up = await manutencaoPostJson('/cadastro/fotos/manutencao/ml-upload', { sku: linha.sku });
          if (up.ok) {
            atualizarManutencaoLinha(linha.sku, { etapaAtual: 'Trocando fotos no Mercado Livre...' });
            const troca = await manutencaoPostJson('/cadastro/fotos/manutencao/ml-trocar', { itemId: up.itemId, ids: up.ids });
            atualizarManutencaoLinha(linha.sku, { mlOk: Boolean(troca.ok), mlErro: troca.erro || '' });
          } else {
            atualizarManutencaoLinha(linha.sku, { mlOk: false, mlErro: up.erro || 'Falha ao subir fotos.' });
          }
        } catch (e: any) {
          atualizarManutencaoLinha(linha.sku, { mlOk: false, mlErro: e?.message || 'Erro no Mercado Livre.' });
        }
      } else {
        atualizarManutencaoLinha(linha.sku, { mlOk: false, mlErro: 'SKU sem item vinculado no Mercado Livre.' });
      }

      if (linha.temNuvemshop) {
        atualizarManutencaoLinha(linha.sku, { etapaAtual: 'Apagando fotos antigas na Nuvemshop...' });
        try {
          const limpar = await manutencaoPostJson('/cadastro/fotos/manutencao/nuvemshop-limpar', { sku: linha.sku });
          if (limpar.ok) {
            atualizarManutencaoLinha(linha.sku, { etapaAtual: 'Enviando fotos novas na Nuvemshop...' });
            const enviar = await manutencaoPostJson('/cadastro/fotos/manutencao/nuvemshop-enviar', { sku: linha.sku });
            atualizarManutencaoLinha(linha.sku, { nuvemshopOk: Boolean(enviar.ok), nuvemshopErro: enviar.erro || '' });
          } else {
            atualizarManutencaoLinha(linha.sku, { nuvemshopOk: false, nuvemshopErro: limpar.erro || 'Falha ao apagar fotos antigas.' });
          }
        } catch (e: any) {
          atualizarManutencaoLinha(linha.sku, { nuvemshopOk: false, nuvemshopErro: e?.message || 'Erro na Nuvemshop.' });
        }
      } else {
        atualizarManutencaoLinha(linha.sku, { nuvemshopOk: false, nuvemshopErro: 'SKU sem produto encontrado na Nuvemshop.' });
      }

      atualizarManutencaoLinha(linha.sku, { status: 'concluido', etapaAtual: '' });
    }

    setManutencaoSkuAtual('');
    setManutencaoProcessando(false);
  }
  // Camera de foto direto na pagina (mobile): cada foto tirada sobe pro Drive na hora (nao mais em
  // lote no "Finalizar" — lote de ate 12 fotos em alta resolucao estourava o limite de requisicao).
  type CameraFoto = { id: string; dataUrl: string; status: 'enviando' | 'ok' | 'erro'; fileId?: string; pastaId?: string; error?: string };
  const [cameraSku, setCameraSku] = useState<string | null>(null);
  const [cameraFotos, setCameraFotos] = useState<CameraFoto[]>([]);
  const [cameraErro, setCameraErro] = useState('');
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraScrollPosRef = useRef(0);
  const CAMERA_MAX_FOTOS = 12;

  function restaurarScrollPosCamera() {
    const y = cameraScrollPosRef.current;
    // Roda depois do modal sair da tela e do alert() fechar (ambos podem mexer no scroll do
    // navegador mobile) — 2 tentativas garantem que a posição final seja a que estava antes.
    requestAnimationFrame(() => window.scrollTo(0, y));
    setTimeout(() => window.scrollTo(0, y), 150);
  }
  // Aba "Fotos Drive" (processamento do zip do Canva)
  const [fdModo, setFdModo] = useState<'data' | 'sku'>('data');
  const [fdDataDe, setFdDataDe] = useState('');
  const [fdDataAte, setFdDataAte] = useState('');
  const [fdSku, setFdSku] = useState('');
  const [fdScanning, setFdScanning] = useState(false);
  const [fdProcessando, setFdProcessando] = useState(false);
  const [fdItens, setFdItens] = useState<any[]>([]);
  const [fdCopiado, setFdCopiado] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const [fotosModo, setFotosModo] = useState<'skus' | 'data'>('skus');
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
  const [categoriaModo, setCategoriaModo] = useState<'data' | 'skus'>('skus');
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

  // Tela baixa (monitor pequeno/resolucao menor): os modais passam a ter UMA rolagem so (no corpo
  // inteiro) em vez de uma por coluna — assim nada fica escondido atras de uma barra interna.
  const [telaBaixa, setTelaBaixa] = useState(false);
  useEffect(() => {
    const sync = () => setTelaBaixa(window.innerHeight < 900);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
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
  const [modalConfig, setModalConfig] = useState(false);
  const [configMotoIdDefault, setConfigMotoIdDefault] = useState<string>('');
  const [configMotoIdDraft, setConfigMotoIdDraft] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
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
  const [finalizarRestrita, setFinalizarRestrita] = useState(false);
  const [finalizarSucata, setFinalizarSucata] = useState(false);
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
  const [refSkuModalOpen, setRefSkuModalOpen] = useState(false);
  const [refSkuInput, setRefSkuInput] = useState('');
  const [refSkuLoading, setRefSkuLoading] = useState(false);
  const [refSkuError, setRefSkuError] = useState('');
  const [refSkuResultado, setRefSkuResultado] = useState<any>(null);

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
      const [resp, catResp, cfgResp] = await Promise.all([
        fetch(`${API}/cadastro/opcoes`, { credentials: 'include' }),
        fetch(`${API}/nuvemshop/categorias`, { credentials: 'include' }).catch(() => null),
        api.cadastroConfig.get().catch(() => null),
      ]);
      const d = await resp.json();
      setMotos(Array.isArray(d?.motos) ? d.motos : []);
      setCaixas(Array.isArray(d?.caixas) ? d.caixas : []);
      if (catResp) {
        const catData = await readApiResponse(catResp, 'Erro ao carregar categorias').catch(() => null);
        if (catData?.ok) setCategoriasNuvemshop(Array.isArray(catData.categorias) ? catData.categorias : []);
      }
      if (cfgResp?.cadastroMotoIdDefault != null) {
        setConfigMotoIdDefault(String(cfgResp.cadastroMotoIdDefault));
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
      if (filters.skus) params.set('skus', filters.skus);
      if (filters.semDimensoes) params.set('semDimensoes', filters.semDimensoes);
      if (filters.comDimensoes) params.set('comDimensoes', filters.comDimensoes);
      if (filters.preCadastroCompleto) params.set('preCadastroCompleto', filters.preCadastroCompleto);
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

  async function abrirResumo() {
    setResumoOpen(true);
    setResumoLoading(true);
    setResumoData(null);
    setResumoFiltro('');
    setResumoFiltroSku('');
    try {
      const params = new URLSearchParams();
      if (somentePendentes) params.set('somentePendentes', 'true');
      if (filters.motoId) params.set('motoId', filters.motoId);
      if (filters.search) params.set('search', filters.search);
      if (filters.skus) params.set('skus', filters.skus);
      if (filters.semDimensoes) params.set('semDimensoes', filters.semDimensoes);
      if (filters.comDimensoes) params.set('comDimensoes', filters.comDimensoes);
      if (filters.preCadastroCompleto) params.set('preCadastroCompleto', filters.preCadastroCompleto);
      const d = await fetch(`${API}/cadastro/resumo?${params}`, { credentials: 'include' }).then(r => r.json());
      if (!d?.ok) { alert(d?.error || 'Erro ao gerar resumo'); setResumoOpen(false); }
      else setResumoData(d);
    } catch (e: any) {
      alert(e?.message || 'Erro ao gerar resumo');
      setResumoOpen(false);
    }
    setResumoLoading(false);
  }

  function itensResumoFiltrados() {
    const itens = resumoData?.itens || [];
    return itens.filter((it: any) =>
      (resumoFiltro === ''
        || (resumoFiltro === 'liberadas' && it.liberada)
        || (resumoFiltro === 'pendentes' && !it.liberada)
        || (resumoFiltro === 'pendente_imagens' && it.imagens === 'pendente_tratamento')
        || (resumoFiltro === 'sem_fotos' && it.imagens === 'sem_fotos'))
      && (!resumoFiltroSku || String(it.sku).toUpperCase().includes(resumoFiltroSku.toUpperCase())));
  }

  async function copiarSkusResumo() {
    const skusOrdenados = itensResumoFiltrados()
      .map((it: any) => String(it.sku))
      .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    try {
      await navigator.clipboard.writeText(skusOrdenados.join('\n'));
      setSkusCopiados(true);
      setTimeout(() => setSkusCopiados(false), 2000);
    } catch {
      alert('Não foi possível copiar. Selecione e copie manualmente.');
    }
  }

  async function abrirCamera(sku: string) {
    cameraScrollPosRef.current = window.scrollY;
    setCameraErro('');
    setCameraFotos([]);
    setCameraSku(sku);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // width/height iguais (sem viesar formato paisagem/retrato) — o navegador entrega a
          // maior resolucao do sensor respeitando a orientacao fisica real do aparelho no
          // momento (vertical se o celular estiver em pe, deitada se estiver deitado).
          width: { ideal: 4096 },
          height: { ideal: 4096 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      // O <video> só existe depois do modal renderizar (cameraSku setado); aguarda o próximo tick.
      setTimeout(() => {
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      }, 0);
    } catch {
      setCameraErro('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
    }
  }

  function pararCameraStream() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  }

  function fecharCamera() {
    // Fotos com status "ok" ja subiram pro Drive (sobem na hora, nao mais so no Finalizar) —
    // fechar nao descarta nada que ja foi enviado. So avisa se alguma falhou e ficaria pra tras.
    const comErro = cameraFotos.filter((f) => f.status === 'erro').length;
    if (comErro && !confirm(`${comErro} foto(s) falharam ao enviar e não foram salvas. Sair mesmo assim?`)) return;
    pararCameraStream();
    setCameraSku(null);
    setCameraFotos([]);
    setCameraErro('');
    restaurarScrollPosCamera();
  }

  function tirarFotoCamera() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth) return;
    if (cameraFotos.length >= CAMERA_MAX_FOTOS) { setCameraErro(`Máximo de ${CAMERA_MAX_FOTOS} fotos por SKU.`); return; }
    const maxDim = 4096;
    let w = video.videoWidth, h = video.videoHeight;
    if (Math.max(w, h) > maxDim) {
      const escala = maxDim / Math.max(w, h);
      w = Math.round(w * escala);
      h = Math.round(h * escala);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.97);
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setCameraFotos((prev) => [...prev, { id, dataUrl, status: 'enviando' }]);
    setCameraErro('');
    enviarFotoCameraServidor(id, dataUrl);
  }

  // Sobe a foto assim que e tirada (nao espera o "Finalizar") — cada uma vira uma requisicao
  // pequena, entao 12 fotos em alta resolucao nao estouram mais limite nenhum.
  async function enviarFotoCameraServidor(id: string, dataUrl: string) {
    const skuAtual = cameraSku;
    if (!skuAtual) return;
    try {
      const resp = await fetch(`${API}/cadastro/fotos/camera`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: skuAtual, foto: dataUrl }),
      });
      const data = await readApiResponse(resp, 'Erro ao enviar foto');
      setCameraFotos((prev) => prev.map((f) => (f.id === id ? { ...f, status: 'ok', fileId: data.fileId, pastaId: data.pastaId } : f)));
    } catch (e: any) {
      setCameraFotos((prev) => prev.map((f) => (f.id === id ? { ...f, status: 'erro', error: e?.message || 'Erro ao enviar foto.' } : f)));
    }
  }

  // Foto ja enviada (verde) precisa ser apagada do Drive tambem, senao fica orfa na pasta do SKU.
  async function removerFotoCamera(id: string) {
    const foto = cameraFotos.find((f) => f.id === id);
    if (!foto || foto.status === 'enviando') return; // evita corrida com o upload em andamento
    setCameraFotos((prev) => prev.filter((f) => f.id !== id));
    if (foto.status === 'ok' && foto.fileId) {
      try {
        const resp = await fetch(`${API}/cadastro/fotos/camera`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: foto.fileId, pastaId: foto.pastaId }),
        });
        if (!resp.ok) throw new Error();
      } catch {
        alert('A foto foi removida da lista, mas pode não ter sido apagada do Drive. Verifique a pasta do SKU.');
      }
    }
  }

  function finalizarFotosCamera() {
    if (!cameraFotos.length) return;
    if (cameraFotos.some((f) => f.status === 'enviando')) {
      setCameraErro('Aguarde o envio de todas as fotos terminar.');
      return;
    }
    const enviadas = cameraFotos.filter((f) => f.status === 'ok').length;
    const comErro = cameraFotos.filter((f) => f.status === 'erro').length;
    pararCameraStream();
    setCameraSku(null);
    setCameraFotos([]);
    setCameraErro('');
    restaurarScrollPosCamera();
    alert(comErro
      ? `${enviadas} foto(s) enviada(s). ${comErro} falharam e não foram enviadas — tire essas fotos de novo se precisar.`
      : `${enviadas} foto(s) enviada(s) para a pasta do SKU no Drive.`);
  }

  function toggleSortCadastro(key: string) {
    setSortCadastro((cur) => cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  const linhasOrdenadasCadastro = (() => {
    const k = sortCadastro.key;
    if (!k) return data.data;
    const factor = sortCadastro.dir === 'asc' ? 1 : -1;
    return [...data.data].sort((a, b) => {
      const va = valorOrdenacaoCadastro(a, k);
      const vb = valorOrdenacaoCadastro(b, k);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
    });
  })();

  function toggleA4Sel(id: number) {
    setA4Sel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleA4SelTodos() {
    setA4Sel((prev) => prev.size === linhasOrdenadasCadastro.length ? new Set() : new Set(linhasOrdenadasCadastro.map((i) => i.id)));
  }
  // Expande os SKUs selecionados em 1 etiqueta por unidade (variações -2, -3...), na ordem da tabela.
  const etiquetasA4 = linhasOrdenadasCadastro
    .filter((it) => a4Sel.has(it.id))
    .flatMap((it) => buildCadastroSkuEtiquetas(it));

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
        setFotosBuscaStatus(`Buscando fotos Nuvemshop, Mercado Livre, Shopee e Drive (${index + 1}/${skusParaVerificar.length}) - ${sku}`);
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
          const skuNormalizado = String(sugestao?.sku || '').trim().toUpperCase();
          if (skuNormalizado) sugestoesMap[skuNormalizado] = sugestao;
        });
        analisados += lote.length;
        setCategoriaSugestoes({ ...sugestoesMap });
        setCategoriaProgresso({ atual: analisados, total: alvo.length });
      }

      const semSugestao: string[] = [];
      const aplicacoes = alvo
        .map((linha) => {
          const sugestao = sugestoesMap[linha.sku];
          if (!sugestao) { semSugestao.push(linha.sku); return null; }
          return { sku: linha.sku, produtoId: linha.produtoId, categorias: sugestao.categorias || [], tags: sugestao.tags || [] };
        })
        .filter(Boolean) as any[];

      if (semSugestao.length) {
        setCategoriaLinhas((prev) => ordenarCategoriaLinhas(prev.map((linha) => (
          semSugestao.includes(linha.sku)
            ? { ...linha, status: 'erro', erroConsulta: 'IA nao retornou sugestao para este SKU (verifique/tente novamente)' }
            : linha
        ))));
      }

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
          body: JSON.stringify({ aplicacoes: lote.map(({ sku, produtoId, categorias, tags }) => ({ sku, produtoId, categorias, tags })) }),
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

      const semSugestaoMsg = semSugestao.length ? `, ${semSugestao.length} sem sugestao da IA (${semSugestao.join(', ')})` : '';
      setCategoriaResultado(`Processamento concluido: ${atualizados} SKU(s) atualizado(s), ${erros} com erro${semSugestaoMsg}.`);
      setCategoriaStatus(`Categorias concluidas: ${atualizados} SKU(s) OK, ${erros} com erro${semSugestaoMsg}.`);
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

  function atualizarFlagFoto(sku: string, sistema: CadastroFotosSistema, checked: boolean) {
    setFotosLinhas((prev) => prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const flags = { ...linha.flags, [sistema]: checked };
      return { ...linha, flags, temFlag: flags.anb || flags.ml || flags.nuvemshop || flags.shopee || flags.magalu };
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
      const limite = sistema === 'ml' ? 12 : sistema === 'shopee' ? 9 : sistema === 'magalu' ? 8 : 999;
      const proximo = sistema === 'anb' ? Math.max(1, atual) : Math.min(limite, atual + Math.max(0, enviadas));
      const flags = { ...linha.flags, [sistema]: false };
      const temFlag = flags.anb || flags.ml || flags.nuvemshop || flags.shopee || flags.magalu;
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
      if (!(['anb', 'ml', 'nuvemshop', 'shopee', 'magalu'] as CadastroFotosSistema[]).includes(sistema)) continue;
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
      .filter((linha) => fotosSelecionados.has(linha.sku) && (linha.flags.anb || linha.flags.ml || linha.flags.nuvemshop || linha.flags.shopee || linha.flags.magalu))
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
              body: JSON.stringify({ linhas: [{ sku: linha.sku, flags: { anb: false, ml: false, nuvemshop: false, shopee: false, magalu: false, [sistema]: true } }] }),
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
    // Usa moto configurada como default; fallback para a de ID mais alto
    const motoConfigurada = configMotoIdDefault && motos.some(m => String(m.id) === configMotoIdDefault)
      ? configMotoIdDefault
      : (() => { const s = [...motos].sort((a, b) => b.id - a.id); return s[0]?.id ? String(s[0].id) : ''; })();
    const motoId = motoConfigurada;
    const form0 = { ...EMPTY_FORM, motoId };
    setForm(form0); setEditItem(null); setCategorias([]); setEtiquetas(['']); setFotoPreviewOpen(false);
    if (motoId) await carregarProximoId(motoId, form0);
    setModal(true);
  }

  function openConfig() {
    setConfigMotoIdDraft(configMotoIdDefault);
    setModalConfig(true);
  }

  async function salvarConfig() {
    setSavingConfig(true);
    try {
      const valor = configMotoIdDraft ? Number(configMotoIdDraft) : null;
      await api.cadastroConfig.save(valor);
      setConfigMotoIdDefault(configMotoIdDraft);
      setModalConfig(false);
    } catch { alert('Erro ao salvar configuração.'); }
    finally { setSavingConfig(false); }
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
      numeroPeca: item.numeroPeca || '', numeroMotor: item.numeroMotor || '', detranEtiqueta: item.detranEtiqueta || '',
      tipoPecaAvulsa: item.tipoPecaAvulsa || '', localizacao: item.localizacao || '', estoque: String(item.estoque),
      categoriaMLId: item.categoriaMLId || '', categoriaMLNome: item.categoriaMLNome || '',
      urlRef: item.urlRef || '', fotoCapa: item.fotoCapa || '', fotoCapaNome: item.fotoCapaNome || '',
      pecaRestrita: Boolean(item.pecaRestrita),
      sucata: Boolean(item.sucata),
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

  function abrirReferenciaSku() {
    setRefSkuInput('');
    setRefSkuError('');
    setRefSkuResultado(null);
    setRefSkuModalOpen(true);
  }

  async function buscarReferenciaSku() {
    const sku = refSkuInput.trim();
    if (!sku) return;
    setRefSkuLoading(true);
    setRefSkuError('');
    setRefSkuResultado(null);
    try {
      const resp = await fetch(`${API}/cadastro/bling-referencia/${encodeURIComponent(sku)}`, { credentials: 'include' });
      const data = await readApiResponse(resp, 'Erro ao consultar SKU no Bling');
      setRefSkuResultado(data);
    } catch (e: any) {
      setRefSkuError(e.message || 'Erro ao consultar SKU no Bling');
    }
    setRefSkuLoading(false);
  }

  async function aplicarReferenciaSku() {
    if (!refSkuResultado) return;
    if (!modal) await openNovo();
    if (refSkuResultado.nome) handleDescricaoPecaTituloChange(refSkuResultado.nome);
    setForm((p: any) => ({
      ...p,
      descricaoPeca: refSkuResultado.descricaoPeca || p.descricaoPeca,
      precoVenda: refSkuResultado.precoVenda != null ? String(refSkuResultado.precoVenda) : p.precoVenda,
      peso: refSkuResultado.peso != null ? String(refSkuResultado.peso) : p.peso,
      largura: refSkuResultado.largura != null ? String(refSkuResultado.largura) : p.largura,
      altura: refSkuResultado.altura != null ? String(refSkuResultado.altura) : p.altura,
      profundidade: refSkuResultado.profundidade != null ? String(refSkuResultado.profundidade) : p.profundidade,
    }));
    setRefSkuModalOpen(false);
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
    // Validar Tipo de Peça para etiquetas avulsas
    const etiquetasValidas = etiquetas.filter(e => e.trim());
    const possuiAvulsa = etiquetasValidas.some(e => !parseEtiquetaCartela(e));
    if (possuiAvulsa && !form.tipoPecaAvulsa) return alert('Selecione o Tipo de Peça para a etiqueta avulsa');
    const ehBlocoMotor = etiquetasValidas.some(e => /005$/.test(e.trim())) || form.tipoPecaAvulsa === 'Bloco do motor';
    if (ehBlocoMotor && !String(form.numeroMotor || '').trim()) return alert('Informe o Número do Motor (obrigatório para Bloco do motor: etiqueta final 005 ou tipo avulso Bloco do motor).');
    setSaving(true);
    try {
      const body = {
        motoId: Number(form.motoId), idPeca: form.idPeca, descricao: form.descricao,
        descricaoPecaTitulo: form.descricaoPecaTitulo || form.descricao,
        descricaoPeca: form.descricaoPeca || null, precoVenda: Number(form.precoVenda) || 0,
        condicao: form.condicao,
        peso: form.peso ? Number(form.peso) : null, largura: form.largura ? Number(form.largura) : null,
        altura: form.altura ? Number(form.altura) : null, profundidade: form.profundidade ? Number(form.profundidade) : null,
        numeroPeca: form.numeroPeca || null,
        numeroMotor: form.numeroMotor || null,
        detranEtiqueta: etiquetas.filter(e => e.trim()).length > 0
          ? etiquetas.filter(e => e.trim()).map(e => e.trim()).join(' / ')
          : null,
        localizacao: form.localizacao || null, estoque: Number(form.estoque) || 1,
        categoriaMLId: form.categoriaMLId || null, categoriaMLNome: form.categoriaMLNome || null,
        urlRef: form.urlRef || null,
        tipoPecaAvulsa: form.tipoPecaAvulsa || null,
        pecaRestrita: Boolean(form.pecaRestrita),
        sucata: Boolean(form.sucata),
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

  async function excluir(force = false, confirmarFotos = false) {
    if (!editItem) return;
    if (!isBruno) {
      alert('Apenas o usuario Bruno pode excluir linhas do cadastro.');
      return;
    }
    if (!confirmarFotos) {
      const msg = `Eliminar o pré-cadastro ${editItem.idPeca}? Isso apaga o produto no Bling (se inativo) e a pasta no Drive.`;
      if (!confirm(msg)) return;
    }
    setExcluindo(true);
    try {
      const params = [];
      if (force) params.push('force=true');
      if (confirmarFotos) params.push('confirmarFotos=true');
      const url = `${API}/cadastro/${editItem.id}${params.length ? `?${params.join('&')}` : ''}`;
      const resp = await fetch(url, { method: 'DELETE', credentials: 'include' });
      const d = await resp.json();
      if (resp.status === 409 && d.requiresConfirmation) {
        setExcluindo(false);
        if (confirm(d.message)) return excluir(force, true);
        return;
      }
      if (!resp.ok) throw new Error(d.error || 'Erro ao excluir');
      setModal(false);
      await loadCadastros();
    } catch (e: any) { alert(e.message); }
    setExcluindo(false);
  }

  async function eliminarLinhaCadastro(item: CadastroPeca, confirmarFotos = false) {
    if (!isBruno) {
      alert('Apenas o usuario Bruno pode eliminar linhas do cadastro.');
      return;
    }
    if (!confirmarFotos) {
      if (!confirm(`Eliminar a linha ${item.idPeca} do cadastro?`)) return;
      if (!confirm(`Tem certeza que deseja eliminar ${item.idPeca}? Essa acao remove a linha (mesmo finalizada), apaga o produto no Bling (se inativo) e a pasta no Drive.`)) return;
    }

    setEliminandoLinhaId(item.id);
    try {
      const url = `${API}/cadastro/${item.id}?force=true${confirmarFotos ? '&confirmarFotos=true' : ''}`;
      const resp = await fetch(url, { method: 'DELETE', credentials: 'include' });
      const d = await resp.json();
      if (resp.status === 409 && d.requiresConfirmation) {
        setEliminandoLinhaId(null);
        if (confirm(d.message)) return eliminarLinhaCadastro(item, true);
        return;
      }
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
    if (!item.pecaRestrita && !item.sucata && !item.blingProdutoId) return alert('Produto não foi enviado ao Bling ainda. Salve o pré-cadastro primeiro.');
    setItemFinalizar(item); setPreviewBling(null); setPreviewDiff({}); setFinalizarRestrita(false); setFinalizarSucata(false);
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
      setFinalizarRestrita(!!d.restrita);
      setFinalizarSucata(!!d.sucata);
      if (!d.restrita && !d.sucata) {
        setPreviewFrete(d.preview.frete); setPreviewTaxa(d.preview.taxaPct);
      }
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
      alert(d.restrita
        ? `✓ ${d.pecasCriadas?.length || 0} peça(s) registrada(s) em Prejuízo (Peça Restrita - Sem Revenda)!`
        : d.sucata
        ? `✓ ${d.pecasCriadas?.length || 0} peça(s) lançada(s) como Sucata!`
        : `✓ ${d.pecasCriadas?.length || 0} peça(s) lançada(s) no estoque!`);
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
  // ===== Aba Fotos Drive =====
  async function fdEscanear() {
    setFdScanning(true);
    setFdItens([]);
    try {
      const params = new URLSearchParams();
      if (fdModo === 'sku' && fdSku.trim()) params.set('sku', fdSku.trim());
      if (fdModo === 'data') {
        if (fdDataDe) params.set('dataDe', fdDataDe);
        if (fdDataAte) params.set('dataAte', fdDataAte);
      }
      const d = await fetch(`${API}/cadastro/fotos-drive/scan?${params.toString()}`, { credentials: 'include' }).then(r => r.json());
      if (d?.ok === false && !d?.pastas) throw new Error('Pasta raiz do Pré-Cadastro não configurada.');
      setFdItens((d.pastas || []).map((p: any) => ({ ...p, status: 'pendente', etapas: null, mensagem: '' })));
    } catch (e: any) {
      alert(e?.message || 'Erro ao escanear pastas.');
    }
    setFdScanning(false);
  }

  async function fdProcessarUm(pastaId: string) {
    setFdItens(prev => prev.map(i => i.pastaId === pastaId ? { ...i, status: 'processando', etapas: null, mensagem: '' } : i));
    const aplica = (r: any) => setFdItens(prev => prev.map(i => i.pastaId === pastaId ? {
      ...i, status: r.status || 'erro', etapas: r.etapas || null, mensagem: r.mensagem || '',
      fotosGravadas: r.fotosGravadas, brancosDescartados: r.brancosDescartados,
    } : i));
    try {
      // Inicia o processamento em segundo plano (retorna na hora — não dá timeout).
      await fetch(`${API}/cadastro/fotos-drive/processar`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastaId }),
      }).then(r => r.json());
      // Polling do progresso (até ~4 min).
      for (let tentativa = 0; tentativa < 160; tentativa += 1) {
        await new Promise(res => setTimeout(res, 1500));
        const d = await fetch(`${API}/cadastro/fotos-drive/status?pastaId=${encodeURIComponent(pastaId)}`, { credentials: 'include' }).then(r => r.json());
        const r = d?.resultado;
        if (!r) continue;
        aplica(r);
        if (r.status === 'processado' || r.status === 'erro') break;
      }
    } catch (e: any) {
      setFdItens(prev => prev.map(i => i.pastaId === pastaId ? { ...i, status: 'erro', mensagem: e?.message || 'Erro' } : i));
    }
  }

  async function fdProcessarTodos() {
    setFdProcessando(true);
    const alvos = fdItens.filter(i => i.status === 'pendente' || i.status === 'erro');
    for (const item of alvos) {
      await fdProcessarUm(item.pastaId);
    }
    setFdProcessando(false);
  }

  const FD_ETAPAS: { key: string; label: string }[] = [
    { key: 'extrairZip', label: 'Extrair Zip' },
    { key: 'descartarBrancos', label: 'Descartar Brancos' },
    { key: 'gravarFotos', label: 'Gravar Fotos' },
    { key: 'limparAntigas', label: 'Limpar Antigas' },
    { key: 'moverPasta', label: 'Mover p/ Moto' },
  ];
  function fdEtapaCell(item: any, key: string) {
    const v = item.etapas?.[key];
    if (item.status === 'processando' && !v) return <span style={{ color: '#9333ea' }}>⏳</span>;
    if (v === 'ok') return <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>;
    if (v === 'erro') return <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>;
    if (v === 'pulado') return <span style={{ color: '#94a3b8' }}>–</span>;
    return <span style={{ color: '#cbd5e1' }}>·</span>;
  }
  const fdPendentes = fdItens.filter(i => i.status === 'pendente' || i.status === 'erro').length;

  async function carregarShopeeCategorias() {
    if (shopeeCategorias.length) return;
    try {
      const resp = await fetch(`${API}/shopee/categorias`, { credentials: 'include' });
      const data = await readApiResponse(resp, 'Erro ao buscar categorias Shopee');
      setShopeeCategorias(Array.isArray(data.categorias) ? data.categorias : []);
    } catch (e: any) {
      alert(e?.message || 'Erro ao buscar categorias Shopee.');
    }
  }

  // Converte a linha devolvida por /<marketplace>/anuncio/buscar no estado da linha pra esse marketplace.
  function montarMarketplaceDaLinha(linha: any): AnuncioLinhaMarketplace {
    return {
      disponivel: true,
      jaTemAnuncio: !!linha.jaTemAnuncio,
      itemId: linha.shopeeItemId ?? linha.magaluItemId ?? linha.nuvemshopItemId ?? linha.mercadoLivreItemId ?? null,
      categoriaAtual: linha.categoriaAtual || null,
      categoriaEscolhidaId: linha.categoriaAtual?.id ?? null,
      categoriaPendente: !!linha.categoriaPendente,
      // Sem fotos na pasta oficial, sem categoria ou com restricao: nao vem marcado (precisa ajustar antes).
      selecionado: !!linha.encontrado && !linha.jaTemAnuncio && linha.fotosProcessadas !== false && !linha.categoriaPendente && !(Array.isArray(linha.restricoes) && linha.restricoes.length) && !(Array.isArray(linha.fichaFaltando) && linha.fichaFaltando.length),
      status: 'pendente',
      resultado: null,
      erroProcessamento: '',
      restricoes: Array.isArray(linha.restricoes) ? linha.restricoes : [],
      categoriaPreCadastro: linha.categoriaPreCadastro || null,
      sugestaoOrigem: linha.sugestaoOrigem,
      fichaFaltando: Array.isArray(linha.fichaFaltando) ? linha.fichaFaltando : [],
      fichaValores: {},
    };
  }

  // Marcar/desmarcar um marketplace no topo vale pra TODA a listagem ja carregada: desmarcar tira a
  // selecao desse marketplace de todas as linhas; marcar seleciona todas as elegiveis (SKU encontrado,
  // sem anuncio nesse marketplace ainda). Se a lista foi buscada sem esse marketplace, busca agora.
  async function toggleAnuncioMarketplace(mk: AnuncioMarketplaceId) {
    const ligando = !anuncioMarketplacesSelecionados.has(mk);
    setAnuncioMarketplacesSelecionados((prev) => {
      const next = new Set(prev);
      if (ligando) next.add(mk); else next.delete(mk);
      return next;
    });
    if (!anuncioCriarLinhas.length) return;

    if (!ligando) {
      setAnuncioCriarLinhas((prev) => prev.map((linha) => ({
        ...linha,
        marketplaces: { ...linha.marketplaces, [mk]: { ...linha.marketplaces[mk], selecionado: false } },
      })));
      return;
    }

    const novos = new Map<string, any>();
    const faltando = anuncioCriarLinhas.filter((linha) => linha.encontrado && !linha.marketplaces[mk].disponivel).map((linha) => linha.sku);
    if (faltando.length) {
      carregarCategoriasDoMarketplace(mk);
      try {
        const resp = await fetch(`${API}/${mk}/anuncio/buscar`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: faltando }),
        });
        const data = await readApiResponse(resp, `Erro ao buscar SKUs no ${mk}`);
        for (const l of (Array.isArray(data.linhas) ? data.linhas : [])) novos.set(l.sku, l);
      } catch (e: any) {
        alert(e?.message || `Erro ao buscar SKUs no ${mk}.`);
      }
    }
    setAnuncioCriarLinhas((prev) => prev.map((linha) => {
      const novo = novos.get(linha.sku);
      const base = !linha.marketplaces[mk].disponivel && novo ? montarMarketplaceDaLinha(novo) : linha.marketplaces[mk];
      const elegivel = base.disponivel && linha.encontrado && linha.fotosOk && !linha.semEstoque && !base.jaTemAnuncio && !base.categoriaPendente && !(base.restricoes && base.restricoes.length) && base.status !== 'ok' && base.status !== 'processando';
      return { ...linha, marketplaces: { ...linha.marketplaces, [mk]: { ...base, selecionado: elegivel } } };
    }));
  }

  async function carregarNuvemshopCategorias() {
    if (nuvemshopCategorias.length) return;
    try {
      const resp = await fetch(`${API}/nuvemshop/anuncio/categorias`, { credentials: "include" });
      const data = await readApiResponse(resp, "Erro ao buscar categorias Nuvemshop");
      setNuvemshopCategorias(Array.isArray(data.categorias) ? data.categorias : []);
    } catch (e: any) {
      alert(e?.message || "Erro ao buscar categorias Nuvemshop.");
    }
  }

  async function carregarMlCategorias() {
    if (mlCategorias.length) return;
    try {
      const resp = await fetch(`${API}/mercado-livre/anuncio/categorias`, { credentials: "include" });
      const data = await readApiResponse(resp, "Erro ao buscar categorias do Mercado Livre");
      setMlCategorias(Array.isArray(data.categorias) ? data.categorias : []);
    } catch (e: any) {
      alert(e?.message || "Erro ao buscar categorias do Mercado Livre.");
    }
  }

  // ---- Ajuste do SKU (titulo / condicao / texto) direto na aba Anuncio: grava no Bling + cadastro ----
  const ajusteVazio = (): AnuncioAjuste => ({ aberto: false, carregando: false, salvando: false, titulo: '', descricao: '', condicao: 'usado', original: null, msg: '', erro: '' });
  function atualizarAjuste(sku: string, patch: Partial<AnuncioAjuste>) {
    setAnuncioAjustes((prev) => ({ ...prev, [sku]: { ...(prev[sku] || ajusteVazio()), ...patch } }));
  }
  async function alternarAjusteSku(sku: string) {
    const atual = anuncioAjustes[sku];
    if (atual?.aberto) { atualizarAjuste(sku, { aberto: false }); return; }
    atualizarAjuste(sku, { aberto: true, carregando: true, erro: '', msg: '' });
    try {
      const resp = await fetch(`${API}/anuncio-ajuste/dados?sku=${encodeURIComponent(sku)}`, { credentials: 'include' });
      const data = await readApiResponse(resp, 'Erro ao ler os dados do SKU');
      atualizarAjuste(sku, {
        carregando: false,
        titulo: data.titulo || '',
        descricao: data.descricao || '',
        condicao: data.condicao === 'novo' ? 'novo' : 'usado',
        original: { titulo: data.titulo || '', descricao: data.descricao || '', condicao: data.condicao === 'novo' ? 'novo' : 'usado' },
        erro: data.erroBling ? `Aviso: não consegui ler o Bling (${data.erroBling}). Mostrando os dados do cadastro.` : '',
      });
    } catch (e: any) {
      atualizarAjuste(sku, { carregando: false, erro: e?.message || 'Erro ao ler os dados do SKU.' });
    }
  }
  async function salvarAjusteSku(sku: string) {
    const aj = anuncioAjustes[sku];
    if (!aj || !aj.original) return;
    const corpo: any = { sku };
    if (aj.titulo !== aj.original.titulo) corpo.titulo = aj.titulo;
    if (aj.descricao !== aj.original.descricao) corpo.descricao = aj.descricao;
    if (aj.condicao !== aj.original.condicao) corpo.condicao = aj.condicao;
    if (Object.keys(corpo).length === 1) { atualizarAjuste(sku, { msg: 'Nada para salvar.', erro: '' }); return; }
    atualizarAjuste(sku, { salvando: true, msg: '', erro: '' });
    try {
      const resp = await fetch(`${API}/anuncio-ajuste/salvar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      await readApiResponse(resp, 'Erro ao salvar o ajuste');
      atualizarAjuste(sku, { salvando: false, msg: 'Salvo no Bling e no cadastro.', original: { titulo: aj.titulo, descricao: aj.descricao, condicao: aj.condicao } });
      // Titulo na linha e condicao (muda categoria/atributos do ML): atualiza a linha na tela.
      setAnuncioCriarLinhas((prev) => prev.map((l) => l.sku === sku ? { ...l, descricao: aj.titulo } : l));
    } catch (e: any) {
      atualizarAjuste(sku, { salvando: false, erro: e?.message || 'Erro ao salvar.' });
    }
  }

  // Ctrl/Cmd + clique no SKU: copia o codigo pra area de transferencia (nao expande a linha).
  async function copiarSku(sku: string) {
    try {
      await navigator.clipboard.writeText(sku);
    } catch {
      const el = document.createElement('textarea');
      el.value = sku; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(el); }
    }
    setSkuCopiado(sku);
    setTimeout(() => setSkuCopiado((atual) => (atual === sku ? '' : atual)), 1500);
  }

  // Situacao (ativo/inativo/...) direto nos marketplaces, rapida (sem Bling): pinta as celulas antes de expandir.
  async function consultarStatusRapido(skus: string[]) {
    if (!skus.length) return;
    try {
      const resp = await fetch(`${API}/anuncio-vinculos/status`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus }) });
      const data = await readApiResponse(resp, 'Erro ao consultar o status dos anúncios');
      setAnuncioStatusRapido((prev) => ({ ...prev, ...(data.status || {}) }));
    } catch (e: any) {
      console.warn('[anuncio] status rapido:', e?.message || e);
    }
  }
  async function verificarSkus(skus: string[]) {
    if (!skus.length) return;
    setAnuncioVerificando(true);
    try {
      const lotes: string[][] = [];
      for (let i = 0; i < skus.length; i += 3) lotes.push(skus.slice(i, i + 3));
      await Promise.all([
        consultarStatusRapido(skus),
        (async () => { for (const lote of lotes) await consultarVinculos(lote); })(),
      ]);
    } finally { setAnuncioVerificando(false); }
  }

  // ---- Vinculos: le os IDs do sistema e do Bling; avisa quando ja existe e bloqueia a criacao ----
  async function consultarVinculos(skus: string[]) {
    if (!skus.length) return;
    try {
      const resp = await fetch(`${API}/anuncio-vinculos/consultar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus }) });
      const data = await readApiResponse(resp, 'Erro ao consultar os vínculos dos anúncios');
      const lista: any[] = Array.isArray(data.skus) ? data.skus : [];
      setAnuncioVinculos((prev) => {
        const next = { ...prev };
        for (const s of lista) if (s?.mercados) next[s.sku] = { erroBling: s.erroBling, mercados: s.mercados };
        return next;
      });
      // Se ja ha ID (no sistema OU no Bling), o marketplace fica "ja possui anuncio" e nao vem marcado.
      setAnuncioCriarLinhas((prev) => prev.map((linha) => {
        const info = lista.find((s) => s?.sku === linha.sku)?.mercados;
        if (!info) return linha;
        const marketplaces = { ...linha.marketplaces };
        for (const mk of Object.keys(info)) {
          const v: AnuncioVinculoMk = info[mk];
          const atual = marketplaces[mk as AnuncioMarketplaceId];
          if (!atual || v.status === 'livre') continue;
          marketplaces[mk as AnuncioMarketplaceId] = { ...atual, jaTemAnuncio: true, itemId: atual.itemId || v.sistemaId || v.blingCodigo, selecionado: false };
        }
        return { ...linha, marketplaces };
      }));
    } catch (e: any) {
      console.warn('[anuncio] vinculos:', e?.message || e);
    }
  }

  async function recarregarMarketplaceDaLinha(sku: string, mk: AnuncioMarketplaceId) {
    try {
      const resp = await fetch(`${API}/${mk}/anuncio/buscar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus: [sku] }) });
      const data = await readApiResponse(resp, `Erro ao recarregar ${mk}`);
      const nova = (Array.isArray(data.linhas) ? data.linhas : [])[0];
      if (nova) setAnuncioCriarLinhas((prev) => prev.map((l) => l.sku === sku ? { ...l, marketplaces: { ...l.marketplaces, [mk]: montarMarketplaceDaLinha(nova) } } : l));
    } catch (e: any) {
      console.warn('[anuncio] recarregar:', e?.message || e);
    }
  }

  async function removerVinculoAnuncio(sku: string, mk: AnuncioMarketplaceId, alvo: 'sistema' | 'sistema_bling' | 'sistema_bling_marketplace', semConfirmar?: boolean) {
    const nome = ANUNCIO_MARKETPLACES.find((m) => m.id === mk)?.label || mk;
    const aviso = alvo === 'sistema'
      ? `Remover o ID do anúncio do ${nome} do SKU ${sku} SÓ do nosso sistema?\n\nO SKU fica liberado para criar de novo.\nIsso NÃO apaga o anúncio dentro do ${nome} nem o vínculo no Bling.${mk === 'mercado-livre' ? '\n\nAtenção: no Mercado Livre a auditoria automática do Bling pode preencher o ID de volta; para liberar de verdade use "sistema + Bling".' : ''}`
      : `Remover o anúncio do ${nome} do SKU ${sku} do nosso sistema E do Bling?\n\nO vínculo do produto com a loja no Bling será apagado${mk === 'mercado-livre' ? ' e o anúncio do Bling (anúncios do ML) também, senão ele volta a bloquear' : ''}, e o SKU fica liberado para criar de novo.\nIsso NÃO apaga o produto/anúncio dentro do ${nome}.`;
    if (!semConfirmar && !confirm(aviso)) return;
    const chave = `${sku}|${mk}`;
    setAnuncioVinculoOcupado(chave);
    try {
      const resp = await fetch(`${API}/anuncio-vinculos/remover`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, marketplace: mk, alvo }) });
      const data = await readApiResponse(resp, 'Erro ao remover o vínculo do anúncio');
      await recarregarMarketplaceDaLinha(sku, mk);
      setAnuncioStatusRapido((prev) => ({ ...prev, [sku]: { ...(prev[sku] || {}), [mk]: null } }));
      await consultarVinculos([sku]);
      alert(`SKU ${sku} liberado no ${nome}.${data.marketplace_acao ? `
No marketplace: ${data.marketplace_acao}.` : ''}${Array.isArray(data.removidoNoBling) && data.removidoNoBling.length ? `\nRemovido no Bling: ${data.removidoNoBling.join(', ')}.` : ''}${mk === 'nuvemshop' ? '\n\nSe o produto ainda existir na loja da Nuvemshop, apague-o lá também, senão a criação continua bloqueada.' : ''}`);
    } catch (e: any) {
      alert(e?.message || 'Erro ao remover o vínculo.');
    } finally {
      setAnuncioVinculoOcupado('');
    }
  }

  async function carregarMagaluCategorias() {
    if (magaluCategorias.length) return;
    try {
      const resp = await fetch(`${API}/magalu/categorias`, { credentials: "include" });
      const data = await readApiResponse(resp, "Erro ao buscar categorias Magalu");
      setMagaluCategorias(Array.isArray(data.categorias) ? data.categorias : []);
    } catch (e: any) {
      alert(e?.message || "Erro ao buscar categorias Magalu.");
    }
  }

  async function buscarLinhasAnuncioCriar() {
    const skus = normalizarListaSkus(anuncioCriarSkusInput);
    if (!skus.length) return alert('Informe ao menos 1 SKU.');
    const marketplaces = Array.from(anuncioMarketplacesSelecionados);
    if (!marketplaces.length) return alert('Selecione ao menos 1 marketplace.');
    setAnuncioCriarBuscando(true);
    setAnuncioCriarLinhas([]); setAnuncioPagina(0); setAnuncioFiltro('todos'); setAnuncioExpandidos(new Set<string>());
    if (marketplaces.includes('shopee')) carregarShopeeCategorias();
    if (marketplaces.includes('magalu')) carregarMagaluCategorias();
    if (marketplaces.includes('nuvemshop')) carregarNuvemshopCategorias();
    if (marketplaces.includes('mercado-livre')) carregarMlCategorias();

    try {
      // Cada marketplace e' buscado separado e tolerante a falha: se um cair (ex: Mercado Livre), os outros seguem.
      const falhas: string[] = [];
      const respostasPorMarketplace = await Promise.all(marketplaces.map(async (mk) => {
        try {
          const resp = await fetch(`${API}/${mk}/anuncio/buscar`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus }),
          });
          const data = await readApiResponse(resp, `Erro ao buscar SKUs no ${mk}`);
          return { mk, linhas: Array.isArray(data.linhas) ? data.linhas : [] };
        } catch (e: any) {
          falhas.push(`${ANUNCIO_MARKETPLACES.find((m) => m.id === mk)?.label || mk}: ${e?.message || e}`);
          return { mk, linhas: [] as any[] };
        }
      }));
      if (falhas.length) alert(`Não consegui buscar em:\n${falhas.join('\n')}`);

      const porSku = new Map<string, AnuncioCriarLinha>();
      for (const { mk, linhas } of respostasPorMarketplace) {
        for (const linha of linhas) {
          let acumulado = porSku.get(linha.sku);
          if (acumulado && linha.fotosProcessadas === false) acumulado.fotosOk = false;
          if (!acumulado) {
            acumulado = {
              sku: linha.sku,
              encontrado: !!linha.encontrado,
              fotosOk: linha.fotosProcessadas !== false,
              origem: linha.origem,
              erro: linha.erro,
              descricao: linha.descricao,
              moto: linha.moto,
              preco: linha.preco,
              peso: linha.peso,
              largura: linha.largura,
              altura: linha.altura,
              profundidade: linha.profundidade,
              estoque: linha.estoque,
              marketplaces: { shopee: criarMarketplaceVazio(), magalu: criarMarketplaceVazio(), nuvemshop: criarMarketplaceVazio(), 'mercado-livre': criarMarketplaceVazio() },
            };
            porSku.set(linha.sku, acumulado);
          }
          acumulado.marketplaces[mk as AnuncioMarketplaceId] = montarMarketplaceDaLinha(linha);
        }
      }

      for (const l of Array.from(porSku.values())) {
        if (l.encontrado && !(Number(l.estoque) > 0)) {
          l.semEstoque = true;
          for (const id of Object.keys(l.marketplaces) as AnuncioMarketplaceId[]) l.marketplaces[id] = { ...l.marketplaces[id], selecionado: false };
        }
      }
      setAnuncioCriarLinhas(Array.from(porSku.values()));
      // Em seguida le os IDs do Bling (nao bloqueia a tela): avisa SKUs que ja tem anuncio/ID preenchido.
      verificarSkus(Array.from(porSku.values()).filter((l) => l.encontrado).map((l) => l.sku));
    } catch (e: any) {
      alert(e?.message || 'Erro ao buscar SKUs.');
    }
    setAnuncioCriarBuscando(false);
  }

  function toggleAnuncioCriarSelecionado(sku: string, mk: AnuncioMarketplaceId) {
    setAnuncioCriarLinhas((prev) => prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const atual = linha.marketplaces[mk];
      return { ...linha, marketplaces: { ...linha.marketplaces, [mk]: { ...atual, selecionado: !atual.selecionado } } };
    }));
  }

  // Preenchimento dos campos obrigatorios da categoria (ex: pneu no Magalu). Ao completar todos, o marketplace fica marcado.
  function atualizarFichaCampo(sku: string, mk: AnuncioMarketplaceId, nome: string, valor: string) {
    setAnuncioCriarLinhas((prev) => prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const atual = linha.marketplaces[mk];
      const valores = { ...(atual.fichaValores || {}), [nome]: valor };
      const completo = (atual.fichaFaltando || []).every((c) => String(valores[c.nome] || '').trim());
      const liberada = completo && linha.fotosOk && !linha.semEstoque && !atual.jaTemAnuncio && !atual.categoriaPendente && !(atual.restricoes && atual.restricoes.length);
      return { ...linha, marketplaces: { ...linha.marketplaces, [mk]: { ...atual, fichaValores: valores, selecionado: completo ? (liberada ? true : atual.selecionado) : false } } };
    }));
  }

  async function escolherCategoriaParaLinha(sku: string, mk: AnuncioMarketplaceId, categoriaId: number | string) {
    const escolhida = categoriasDoMarketplace(mk).find((c) => c.id === categoriaId) || null;
    // Mercado Livre: confere as restricoes da categoria escolhida (condicao aceita, atributos obrigatorios...).
    let restricoes: string[] = [];
    if (mk === 'mercado-livre') {
      try {
        const cond = anuncioAjustes[sku]?.condicao || 'usado';
        const resp = await fetch(`${API}/mercado-livre/anuncio/verificar-categoria?id=${encodeURIComponent(String(categoriaId))}&condicao=${cond}`, { credentials: 'include' });
        const data = await readApiResponse(resp, 'Erro ao verificar a categoria');
        restricoes = Array.isArray(data.restricoes) ? data.restricoes : [];
      } catch (e: any) {
        restricoes = [`Não consegui verificar as restrições da categoria: ${e?.message || e}`];
      }
    }
    // Magalu: a nova categoria pode exigir campos que o sistema nao preenche — busca a lista pra pedir na tela.
    let fichaFaltando: { nome: string; exemplo: string; escolhas: string[] | null }[] = [];
    if (mk === 'magalu') {
      try {
        const resp = await fetch(`${API}/magalu/anuncio/ficha?sku=${encodeURIComponent(sku)}&categoriaId=${encodeURIComponent(String(categoriaId))}`, { credentials: 'include' });
        const data = await readApiResponse(resp, 'Erro ao consultar a ficha da categoria');
        fichaFaltando = Array.isArray(data.fichaFaltando) ? data.fichaFaltando : [];
      } catch (e: any) {
        console.warn('[anuncio] ficha da categoria:', e?.message || e);
      }
    }
    setAnuncioCriarLinhas((prev) => prev.map((linha) => {
      if (linha.sku !== sku) return linha;
      const atual = linha.marketplaces[mk];
      // Escolher uma categoria resolve a pendencia; sem restricao e com fotos oficiais, ja deixa marcada.
      const liberada = linha.fotosOk && !linha.semEstoque && !atual.jaTemAnuncio && restricoes.length === 0 && fichaFaltando.length === 0;
      return { ...linha, marketplaces: { ...linha.marketplaces, [mk]: {
        ...atual,
        categoriaEscolhidaId: categoriaId,
        categoriaPendente: false,
        categoriaAtual: escolhida ? { ...escolhida, permitido: restricoes.length === 0 } : atual.categoriaAtual,
        restricoes,
        fichaFaltando,
        fichaValores: {},
        selecionado: liberada,
      } } };
    }));
    setCategoriaModalSku(null);
    setCategoriaModalBusca('');
  }

  async function processarAnunciosCriarFila() {
    const tarefas: { sku: string; mk: AnuncioMarketplaceId }[] = [];
    for (const linha of anuncioCriarLinhas) {
      if (!linha.encontrado || !linha.fotosOk || linha.semEstoque) continue; // sem fotos na pasta oficial nada e' criado
      for (const { id: mk } of ANUNCIO_MARKETPLACES) {
        const m = linha.marketplaces[mk];
        if (m.disponivel && m.selecionado && !(m.restricoes && m.restricoes.length)) tarefas.push({ sku: linha.sku, mk });
      }
    }
    if (!tarefas.length) return alert('Nenhum SKU/marketplace selecionado.');
    setAnuncioCriarProcessando(true);
    setAnuncioCriarProgresso({ atual: 0, total: tarefas.length });

    for (let index = 0; index < tarefas.length; index += 1) {
      const { sku, mk } = tarefas[index];
      setAnuncioCriarSkuAtual(sku);
      setAnuncioCriarMarketplaceAtual(mk);
      setAnuncioCriarProgresso({ atual: index, total: tarefas.length });
      setAnuncioCriarLinhas((prev) => prev.map((item) => item.sku === sku ? { ...item, marketplaces: { ...item.marketplaces, [mk]: { ...item.marketplaces[mk], status: 'processando' as const } } } : item));
      try {
        const linhaAtual = anuncioCriarLinhas.find((l) => l.sku === sku);
        const categoriaId = linhaAtual?.marketplaces[mk].categoriaEscolhidaId;
        if (categoriaId == null || categoriaId === '') throw new Error('Escolha a categoria (Trocar categoria) antes de criar este anúncio.');
        const resp = await fetch(`${API}/${mk}/anuncio/criar`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, categoriaId, ...(mk === 'magalu' && linhaAtual?.marketplaces[mk].fichaValores && Object.keys(linhaAtual.marketplaces[mk].fichaValores || {}).length ? { ficha: linhaAtual.marketplaces[mk].fichaValores } : {}) }),
        });
        const data = await readApiResponse(resp, `Erro ao criar anuncio ${mk} do SKU ${sku}`);
        setAnuncioCriarLinhas((prev) => prev.map((item) => item.sku === sku ? {
          ...item,
          marketplaces: { ...item.marketplaces, [mk]: { ...item.marketplaces[mk], status: 'ok' as const, resultado: data, selecionado: false, jaTemAnuncio: true, itemId: data.shopeeItemId || data.magaluItemId || data.nuvemshopItemId || data.mercadoLivreItemId || (data.anuncioBlingId ? `Bling ${data.anuncioBlingId}` : null) } },
        } : item));
      } catch (e: any) {
        setAnuncioCriarLinhas((prev) => prev.map((item) => item.sku === sku ? {
          ...item,
          marketplaces: { ...item.marketplaces, [mk]: { ...item.marketplaces[mk], status: 'erro' as const, erroProcessamento: e?.message || String(e) } },
        } : item));
      }
    }

    setAnuncioCriarProgresso({ atual: tarefas.length, total: tarefas.length });
    setAnuncioCriarSkuAtual('');
    setAnuncioCriarMarketplaceAtual('');
    setAnuncioCriarProcessando(false);
  }

  const categoriaModalLinha = anuncioCriarLinhas.find((l) => l.sku === categoriaModalSku) || null;
  const categoriaModalLista = categoriasDoMarketplace(categoriaModalMarketplace);
  const categoriaModalFiltradas = categoriaModalLista.filter((c) => {
    const termo = categoriaModalBusca.trim().toLowerCase();
    if (!termo) return true;
    return c.caminho.toLowerCase().includes(termo);
  });

  const renderCategoriaBadge = (cat?: ShopeeCategoriaOpcao | null, categoriaPendente?: boolean) => {
    if (categoriaPendente) return <span title="Mapeamento automatico de categoria ainda nao existe pra esse marketplace" style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>⏳ Categoria pendente</span>;
    if (!cat) return <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>Sem categoria</span>;
    if (!cat.permitido) return <span title="Categoria bloqueada na Shopee (permitido=false)" style={{ fontSize: 11, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>🚫 {cat.nivel4}</span>;
    if (cat.generica) return <span title="Categoria genérica — sem correspondência específica pra essa peça" style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>⚠ {cat.categoria ? `${cat.categoria} > ${cat.subcategoria} > Outros` : cat.caminho}</span>;
    return <span style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>{cat.caminho}</span>;
  };

  const anuncioCriarSelecionadosCount = anuncioCriarLinhas.reduce((total, linha) => total + ANUNCIO_MARKETPLACES.filter(({ id }) => linha.marketplaces[id].disponivel && linha.marketplaces[id].selecionado).length, 0);

  const renderAnuncioConteudo = () => (
    <>
      <div style={{ ...s.card, padding: isPhone ? '14px' : '18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Criar anúncios</div>
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }}>
          Escolha os marketplaces e informe os SKUs (um por linha, vírgula ou espaço). Linhas sem anúncio já criado vêm
          selecionadas por padrão; linhas que já possuem anúncio vêm desmarcadas e destacadas — não é possível recriar.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {ANUNCIO_MARKETPLACES.map(({ id, label, cor }) => (
            <label key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: anuncioMarketplacesSelecionados.has(id) ? cor : 'var(--gray-400)', border: `1px solid ${anuncioMarketplacesSelecionados.has(id) ? cor : 'var(--border)'}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer', background: anuncioMarketplacesSelecionados.has(id) ? `${cor}14` : 'var(--white)' }}>
              <input type="checkbox" checked={anuncioMarketplacesSelecionados.has(id)} disabled={anuncioCriarProcessando} onChange={() => toggleAnuncioMarketplace(id)} />
              {label}
            </label>
          ))}
        </div>
        <textarea
          value={anuncioCriarSkusInput}
          onChange={(e: any) => setAnuncioCriarSkusInput(e.target.value)}
          placeholder={'BM03_0119\nBM03_0120'}
          rows={3}
          style={{ ...s.input, width: '100%', resize: 'vertical' as const, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}
        />
        <button
          onClick={buscarLinhasAnuncioCriar}
          disabled={anuncioCriarBuscando || !anuncioCriarSkusInput.trim() || anuncioMarketplacesSelecionados.size === 0}
          style={{ ...s.btn, marginTop: 10, background: '#7c3aed', color: '#fff', opacity: anuncioCriarBuscando || !anuncioCriarSkusInput.trim() || anuncioMarketplacesSelecionados.size === 0 ? 0.6 : 1 }}
        >
          {anuncioCriarBuscando ? 'Buscando...' : 'Buscar SKUs'}
        </button>
      </div>

      {anuncioCriarLinhas.length > 0 && (() => {
        const ANUNCIO_POR_PAGINA = 25;
        // Estado de cada celula (SKU x marketplace) — resume tudo numa palavra curta.
        const celula = (linha: AnuncioCriarLinha, mk: AnuncioMarketplaceId): { chave: string; texto: string; cor: string; fundo: string; clicavel: boolean } => {
          const mp = linha.marketplaces[mk];
          if (!mp.disponivel) return { chave: 'off', texto: '—', cor: 'var(--gray-300)', fundo: 'transparent', clicavel: false };
          if (linha.semEstoque) return { chave: 'bloq', texto: linha.bloqueioTexto ? 'pneu usado' : 'sem estoque', cor: '#b91c1c', fundo: '#fee2e2', clicavel: false };
          if (!linha.fotosOk) return { chave: 'bloq', texto: 'sem fotos', cor: '#b91c1c', fundo: '#fee2e2', clicavel: false };
          if (mp.status === 'processando') return { chave: 'proc', texto: '⏳ criando', cor: 'var(--gray-600)', fundo: 'transparent', clicavel: false };
          if (mp.status === 'ok') return { chave: 'ok', texto: '✓ criado', cor: '#166534', fundo: '#dcfce7', clicavel: false };
          if (mp.status === 'erro') return { chave: 'erro', texto: '✗ erro', cor: '#b91c1c', fundo: '#fee2e2', clicavel: false };
          if (mp.jaTemAnuncio) {
            const sit = anuncioVinculos[linha.sku]?.mercados?.[mk]?.situacao || anuncioStatusRapido[linha.sku]?.[mk];
            if (sit && !sit.ok) return { chave: 'tem', texto: `já tem ID · ${sit.texto.toLowerCase()}`, cor: '#b91c1c', fundo: '#fee2e2', clicavel: false };
            if (sit && sit.ok) return { chave: 'tem', texto: `já tem ID · ${sit.texto.toLowerCase()}`, cor: '#92400e', fundo: '#fef3c7', clicavel: false };
            return { chave: 'tem', texto: anuncioVerificando ? 'já tem ID · verificando…' : 'já tem ID', cor: '#92400e', fundo: '#fef3c7', clicavel: false };
          }
          if (mp.restricoes && mp.restricoes.length) return { chave: 'restr', texto: '⚠ restrição', cor: '#b91c1c', fundo: '#fee2e2', clicavel: false };
          const fichaPend = (mp.fichaFaltando || []).filter((c) => !String((mp.fichaValores || {})[c.nome] || '').trim());
          if (fichaPend.length) return { chave: 'ficha', texto: `⚠ preencher ficha (${fichaPend.length})`, cor: '#92400e', fundo: '#fffbeb', clicavel: false };
          if (mp.categoriaPendente || mp.categoriaEscolhidaId == null) return { chave: 'semcat', texto: 'sem categoria', cor: '#92400e', fundo: '#fffbeb', clicavel: false };
          return mp.selecionado
            ? { chave: 'sel', texto: '☑ criar', cor: '#166534', fundo: '#dcfce7', clicavel: true }
            : { chave: 'pronto', texto: '☐ criar', cor: 'var(--gray-600)', fundo: 'var(--gray-100)', clicavel: true };
        };
        const statusLinha = (linha: AnuncioCriarLinha): 'pronto' | 'problema' | 'tem' | 'ok' => {
          if (!linha.encontrado || !linha.fotosOk || linha.semEstoque) return 'problema';
          const cs = ANUNCIO_MARKETPLACES.filter(({ id }) => linha.marketplaces[id].disponivel).map(({ id }) => celula(linha, id).chave);
          if (cs.some((c) => c === 'erro' || c === 'restr' || c === 'semcat' || c === 'ficha')) return 'problema';
          if (cs.some((c) => c === 'pronto' || c === 'sel')) return 'pronto';
          if (cs.some((c) => c === 'tem')) return 'tem';
          return 'ok';
        };
        const contagem = { pronto: 0, problema: 0, tem: 0 };
        for (const l of anuncioCriarLinhas) { const st = statusLinha(l); if (st === 'pronto' || st === 'problema' || st === 'tem') contagem[st]++; }
        const filtradas = anuncioCriarLinhas.filter((l) => anuncioFiltro === 'todos' || (anuncioFiltro === 'problema' ? statusLinha(l) === 'problema' || statusLinha(l) === 'tem' : statusLinha(l) === 'pronto'));
        const totalPaginas = Math.max(1, Math.ceil(filtradas.length / ANUNCIO_POR_PAGINA));
        const pagina = Math.min(anuncioPagina, totalPaginas - 1);
        const visiveis = filtradas.slice(pagina * ANUNCIO_POR_PAGINA, (pagina + 1) * ANUNCIO_POR_PAGINA);
        const alternarExpandido = (sku: string) => setAnuncioExpandidos((prev) => { const next = new Set(prev); if (next.has(sku)) next.delete(sku); else next.add(sku); return next; });
        const todosExpandidos = filtradas.length > 0 && filtradas.every((l) => anuncioExpandidos.has(l.sku));
        const alternarTodos = () => setAnuncioExpandidos(todosExpandidos ? new Set<string>() : new Set<string>(filtradas.map((l) => l.sku)));
        const marcarTodosProntos = () => setAnuncioCriarLinhas((prev) => prev.map((linha) => {
          const mps: any = { ...linha.marketplaces };
          for (const { id } of ANUNCIO_MARKETPLACES) { const c = celula(linha, id).chave; if (c === 'pronto') mps[id] = { ...mps[id], selecionado: true }; }
          return { ...linha, marketplaces: mps };
        }));
        const chip = (ativo: boolean): any => ({ fontSize: 11.5, padding: '3px 10px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${ativo ? '#7c3aed' : 'var(--border)'}`, background: ativo ? '#f5f3ff' : 'var(--white)', color: ativo ? '#6d28d9' : 'var(--gray-600)', fontWeight: 700 });
        const miniBtn = (cor: string, cheio?: boolean): any => ({ fontSize: 11, fontWeight: 600, color: cheio ? '#fff' : cor, background: cheio ? cor : 'var(--white)', border: `1px solid ${cor}`, borderRadius: 5, padding: '1px 7px', cursor: 'pointer', lineHeight: 1.5 });
        const crumb = (c?: string) => (c || '').split(' > ').join(' › ');

        return (
        <div style={{ ...s.card, padding: isPhone ? '14px' : '18px', marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginRight: 4 }}>{anuncioCriarLinhas.length} SKU(s)</span>
              <button type="button" style={chip(anuncioFiltro === 'todos')} onClick={() => { setAnuncioFiltro('todos'); setAnuncioPagina(0); }}>todos</button>
              <button type="button" style={chip(anuncioFiltro === 'prontos')} onClick={() => { setAnuncioFiltro('prontos'); setAnuncioPagina(0); }}>{contagem.pronto} prontos</button>
              <button type="button" style={chip(anuncioFiltro === 'problema')} onClick={() => { setAnuncioFiltro('problema'); setAnuncioPagina(0); }}>{contagem.problema} com problema · {contagem.tem} com anúncio</button>
              {anuncioVerificando && <span style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>⏳ verificando status nos marketplaces…</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={alternarTodos} style={{ ...miniBtn('#475569'), padding: '4px 10px', fontSize: 12 }}>{todosExpandidos ? '▾ Recolher todos' : '▸ Expandir todos'}</button>
              <button type="button" onClick={marcarTodosProntos} disabled={anuncioCriarProcessando} style={{ ...miniBtn('#475569'), padding: '4px 10px', fontSize: 12 }}>Marcar todos prontos</button>
              <button
                onClick={processarAnunciosCriarFila}
                disabled={anuncioCriarProcessando || anuncioCriarSelecionadosCount === 0}
                style={{ ...s.btn, background: '#ee4d2d', color: '#fff', padding: '5px 12px', fontSize: 12.5, opacity: anuncioCriarProcessando || anuncioCriarSelecionadosCount === 0 ? 0.6 : 1 }}
              >
                {anuncioCriarProcessando
                  ? `Criando ${anuncioCriarSkuAtual} (${anuncioCriarMarketplaceAtual ? ANUNCIO_MARKETPLACES.find((m) => m.id === anuncioCriarMarketplaceAtual)?.label : ''}) ${anuncioCriarProgresso.atual + 1}/${anuncioCriarProgresso.total}...`
                  : `Criar selecionados (${anuncioCriarSelecionadosCount})`}
              </button>
            </div>
          </div>

          <div>
            {visiveis.map((linha) => {
              const aberto = anuncioExpandidos.has(linha.sku);
              const bloqueada = linha.encontrado && (!linha.fotosOk || linha.semEstoque);
              const nomeCurto = (id: AnuncioMarketplaceId) => (id === 'mercado-livre' ? 'ML' : ANUNCIO_MARKETPLACES.find((m) => m.id === id)?.label || id);
              return (
                <div key={linha.sku} style={{ borderTop: '1px solid var(--gray-300)', padding: '10px 4px' }}>
                  <div onClick={(e) => { if (e.ctrlKey || e.metaKey) { copiarSku(linha.sku); return; } alternarExpandido(linha.sku); }} style={{ display: 'grid', gridTemplateColumns: isPhone || aberto ? '14px minmax(0, 1fr)' : '14px minmax(0, 1fr) repeat(4, 150px)', columnGap: 10, rowGap: 6, alignItems: 'start', cursor: 'pointer' }}>
                    <span style={{ color: 'var(--gray-400)', width: 12, fontSize: 11, paddingTop: 2 }}>{aberto ? '▾' : '▸'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-900)', fontWeight: 700 }} title="Ctrl + clique copia o SKU">
                        {linha.sku}{skuCopiado === linha.sku ? <span style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 10.5, color: '#166534', marginLeft: 8 }}>✓ copiado</span> : null}{linha.origem === 'cadastro' ? <span style={{ fontFamily: 'inherit', fontWeight: 500, fontSize: 10.5, color: 'var(--gray-500)', marginLeft: 6 }}>pré-cadastro</span> : null}
                      </div>
                      <div style={{ fontSize: 12, color: linha.encontrado ? 'var(--gray-700)' : '#dc2626' }}>{linha.encontrado ? linha.descricao : (linha.erro || 'SKU não encontrado')}</div>
                      {aberto && linha.encontrado && (
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                          R$ {Number(linha.preco || 0).toFixed(2)} · estoque {linha.estoque} · {linha.moto?.marca} {linha.moto?.modelo}
                          <button type="button" onClick={(e) => { e.stopPropagation(); alternarAjusteSku(linha.sku); }} style={{ marginLeft: 10, fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                            {anuncioAjustes[linha.sku]?.aberto ? 'fechar ajuste' : 'ajustar título / condição / texto'}
                          </button>
                        </div>
                      )}
                    </div>
                                        {!aberto && (bloqueada ? (
                      <span style={{ gridColumn: isPhone ? '2' : '3 / span 4', fontSize: 11.5, color: '#b91c1c', paddingTop: 2 }}>{!linha.fotosOk ? '✗ Fotos Anúncios ainda não foi processado' : (linha.bloqueioTexto ? `✗ ${linha.bloqueioTexto}` : '✗ Sem estoque — não há mais unidade disponível')}</span>
                    ) : ANUNCIO_MARKETPLACES.map(({ id }) => {
                      if (!linha.marketplaces[id].disponivel) return <span key={id} />;
                      const c = celula(linha, id);
                      return (
                        <span key={id} style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', minWidth: 0, gridColumn: isPhone ? '2' : undefined }}>
                          <span style={{ color: 'var(--gray-500)', fontSize: 10.5 }}>{id === 'mercado-livre' ? 'ML' : ANUNCIO_MARKETPLACES.find((m) => m.id === id)?.label}</span>
                          <span
                            onClick={(e) => { if (c.clicavel && !anuncioCriarProcessando) { e.stopPropagation(); toggleAnuncioCriarSelecionado(linha.sku, id); } }}
                            style={{ color: c.cor, background: c.fundo, borderRadius: 5, padding: '2px 7px', fontWeight: 600, cursor: c.clicavel ? 'pointer' : 'inherit', maxWidth: '100%', lineHeight: 1.3 }}
                          >{c.texto}</span>
                        </span>
                      );
                    }))}
                  </div>

                  {aberto && (
                    <div style={{ marginLeft: 22, marginTop: 8 }}>
                      {bloqueada && (
                        <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 6 }}>
                          {!linha.fotosOk ? 'A pasta de fotos deste SKU não está na pasta oficial da moto. Nenhum marketplace foi habilitado — rode o Fotos Anúncios e busque de novo.' : (linha.bloqueioTexto ? `${linha.bloqueioTexto}. Nenhum marketplace foi habilitado.` : 'Este SKU está sem estoque (0 unidade). Nenhum marketplace foi habilitado para criar anúncio.')}
                        </div>
                      )}
                      {linha.encontrado && linha.fotosOk && ANUNCIO_MARKETPLACES.filter(({ id }) => linha.marketplaces[id].disponivel).map(({ id: mk, label }) => {
                        const mp = linha.marketplaces[mk];
                        const c = celula(linha, mk);
                        const v = anuncioVinculos[linha.sku]?.mercados?.[mk];
                        const ocupado = anuncioVinculoOcupado === `${linha.sku}|${mk}`;
                        const cat = mp.categoriaPendente ? null : (mp.categoriaEscolhidaId != null ? categoriasDoMarketplace(mk).find((x) => x.id === mp.categoriaEscolhidaId) || mp.categoriaAtual : mp.categoriaAtual);
                        const temVinculo = !!v && v.status !== 'livre';
                        const sitDet = v?.situacao || anuncioStatusRapido[linha.sku]?.[mk] || null;
                        return (
                          <div key={mk} style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '20px 105px minmax(0, 1fr) 230px 120px', gap: isPhone ? 2 : 10, alignItems: 'start', padding: '5px 0', borderTop: '1px dashed var(--gray-200)', fontSize: 12 }}>
                            <span>
                              {c.clicavel && <input type="checkbox" checked={mp.selecionado} disabled={anuncioCriarProcessando} onChange={() => toggleAnuncioCriarSelecionado(linha.sku, mk)} />}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{label}</span>
                            <div style={{ color: 'var(--gray-800)', lineHeight: 1.4 }}>
                              {mp.jaTemAnuncio ? <span style={{ color: 'var(--gray-400)' }}>—</span> : (
                                <>
                                  {mp.categoriaPendente ? <span style={{ color: '#b45309' }}>⏳ Categoria pendente</span>
                                    : !cat ? <span style={{ color: '#dc2626' }}>Sem categoria</span>
                                    : <span style={{ color: cat.permitido ? 'var(--gray-800)' : '#991b1b' }}>
                                        {cat.generica ? <span style={{ color: '#b45309' }}>⚠ </span> : ''}{!cat.permitido ? '🚫 ' : ''}{crumb(cat.caminho || [cat.categoria, cat.subcategoria, cat.nivel3, cat.nivel4].filter(Boolean).join(' > '))}
                                      </span>}
                                  {' '}
                                  <button type="button" onClick={() => { carregarCategoriasDoMarketplace(mk); setCategoriaModalMarketplace(mk); setCategoriaModalSku(linha.sku); setCategoriaModalBusca(''); }} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>trocar</button>
                                  {mk === 'mercado-livre' && mp.categoriaPreCadastro && String(mp.categoriaPreCadastro.id) !== String(mp.categoriaEscolhidaId) && (
                                    <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                                      Pré-cadastro: {mp.categoriaPreCadastro.nome} ({mp.categoriaPreCadastro.id}){mp.sugestaoOrigem === 'ia' ? ' · sugestão da IA' : mp.sugestaoOrigem === 'palavras' ? ' · por palavras (IA indisponível — confira)' : ''}
                                    </div>
                                  )}
                                  {mp.restricoes && mp.restricoes.length > 0 && (
                                    <div style={{ fontSize: 11.5, color: '#b91c1c' }}>⚠ Restrição: {mp.restricoes.join(' | ')}</div>
                                  )}
                                  {(mp.fichaFaltando || []).length > 0 && (
                                    <div style={{ marginTop: 6, display: 'grid', gap: 6, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8 }}>
                                      <div style={{ fontSize: 11.5, color: '#92400e', fontWeight: 600 }}>Campos obrigatórios desta categoria — preencha para liberar:</div>
                                      {(mp.fichaFaltando || []).map((campo) => (
                                        <label key={campo.nome} style={{ display: 'grid', gap: 2, fontSize: 11.5, color: 'var(--gray-700)' }}>
                                          <span>{campo.nome}</span>
                                          {campo.escolhas && campo.escolhas.length ? (
                                            <select value={(mp.fichaValores || {})[campo.nome] || ''} onChange={(e: any) => atualizarFichaCampo(linha.sku, mk, campo.nome, e.target.value)} style={{ ...s.input, padding: '4px 6px', fontSize: 12 }}>
                                              <option value="">Selecione…</option>
                                              {campo.escolhas.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                          ) : (
                                            <input value={(mp.fichaValores || {})[campo.nome] || ''} onChange={(e: any) => atualizarFichaCampo(linha.sku, mk, campo.nome, e.target.value)} placeholder={String(campo.exemplo || '').slice(0, 70)} style={{ ...s.input, padding: '4px 6px', fontSize: 12 }} />
                                          )}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            <div style={{ color: 'var(--gray-700)', lineHeight: 1.4 }}>
                              {temVinculo && v ? (
                                <>
                                  {sitDet && <span style={{ fontWeight: 500, marginRight: 6, color: sitDet.ok ? '#166534' : '#b91c1c' }}>{`● ${sitDet.texto.toLowerCase()}`}</span>}
                                  {v.status === 'divergente' && <span style={{ color: '#b91c1c', marginRight: 6 }}>IDs diferentes</span>}
                                  {v.status === 'so_bling' && <span style={{ marginRight: 6 }}>só no Bling</span>}
                                  {v.status === 'so_sistema' && <span style={{ marginRight: 6 }}>só no sistema</span>}
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-600)', wordBreak: 'break-all' }}>
                                    {v.status === 'ok' || v.status === 'so_sistema' ? v.sistemaId : v.status === 'so_bling' ? v.blingCodigo : `sist ${v.sistemaId || '—'} · bling ${v.blingCodigo || '—'}`}
                                  </span>
                                </>
                              ) : mp.jaTemAnuncio ? (
                                <span>{sitDet && <span style={{ fontWeight: 500, marginRight: 6, color: sitDet.ok ? '#166534' : '#b91c1c' }}>{`● ${sitDet.texto.toLowerCase()}`}</span>}já possui anúncio (item {mp.itemId})</span>
                              ) : (c.chave !== 'sel' && c.chave !== 'pronto' ? <span style={{ color: c.cor }}>{c.texto}</span> : null)}
                              {mp.status === 'ok' && (
                                <div style={{ fontSize: 11.5, color: '#166534' }}>
                                  ✓ Criado — item {mp.resultado?.shopeeItemId || mp.resultado?.magaluItemId || mp.resultado?.nuvemshopItemId || mp.resultado?.mercadoLivreItemId || (mp.resultado?.anuncioBlingId ? `Bling ${mp.resultado.anuncioBlingId}` : '')}{mp.resultado?.publicado === false ? ' (oculto na loja)' : ''}{mp.resultado?.aviso ? ` — ⚠ ${mp.resultado.aviso}` : ''}{mp.resultado?.blingErro ? ` — ⚠ Bling: ${mp.resultado.blingErro}` : ''}
                                </div>
                              )}
                              {mp.status === 'erro' && <div style={{ fontSize: 11.5, color: '#dc2626' }}>✗ {mp.erroProcessamento}</div>}
                            </div>
                            <div>
                              {(temVinculo || mp.jaTemAnuncio) && (
                                <button type="button" disabled={ocupado || anuncioCriarProcessando} onClick={() => setExcluirModal({ sku: linha.sku, mk })} style={{ fontSize: 11, color: '#b91c1c', background: 'var(--white)', border: '1px solid #fecaca', borderRadius: 5, padding: '2px 10px', cursor: 'pointer' }}>{ocupado ? 'Excluindo...' : 'Excluir'}</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {linha.encontrado && anuncioAjustes[linha.sku]?.aberto && (
                        <div style={{ marginTop: 8 }}>
                          {(() => {
                                  const aj = anuncioAjustes[linha.sku];
                                  return (
                                    <div style={{ marginTop: 8, display: 'grid', gap: 8, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                                      {aj.carregando ? (
                                        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Lendo o Bling...</div>
                                      ) : (
                                        <>
                                          <div>
                                            <label style={s.label}>Título ({aj.titulo.length}/60)</label>
                                            <input style={s.input} maxLength={60} value={aj.titulo} onChange={(e: any) => atualizarAjuste(linha.sku, { titulo: e.target.value })} />
                                          </div>
                                          <div>
                                            <label style={s.label}>Condição</label>
                                            <select style={s.input} value={aj.condicao} onChange={(e: any) => atualizarAjuste(linha.sku, { condicao: e.target.value === 'novo' ? 'novo' : 'usado' })}>
                                              <option value="usado">Usado</option>
                                              <option value="novo">Novo</option>
                                            </select>
                                            {aj.original && aj.condicao !== aj.original.condicao && (
                                              <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>Mudar a condição pode alterar categoria e restrições: depois de salvar, busque o SKU de novo.</div>
                                            )}
                                          </div>
                                          <div>
                                            <label style={s.label}>Texto do anúncio (sem formatação)</label>
                                            <textarea style={{ ...s.input, minHeight: 120, resize: 'vertical' as const }} value={aj.descricao} onChange={(e: any) => atualizarAjuste(linha.sku, { descricao: e.target.value })} />
                                            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 3 }}>Só é gravado se você alterar o texto. Ao salvar, a formatação (negrito etc.) do texto atual é substituída pelo texto simples.</div>
                                          </div>
                                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <button type="button" onClick={() => salvarAjusteSku(linha.sku)} disabled={aj.salvando} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', opacity: aj.salvando ? 0.6 : 1 }}>
                                              {aj.salvando ? 'Salvando...' : 'Salvar no Bling e no cadastro'}
                                            </button>
                                            {aj.msg && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>✓ {aj.msg}</span>}
                                            {aj.erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{aj.erro}</span>}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12 }}>
              <button type="button" disabled={pagina === 0} onClick={() => setAnuncioPagina(pagina - 1)} style={{ ...miniBtn('#475569'), padding: '3px 10px', opacity: pagina === 0 ? 0.4 : 1 }}>‹ anterior</button>
              <span style={{ color: 'var(--gray-600)' }}>página {pagina + 1} de {totalPaginas} · {filtradas.length} SKU(s)</span>
              <button type="button" disabled={pagina >= totalPaginas - 1} onClick={() => setAnuncioPagina(pagina + 1)} style={{ ...miniBtn('#475569'), padding: '3px 10px', opacity: pagina >= totalPaginas - 1 ? 0.4 : 1 }}>próxima ›</button>
            </div>
          )}
        </div>
        );
      })()}

      {excluirModal && (() => {
        const mkNome = ANUNCIO_MARKETPLACES.find((m) => m.id === excluirModal.mk)?.label || excluirModal.mk;
        const vm = anuncioVinculos[excluirModal.sku]?.mercados?.[excluirModal.mk];
        const fechar = () => setExcluirModal(null);
        const executar = (alvo: 'sistema' | 'sistema_bling' | 'sistema_bling_marketplace') => { const { sku, mk } = excluirModal; fechar(); removerVinculoAnuncio(sku, mk, alvo, true); };
        const opcao: any = { textAlign: 'left', width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--white)', cursor: 'pointer', display: 'grid', gap: 3 };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }} onClick={fechar}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'grid', gap: 12 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gray-800)' }}>Excluir anúncio — {mkNome} · {excluirModal.sku}</div>
                <button type="button" onClick={fechar} aria-label="Fechar" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--gray-400)' }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                ID atual: <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>sistema {vm?.sistemaId || '—'} · Bling {vm?.blingCodigo || '—'}</span>{vm?.situacao ? ` · ${vm.situacao.texto.toLowerCase()}` : ''}
              </div>
              <button type="button" disabled={!!vm && !vm.sistemaId} onClick={() => executar('sistema')} style={{ ...opcao, opacity: vm && !vm.sistemaId ? 0.5 : 1 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--gray-800)' }}>Excluir só do sistema</span>
                <span style={{ fontSize: 11.5, color: 'var(--gray-600)' }}>Apaga o ID do anúncio apenas no nosso sistema e libera o SKU para criar de novo. O vínculo no Bling continua como está — a auditoria do Bling pode preencher o ID de volta.</span>
              </button>
              <button type="button" onClick={() => executar('sistema_bling')} style={opcao}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: '#b91c1c' }}>Excluir do sistema + Bling</span>
                <span style={{ fontSize: 11.5, color: 'var(--gray-600)' }}>Apaga o ID no nosso sistema e o vínculo do produto com a loja no Bling{excluirModal.mk === 'mercado-livre' ? ' (e o anúncio do Mercado Livre dentro do Bling)' : ''}. Libera totalmente o SKU para criar de novo.</span>
              </button>
              {/* DESATIVADO por enquanto (Bruno ainda nao vai subir): opcao 'Excluir do sistema + Bling + Marketplace' (so Magalu, desativa o SKU).
                  Para ativar: remover este comentario e a trava EXCLUIR_NO_MARKETPLACE_ATIVO em backend/src/routes/anuncioVinculos.ts.
              {(() => {
                const ehMagalu = excluirModal.mk === 'magalu';
                const sitMk = vm?.situacao || anuncioStatusRapido[excluirModal.sku]?.[excluirModal.mk] || null;
                const publicado = !!sitMk && sitMk.ok;
                const habilitada = ehMagalu && !publicado;
                return (
                  <button type="button" disabled={!habilitada} onClick={() => executar('sistema_bling_marketplace')} style={{ ...opcao, opacity: habilitada ? 1 : 0.5, borderColor: habilitada ? '#fecaca' : 'var(--border)' }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: '#b91c1c' }}>Excluir do sistema + Bling + {mkNome}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--gray-600)' }}>
                      {!ehMagalu ? `Ainda não disponível para o ${mkNome} (por enquanto só o Magalu).`
                        : publicado ? 'Indisponível: o anúncio está PUBLICADO no Magalu. Despublique no painel do Magalu primeiro.'
                        : 'Primeiro desativa o SKU no Magalu (a API do Magalu não permite excluir o SKU de vez), depois faz o mesmo que a opção acima. Só roda se o anúncio NÃO estiver publicado.'}
                    </span>
                  </button>
                );
              })()}
              */}
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>As duas primeiras opções não mexem no produto dentro do {mkNome}: se ele ainda existir lá, exclua pelo painel do marketplace.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={fechar} style={{ fontSize: 12, padding: '5px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer', color: 'var(--gray-700)' }}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {categoriaModalSku && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setCategoriaModalSku(null)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 18px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gray-800)' }}>Categoria {ANUNCIO_MARKETPLACES.find((m) => m.id === categoriaModalMarketplace)?.label} — {categoriaModalSku}</div>
                <button onClick={() => setCategoriaModalSku(null)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--gray-400)' }}>✕</button>
              </div>
              {categoriaModalLinha?.marketplaces[categoriaModalMarketplace]?.categoriaAtual && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--gray-500)' }}>
                  Atual: {renderCategoriaBadge(categoriaModalLinha.marketplaces[categoriaModalMarketplace].categoriaAtual)}
                </div>
              )}
              <input
                autoFocus
                value={categoriaModalBusca}
                onChange={(e: any) => setCategoriaModalBusca(e.target.value)}
                placeholder="Buscar categoria (ex: bengala, farol, cabeçote...)"
                style={{ ...s.input, marginTop: 10 }}
              />
            </div>
            <div style={{ overflowY: 'auto', padding: '6px 10px' }}>
              {!categoriaModalLista.length ? (
                <div style={{ padding: 20, textAlign: 'center' as const, fontSize: 12, color: 'var(--gray-400)' }}>Carregando categorias...</div>
              ) : categoriaModalFiltradas.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center' as const, fontSize: 12, color: 'var(--gray-400)' }}>Nenhuma categoria encontrada pra "{categoriaModalBusca}".</div>
              ) : categoriaModalFiltradas.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => categoriaModalSku && escolherCategoriaParaLinha(categoriaModalSku, categoriaModalMarketplace, cat.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%',
                    textAlign: 'left' as const, padding: '9px 10px', border: 'none', borderBottom: '1px solid var(--gray-100)',
                    background: categoriaModalLinha?.marketplaces[categoriaModalMarketplace]?.categoriaEscolhidaId === cat.id ? '#f5f3ff' : 'transparent', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12.5, color: cat.permitido ? 'var(--gray-700)' : '#991b1b' }}>{cat.caminho}</span>
                  {!cat.permitido && <span style={{ fontSize: 10, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px', fontWeight: 700, whiteSpace: 'nowrap' }}>Bloqueada</span>}
                  {cat.permitido && cat.generica && <span style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', fontWeight: 700, whiteSpace: 'nowrap' }}>Genérica</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </>
  );

  const renderFotosDriveConteudo = () => (
    <>
      <div style={{ ...s.card, padding: isPhone ? '14px' : '18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Processar fotos do Drive (zip do Canva)</div>
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14, lineHeight: 1.5 }}>
          Identifica pastas na raiz de Fotos Pendentes que têm um <b>.zip</b> + fotos fora do padrão. Para cada uma: extrai o zip, descarta os brancos (imagens idênticas), grava as fotos, apaga as antigas + o zip e <b>move a pasta para a pasta oficial da moto</b>.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, flexDirection: isPhone ? 'column' : 'row' }}>
          {(['data', 'sku'] as const).map((modo) => (
            <button key={modo} onClick={() => setFdModo(modo)}
              style={{ ...s.btn, fontSize: 12, padding: '7px 14px', background: fdModo === modo ? 'var(--gray-800)' : 'var(--white)', color: fdModo === modo ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)' }}>
              {modo === 'data' ? 'Por Data de Cadastro' : 'Por SKU'}
            </button>
          ))}
        </div>
        {fdModo === 'data' ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={{ fontSize: 11, color: 'var(--gray-500)' }}>De</label><input type="date" value={fdDataDe} onChange={e => setFdDataDe(e.target.value)} style={{ ...s.input, padding: '7px 10px' }} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Até</label><input type="date" value={fdDataAte} onChange={e => setFdDataAte(e.target.value)} style={{ ...s.input, padding: '7px 10px' }} /></div>
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', alignSelf: 'center' }}>Vazio = processa a raiz toda.</div>
          </div>
        ) : (
          <input value={fdSku} onChange={e => setFdSku(e.target.value)} placeholder="Ex: HD04_0041" style={{ ...s.input, maxWidth: 280 }} />
        )}
        <div style={{ marginTop: 14 }}>
          <button onClick={fdEscanear} disabled={fdScanning || fdProcessando}
            style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (fdScanning || fdProcessando) ? 0.7 : 1 }}>
            {fdScanning ? 'Escaneando...' : 'Escanear pastas'}
          </button>
        </div>
      </div>

      {fdItens.length > 0 && (
        <div style={{ ...s.card, padding: isPhone ? '12px' : '16px', marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>
                {fdItens.length} pasta(s) identificada(s){fdPendentes ? ` · ${fdPendentes} pendente(s)` : ''}
              </div>
              {(() => {
                const processados = fdItens.filter(i => i.status === 'processado').map(i => i.sku)
                  .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }));
                if (!processados.length) return null;
                return (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(processados.join('\n'));
                        setFdCopiado(true);
                        setTimeout(() => setFdCopiado(false), 2000);
                      } catch { alert('Nao foi possivel copiar. Copie manualmente:\n\n' + processados.join('\n')); }
                    }}
                    title={`Copiar ${processados.length} SKU(s) processado(s), um por linha`}
                    style={{ ...s.btn, fontSize: 11.5, padding: '5px 12px', background: fdCopiado ? '#f0fdf4' : 'var(--white)', color: fdCopiado ? '#16a34a' : 'var(--gray-600)', border: `1px solid ${fdCopiado ? '#86efac' : 'var(--border)'}` }}>
                    {fdCopiado ? '✓ Copiado!' : `📋 Copiar SKUs (${processados.length})`}
                  </button>
                );
              })()}
            </div>
            <button onClick={fdProcessarTodos} disabled={fdProcessando || fdScanning || fdPendentes === 0}
              style={{ ...s.btn, background: '#16a34a', color: '#fff', opacity: (fdProcessando || fdPendentes === 0) ? 0.6 : 1 }}>
              {fdProcessando ? 'Processando...' : `Processar ${fdPendentes} pasta(s)`}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...s.th, textAlign: 'left' }}>SKU</th>
                <th style={{ ...s.th, textAlign: 'left' }}>Pasta</th>
                {FD_ETAPAS.map(et => <th key={et.key} style={{ ...s.th, fontSize: 10, whiteSpace: 'nowrap' }}>{et.label}</th>)}
                <th style={s.th}>Status</th>
                <th style={s.th}>Ação</th>
              </tr></thead>
              <tbody>
                {fdItens.map((item, i) => {
                  const stColor = item.status === 'processado' ? { bg: '#f0fdf4', c: '#16a34a' }
                    : item.status === 'erro' ? { bg: '#fef2f2', c: '#dc2626' }
                    : item.status === 'processando' ? { bg: '#faf5ff', c: '#9333ea' }
                    : { bg: '#f1f5f9', c: '#64748b' };
                  return (
                    <tr key={item.pastaId} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                      <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--blue-600)', whiteSpace: 'nowrap' }}>{item.sku}</td>
                      <td style={{ ...s.td, fontSize: 11.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.mensagem || item.nome}>{item.nome}</td>
                      {FD_ETAPAS.map(et => <td key={et.key} style={{ ...s.td, textAlign: 'center', fontSize: 13 }}>{fdEtapaCell(item, et.key)}</td>)}
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: stColor.bg, color: stColor.c, whiteSpace: 'nowrap' }}>
                          {item.status === 'processado' ? 'Processado' : item.status === 'erro' ? 'Erro' : item.status === 'processando' ? 'Processando' : 'Pendente'}
                        </span>
                        {item.brancosDescartados != null && item.status === 'processado' && (
                          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>{item.fotosGravadas} fotos · {item.brancosDescartados} brancos</div>
                        )}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <button onClick={() => fdProcessarUm(item.pastaId)} disabled={fdProcessando || item.status === 'processando'}
                          style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-700)', opacity: (fdProcessando || item.status === 'processando') ? 0.5 : 1 }}>
                          {item.status === 'processado' ? 'Refazer' : 'Processar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {fdItens.some(i => i.mensagem && (i.status === 'erro' || i.etapas?.limparAntigas === 'erro')) && (
            <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
              {fdItens.filter(i => i.mensagem && (i.status === 'erro' || i.etapas?.limparAntigas === 'erro')).map(i => (
                <div key={i.pastaId} style={{ fontSize: 11.5, color: '#dc2626' }}>⚠ <b>{i.sku}</b>: {i.mensagem}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderFotosManutencaoConteudo = () => {
    const total = manutencaoLinhas.length;
    const prontos = manutencaoLinhas.filter((l: ManutencaoFotosLinha) => l.ok).length;
    const concluidos = manutencaoLinhas.filter((l: ManutencaoFotosLinha) => l.status === 'concluido').length;
    const pendentesParaProcessar = manutencaoLinhas.filter((l: ManutencaoFotosLinha) => l.ok && l.status === 'pendente').length;

    return (
      <>
        <div style={{ ...s.card, padding: isPhone ? '14px' : '18px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Manutenção de fotos em anúncios já publicados</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14, lineHeight: 1.5 }}>
            Substitui <b>todas</b> as fotos do anúncio no Mercado Livre e na Nuvemshop pelas fotos já tratadas na pasta oficial da moto. Rode o <b>Fotos Drive</b> primeiro (é de lá que vêm as fotos novas) — as antigas são removidas dos dois marketplaces.
          </div>
          <label style={s.label}>SKUs</label>
          <textarea
            style={{ ...s.input, minHeight: isPhone ? 150 : 110, resize: 'vertical' }}
            value={manutencaoSkusInput}
            onChange={(e: any) => setManutencaoSkusInput(e.target.value)}
            placeholder={'HD04_0001\nPN_0001\nYM01_0001'}
          />
          <button
            onClick={prepararManutencaoUi}
            disabled={manutencaoPreparando || manutencaoProcessando || !manutencaoSkusInput.trim()}
            style={{ ...s.btn, marginTop: 10, background: '#7c3aed', color: '#fff', opacity: (manutencaoPreparando || manutencaoProcessando) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
          >
            {manutencaoPreparando ? 'Buscando...' : 'Buscar SKUs'}
          </button>
          {manutencaoErro && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>⚠ {manutencaoErro}</div>}
        </div>

        {total > 0 && (
          <div style={{ ...s.card, padding: isPhone ? '12px' : '16px', marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>
                {total} SKU(s) · {prontos} pronto(s) · {concluidos} concluído(s)
              </div>
              <button
                onClick={processarManutencaoTodos}
                disabled={manutencaoProcessando || pendentesParaProcessar === 0}
                style={{ ...s.btn, background: '#16a34a', color: '#fff', opacity: (manutencaoProcessando || pendentesParaProcessar === 0) ? 0.6 : 1 }}
              >
                {manutencaoProcessando ? 'Processando...' : `Processar ${pendentesParaProcessar} SKU(s)`}
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {manutencaoLinhas.map((linha: ManutencaoFotosLinha) => {
                const emProcessamento = linha.sku === manutencaoSkuAtual;
                if (!linha.ok) {
                  return (
                    <div key={linha.sku} style={{ border: '1px solid #fecaca', borderRadius: 8, padding: 12, background: '#fef2f2' }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--gray-800)' }}>{linha.sku}</div>
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>⚠ {linha.erro}</div>
                    </div>
                  );
                }
                return (
                  <div key={linha.sku} style={{ border: emProcessamento ? '2px solid #7c3aed' : '1px solid var(--border)', borderRadius: 8, padding: 12, background: emProcessamento ? '#faf5ff' : 'var(--white)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--gray-800)' }}>{linha.sku}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{linha.totalFotos} foto(s) na pasta oficial</div>
                    </div>

                    {linha.status === 'processando' && linha.etapaAtual && (
                      <div style={{ marginTop: 6 }}>
                        <span style={s.badge('#6d28d9', '#faf5ff', '#c4b5fd')}>{linha.etapaAtual}</span>
                      </div>
                    )}
                    {linha.status === 'pendente' && (
                      <div style={{ marginTop: 6 }}>
                        <span style={s.badge('var(--gray-500)', '#f1f5f9', 'var(--border)')}>Aguardando</span>
                      </div>
                    )}

                    {(linha.mlOk !== null || linha.nuvemshopOk !== null) && (
                      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 8, marginTop: 8 }}>
                        <div style={{ padding: '8px 10px', borderRadius: 6, background: linha.mlOk ? '#f0fdf4' : linha.mlOk === false ? '#fef2f2' : '#f8fafc' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: linha.mlOk ? '#16a34a' : linha.mlOk === false ? '#dc2626' : 'var(--gray-500)' }}>
                            Mercado Livre {linha.mlOk ? '✓ substituído' : linha.mlOk === false ? '✗' : '…'}
                          </div>
                          {linha.mlErro && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{linha.mlErro}</div>}
                        </div>
                        <div style={{ padding: '8px 10px', borderRadius: 6, background: linha.nuvemshopOk ? '#f0fdf4' : linha.nuvemshopOk === false ? '#fef2f2' : '#f8fafc' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: linha.nuvemshopOk ? '#16a34a' : linha.nuvemshopOk === false ? '#dc2626' : 'var(--gray-500)' }}>
                            Nuvemshop {linha.nuvemshopOk ? '✓ substituído' : linha.nuvemshopOk === false ? '✗' : '…'}
                          </div>
                          {linha.nuvemshopErro && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{linha.nuvemshopErro}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Cadastro</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Pré-cadastro e cadastro de peças</div>
          </div>
          {paginaCadastro === 'sku' && (
            <button onClick={abrirResumo}
              style={{ ...s.btn, fontSize: 12.5, fontWeight: 700, background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 16px' }}
              title="Resumo de status (dados, imagens/zip, cadastro) dos SKUs da lista filtrada">
              📋 Resumo
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isPhone ? '100%' : undefined, justifyContent: isPhone ? 'space-between' : 'flex-end' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--white)' }}>
            {(['sku', 'fotos-drive', 'anuncio', 'fotos', 'categoria', 'fotos-manutencao'] as const).map((tab, index, arr) => (
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
                {tab === 'sku' ? 'SKU' : tab === 'fotos-drive' ? 'Fotos Drive' : tab === 'anuncio' ? 'Anúncio' : tab === 'fotos' ? 'Fotos Anúncios' : tab === 'categoria' ? 'Categoria' : 'Fotos - Manutenção'}
              </button>
            ))}
          </div>
          {paginaCadastro === 'sku' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {canCriarPreCadastro && (
                <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', fontSize: isPhone ? 12 : 12.5, padding: isPhone ? '7px 12px' : '7px 14px' }} onClick={openNovo}>+ Novo Pré-cadastro</button>
              )}
              <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)', fontSize: isPhone ? 12 : 12.5, padding: isPhone ? '7px 10px' : '7px 12px' }} onClick={abrirReferenciaSku}>📥 Referência Bling</button>
              <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)', fontSize: isPhone ? 12 : 12.5, padding: isPhone ? '7px 10px' : '7px 12px' }} onClick={openConfig}>⚙️ Configuração</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: isPhone ? '14px' : '20px 24px' }}>
        {paginaCadastro === 'categoria' ? renderCategoriaConteudo() : paginaCadastro === 'fotos-drive' ? renderFotosDriveConteudo() : paginaCadastro === 'anuncio' ? renderAnuncioConteudo() : paginaCadastro === 'fotos-manutencao' ? renderFotosManutencaoConteudo() : paginaCadastro === 'fotos' ? (
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
                          {(['anb', 'ml', 'nuvemshop', 'shopee', 'magalu'] as const).map((sistema) => {
                            const info: any = linha[sistema];
                            const isSistemaProcessando = linha.sku === fotosProcessandoSku && sistema === fotosProcessandoSistema;
                            return (
                              <div key={sistema} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: isSistemaProcessando ? '2px solid #7c3aed' : '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', background: isSistemaProcessando ? '#f5f3ff' : '#fcfdff' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>{FOTOS_SISTEMA_LABEL[sistema]}: {Number(info?.fotos || 0)} foto(s)</span>
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
                          {['SKU', 'Descricao', 'Drive', 'ANB', 'ML', 'Nuvemshop', 'Shopee', 'Magalu', 'Status'].map((h) => <th key={h} style={s.th}>{h}</th>)}
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
                              {(['anb', 'ml', 'nuvemshop', 'shopee', 'magalu'] as const).map((sistema) => {
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
            <button
              style={{ ...s.btn, fontSize: 12, background: filters.skus ? 'var(--blue-600)' : 'var(--white)', color: filters.skus ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined }}
              onClick={() => { setSkusListaTexto(filters.skus); setSkusListaAberta(!skusListaAberta); }}
            >📋 Lista de SKUs{filters.skus ? ` (${filters.skus.split(/[\n,]+/).filter(Boolean).length})` : ''}</button>
            <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12, width: isPhone ? '100%' : undefined }} onClick={() => { setSearchInput(''); setSkusListaTexto(''); setSkusListaAberta(false); setFilters({ motoId: '', search: '', skus: '', semDimensoes: '', comDimensoes: '', preCadastroCompleto: '' }); }}>Limpar</button>
          </div>
          {skusListaAberta && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginBottom: 6 }}>Cole os SKUs (um por linha, ou separados por vírgula) para filtrar somente eles:</div>
              <textarea
                value={skusListaTexto}
                onChange={(e) => setSkusListaTexto(e.target.value.toUpperCase())}
                placeholder={'HD04_0001\nHD04_0002\nPN_0001'}
                rows={isPhone ? 4 : 3}
                style={{ ...s.input, width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexDirection: isPhone ? 'column' : 'row' }}>
                <button
                  style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', fontSize: 12, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
                  onClick={() => { setFilters((prev) => ({ ...prev, skus: skusListaTexto })); setSkusListaAberta(false); }}
                >Aplicar filtro</button>
                <button
                  style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
                  onClick={() => setSkusListaAberta(false)}
                >Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...s.card, overflow: 'hidden', maxWidth: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              {data.total} registro(s){somentePendentes ? ' (pendentes)' : ''}
              {filters.skus && <span style={{ color: 'var(--blue-600)', fontWeight: 600 }}> · filtrado por lista de SKUs</span>}
              {a4Sel.size > 0 && <span style={{ color: 'var(--blue-600)', fontWeight: 600 }}> · {a4Sel.size} selecionado(s)</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setA4Sel(new Set(linhasOrdenadasCadastro.map((i) => i.id)))}
                style={{ ...s.btn, fontSize: 12, padding: '7px 12px', background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>
                Selecionar tudo
              </button>
              <button
                onClick={() => setA4Sel(new Set())}
                disabled={a4Sel.size === 0}
                style={{ ...s.btn, fontSize: 12, padding: '7px 12px', background: 'var(--white)', color: a4Sel.size ? 'var(--gray-700)' : 'var(--gray-400)', border: '1px solid var(--border)', cursor: a4Sel.size ? 'pointer' : 'default' }}>
                Limpar seleção
              </button>
              <button
                onClick={() => { if (etiquetasA4.length === 0) return alert('Selecione ao menos um SKU.'); setModalA4Open(true); }}
                disabled={a4Sel.size === 0}
                style={{ ...s.btn, fontSize: 12, padding: '7px 14px', background: a4Sel.size ? '#16a34a' : 'var(--white)', color: a4Sel.size ? '#fff' : 'var(--gray-400)', border: '1px solid var(--border)', cursor: a4Sel.size ? 'pointer' : 'default' }}>
                🖨️ Impressão A4{a4Sel.size > 0 ? ` (${etiquetasA4.length} etiq.)` : ''}
              </button>
            </div>
          </div>
          {loading && !data.data.length ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Carregando...</div> :
            data.data.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Nenhum cadastro encontrado.</div> : isPhone ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.data.map((item) => {
                const cadastOk = item.status === 'cadastrado';
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--white)', display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <button
                          onClick={() => abrirCamera(item.idPeca)}
                          title="Tirar fotos do SKU com a câmera"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          📷 {item.idPeca}
                        </button>
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
                  <col style={{ width: 30 }} />
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
                <thead><tr>
                  <th style={{ ...s.th, padding: '9px 4px', textAlign: 'center' }}>
                    <input type="checkbox" checked={linhasOrdenadasCadastro.length > 0 && a4Sel.size === linhasOrdenadasCadastro.length} onChange={toggleA4SelTodos} title="Selecionar todos" />
                  </th>
                  {CADASTRO_COLUNAS.map(col => {
                  const ativo = !!col.key && sortCadastro.key === col.key;
                  return (
                    <th key={col.label}
                      onClick={col.key ? () => toggleSortCadastro(col.key as string) : undefined}
                      title={col.key ? 'Ordenar' : undefined}
                      style={{ ...s.th, padding: '9px 6px', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: col.key ? 'pointer' : 'default', userSelect: 'none', color: ativo ? 'var(--blue-600)' : undefined }}>
                      {col.label}{ativo ? (sortCadastro.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  );
                })}</tr></thead>
                <tbody>
                  {linhasOrdenadasCadastro.map((item) => {
                    const cadastOk = item.status === 'cadastrado';
                    return (
                      <tr key={item.id} style={{ background: a4Sel.has(item.id) ? '#eff6ff' : undefined }}>
                        <td style={{ ...s.td, padding: '10px 4px', textAlign: 'center' }}>
                          <input type="checkbox" checked={a4Sel.has(item.id)} onChange={() => toggleA4Sel(item.id)} />
                        </td>
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

      {modalA4Open && <ModalImpressaoA4 etiquetas={etiquetasA4} onClose={() => setModalA4Open(false)} />}
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
            <div style={{ flex: 1, minHeight: 0, overflowY: (isPhone || telaBaixa) ? 'auto' : 'hidden', display: isPhone ? 'block' : 'grid', gridTemplateColumns: isPhone ? undefined : isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'stretch', gap: 0 }}>

              {/* COLUNA ESQUERDA — campos do produto */}
              <div style={{ padding: isPhone ? '12px 14px' : '10px 14px', display: 'grid', alignContent: 'start', gap: isPhone ? 8 : 5, borderRight: (!isPhone && !isMobile) ? '1px solid var(--border)' : 'none', borderBottom: isPhone ? '1px solid var(--border)' : isMobile ? '1px solid var(--border)' : 'none', overflowY: (isPhone || telaBaixa) ? 'visible' : 'auto', minHeight: (isPhone || telaBaixa) ? undefined : 0 }}>

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

                {(etiquetas.some((e: string) => /005$/.test(String(e || '').trim())) || form.tipoPecaAvulsa === 'Bloco do motor') && (
                  <div>
                    <label style={s.label}>
                      Número do Motor <span style={{ color: '#dc2626' }}>*</span>
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 6, fontWeight: 400 }}>(obrigatório para Bloco do motor)</span>
                    </label>
                    <input style={s.input} value={form.numeroMotor || ''} onChange={(e) => setForm((p: any) => ({ ...p, numeroMotor: e.target.value }))} placeholder="Ex: RC91E0P000245" />
                  </div>
                )}

                <div>
                  <label style={s.label}>URL de Referência</label>
                  <input style={s.input} value={form.urlRef || ''} onChange={(e) => setForm((p: any) => ({ ...p, urlRef: e.target.value }))} placeholder="Ex: www.site.com.br/produto" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <input
                    type="checkbox"
                    id="pecaRestrita"
                    checked={!!form.pecaRestrita}
                    onChange={(e) => setForm((p: any) => ({ ...p, pecaRestrita: e.target.checked, sucata: e.target.checked ? false : p.sucata }))}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="pecaRestrita" style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>
                    Peça Restrita - Sem Revenda
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <input
                    type="checkbox"
                    id="sucata"
                    checked={!!form.sucata}
                    onChange={(e) => setForm((p: any) => ({ ...p, sucata: e.target.checked, pecaRestrita: e.target.checked ? false : p.pecaRestrita }))}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="sucata" style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>
                    Sucata
                  </label>
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
              <div style={{ padding: isPhone ? '12px 14px 16px' : '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: isPhone ? 8 : 5, overflowY: (isPhone || telaBaixa) ? 'visible' : 'auto', minHeight: (isPhone || telaBaixa) ? undefined : 0 }}>

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
                      style={{ ...s.input, flex: '1 1 auto', minHeight: isPhone ? 200 : 220, maxHeight: isPhone ? 320 : telaBaixa ? 420 : isTabletLandscape ? 'calc(100dvh - 210px)' : 'calc(100dvh - 260px)', borderRadius: 0, border: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', outline: 'none' }}
                      onInput={(e) => setForm((p: any) => ({ ...p, descricaoPeca: (e.target as HTMLDivElement).innerHTML }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: isPhone ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexDirection: isPhone ? 'column-reverse' : 'row', flexShrink: 0 }}>
              <button onClick={() => setModal(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>Cancelar</button>
              <button onClick={abrirReferenciaSku} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>📥 Referência Bling</button>
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
      <ReferenciaSkuModal
        open={refSkuModalOpen}
        skuInput={refSkuInput}
        loading={refSkuLoading}
        error={refSkuError}
        resultado={refSkuResultado}
        onChangeSkuInput={setRefSkuInput}
        onBuscar={buscarReferenciaSku}
        onAplicar={aplicarReferenciaSku}
        onClose={() => setRefSkuModalOpen(false)}
      />
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
              {loadingPreview ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Buscando dados...</div> : finalizarRestrita && previewBling ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontSize: 13, color: '#991b1b' }}>
                    Esta peça está marcada como <strong>Peça Restrita - Sem Revenda</strong>. Ela não passa pelo Bling/Mercado Livre/Nuvemshop — ao confirmar, será criada diretamente na tela de <strong>Prejuízo</strong>, com motivo "Peça Restrita - Sem Revenda".
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Descrição</div><div style={{ fontSize: 13, fontWeight: 500 }}>{previewBling.descricao}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Valor (Prejuízo)</div><div style={{ fontSize: 13, fontWeight: 700 }}>{`R$ ${Number(previewBling.precoVenda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Estoque</div><div style={{ fontSize: 13, fontWeight: 500 }}>{previewBling.estoque}</div></div>
                  </div>
                  {Number(previewBling.estoque) > 1 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                      ⚠ Estoque = {previewBling.estoque} → serão criados {previewBling.estoque} registros em Prejuízo: {itemFinalizar.idPeca}{Number(previewBling.estoque) > 1 ? `, ${itemFinalizar.idPeca}-2` : ''}{Number(previewBling.estoque) > 2 ? '...' : ''}
                    </div>
                  )}
                </div>
              ) : finalizarSucata && previewBling ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: 13, color: '#92400e' }}>
                    Esta peça está marcada como <strong>Sucata</strong>. Ela não passa pelo Bling/Mercado Livre/Nuvemshop — ao confirmar, será criada diretamente disponível na tela de <strong>Sucata</strong>, aguardando venda.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Descrição</div><div style={{ fontSize: 13, fontWeight: 500 }}>{previewBling.descricao}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Valor</div><div style={{ fontSize: 13, fontWeight: 700 }}>{`R$ ${Number(previewBling.precoVenda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Estoque</div><div style={{ fontSize: 13, fontWeight: 500 }}>{previewBling.estoque}</div></div>
                  </div>
                  {Number(previewBling.estoque) > 1 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                      ⚠ Estoque = {previewBling.estoque} → serão criados {previewBling.estoque} registros de Sucata: {itemFinalizar.idPeca}{Number(previewBling.estoque) > 1 ? `, ${itemFinalizar.idPeca}-2` : ''}{Number(previewBling.estoque) > 2 ? '...' : ''}
                    </div>
                  )}
                </div>
              ) : previewBling ? (
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
                style={{ ...s.btn, background: finalizarRestrita ? '#dc2626' : finalizarSucata ? '#b45309' : 'var(--green)', color: '#fff', opacity: (!canCriarProdutoBling || confirmando || !previewBling || loadingPreview) ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center', minHeight: isPhone ? 42 : undefined }}>
                {confirmando ? (finalizarRestrita ? 'Registrando...' : finalizarSucata ? 'Registrando...' : 'Lançando...') : (finalizarRestrita ? '✓ Confirmar e Registrar em Prejuízo' : finalizarSucata ? '✓ Confirmar e Registrar como Sucata' : '✓ Confirmar e Lançar no Estoque')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL CONFIGURAÇÃO */}
      {modalConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>⚙️ Configuração — Pré-Cadastro</div>
              <button onClick={() => setModalConfig(false)} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Moto padrão no novo pré-cadastro</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 10 }}>Será pré-selecionada ao clicar em "+ Novo Pré-cadastro".</div>
              <select
                value={configMotoIdDraft}
                onChange={e => setConfigMotoIdDraft(e.target.value)}
                style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', color: 'var(--ink)' }}
              >
                <option value="">— Sem padrão (usa última moto) —</option>
                {[...motos].sort((a, b) => a.id - b.id).map(m => (
                  <option key={m.id} value={String(m.id)}>ID {m.id} — {m.marca} {m.modelo} {m.ano ? `(${m.ano})` : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModalConfig(false)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvarConfig} disabled={savingConfig} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: savingConfig ? 0.7 : 1 }}>{savingConfig ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Camera: fotos do SKU direto na pagina, sobem pro Drive ao finalizar */}
      {cameraSku && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#111' }}>
            <div style={{ color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700 }}>📷 {cameraSku} — {cameraFotos.length}/{CAMERA_MAX_FOTOS}</div>
            <button onClick={fecharCamera} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 4 }}>×</button>
          </div>

          <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
            {cameraErro && (
              <div style={{ position: 'absolute', top: 10, left: 10, right: 10, background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, zIndex: 2 }}>{cameraErro}</div>
            )}
            <video ref={cameraVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {cameraFotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 12px', background: '#111' }}>
              {cameraFotos.map((foto) => (
                <div key={foto.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={foto.dataUrl} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, opacity: foto.status === 'enviando' ? 0.5 : 1 }} />
                  {foto.status === 'enviando' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 18, height: 18, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                  )}
                  {foto.status === 'ok' && (
                    <div title="Enviada" style={{ position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#16a34a', color: '#fff', border: '2px solid #111', fontSize: 11, lineHeight: '14px', textAlign: 'center' }}>✓</div>
                  )}
                  {foto.status === 'erro' && (
                    <div title={foto.error || 'Falha ao enviar'} style={{ position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#dc2626', color: '#fff', border: '2px solid #111', fontSize: 11, lineHeight: '14px', textAlign: 'center' }}>!</div>
                  )}
                  <button
                    onClick={() => removerFotoCamera(foto.id)}
                    disabled={foto.status === 'enviando'}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: foto.status === 'enviando' ? '#6b7280' : '#dc2626', color: '#fff', border: '2px solid #111', fontSize: 12, lineHeight: '16px', cursor: foto.status === 'enviando' ? 'default' : 'pointer', padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '16px 14px 24px', background: '#111' }}>
            <button
              onClick={tirarFotoCamera}
              disabled={cameraFotos.length >= CAMERA_MAX_FOTOS}
              style={{ width: 64, height: 64, borderRadius: '50%', background: cameraFotos.length >= CAMERA_MAX_FOTOS ? '#4b5563' : '#fff', border: '4px solid #6b7280', cursor: cameraFotos.length >= CAMERA_MAX_FOTOS ? 'default' : 'pointer' }}
              title="Tirar foto"
            />
            <button
              onClick={finalizarFotosCamera}
              disabled={!cameraFotos.length || cameraFotos.some((f) => f.status === 'enviando')}
              style={{ ...s.btn, background: cameraFotos.length ? '#16a34a' : '#374151', color: '#fff', opacity: !cameraFotos.length || cameraFotos.some((f) => f.status === 'enviando') ? 0.6 : 1, padding: '10px 18px' }}
            >
              {cameraFotos.some((f) => f.status === 'enviando') ? 'Enviando...' : `Finalizar (${cameraFotos.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Modal Resumo de status dos SKUs */}
      {resumoOpen && (
        <div onClick={() => setResumoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: isPhone ? '100%' : 'min(1000px, 100%)', maxHeight: isPhone ? '100dvh' : '90vh', minHeight: isPhone ? '100dvh' : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isPhone ? '14px' : '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>📋 Resumo de status</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>SKUs da lista filtrada · verificação ao vivo no Drive</div>
              </div>
              <button onClick={() => setResumoOpen(false)} style={{ border: 'none', background: 'var(--gray-100)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--gray-600)', flexShrink: 0 }}>×</button>
            </div>
            <div style={{ overflow: 'auto', padding: isPhone ? 12 : 16 }}>
              {resumoLoading ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--gray-400)' }}>⏳ Verificando no Drive... (pode levar alguns segundos)</div>
              ) : resumoData ? (
                <>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    {([
                      ['Total', resumoData.totais.total, 'var(--gray-700)', '#f1f5f9', '' as const],
                      ['✓ Liberadas p/ cadastro', resumoData.totais.liberadas, '#15803d', '#f0fdf4', 'liberadas' as const],
                      ['Com pendências', resumoData.totais.pendentes, '#c2410c', '#fff7ed', 'pendentes' as const],
                      ['Pendente tratamento imagens', resumoData.totais.pendenteImagens, '#c2410c', '#fff7ed', 'pendente_imagens' as const],
                      ['Sem fotos disponíveis', resumoData.totais.semFotos ?? 0, '#b91c1c', '#fef2f2', 'sem_fotos' as const],
                    ] as any[]).map(([label, val, cor, bg, chave]: any) => {
                      const ehTotal = chave === '';
                      const ativo = resumoFiltro === chave && !ehTotal;
                      const clicavel = ehTotal || val > 0;
                      return (
                        <button key={label} disabled={!clicavel}
                          onClick={() => setResumoFiltro(ehTotal ? '' : (resumoFiltro === chave ? '' : chave))}
                          title={ehTotal ? 'Mostrar todas' : (val > 0 ? 'Filtrar por este status' : 'Sem itens')}
                          style={{ flex: isPhone ? '1 1 44%' : '1 1 150px', textAlign: 'left', background: bg, borderRadius: 10, padding: '10px 14px', cursor: clicavel ? 'pointer' : 'default', opacity: clicavel ? 1 : 0.5, border: ativo ? `2px solid ${cor}` : '2px solid transparent', fontFamily: 'inherit' }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{val}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--gray-500)', fontWeight: 600 }}>{label}{ativo ? ' ●' : ''}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtro por SKU + limpar */}
                  <div style={{ display: 'flex', gap: 10, alignItems: isPhone ? 'stretch' : 'center', flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row', marginBottom: 12 }}>
                    <input value={resumoFiltroSku} placeholder="Filtrar por SKU..." onChange={e => setResumoFiltroSku(e.target.value)}
                      style={{ ...s.input, width: isPhone ? '100%' : 200, textTransform: 'uppercase' }} />
                    {(resumoFiltro || resumoFiltroSku) && (
                      <button onClick={() => { setResumoFiltro(''); setResumoFiltroSku(''); }}
                        style={{ ...s.btn, fontSize: 12, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                        ✕ Limpar filtro
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Mostrando {itensResumoFiltrados().length} de {resumoData.itens.length}</span>
                    <button onClick={copiarSkusResumo} disabled={!itensResumoFiltrados().length}
                      style={{ ...s.btn, fontSize: 12, background: skusCopiados ? '#f0fdf4' : 'var(--white)', border: `1px solid ${skusCopiados ? '#86efac' : 'var(--border)'}`, color: skusCopiados ? '#15803d' : 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                      {skusCopiados ? '✓ Copiado' : '📋 Copiar SKUs'}
                    </button>
                  </div>

                  {isPhone ? (
                    itensResumoFiltrados().length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray-400)' }}>Nenhuma peça com esse filtro.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {itensResumoFiltrados().map((it: any, i: number) => (
                          <div key={it.sku + i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: it.liberada ? '#fbfffe' : 'var(--white)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--gray-800)' }}>{it.sku}</div>
                                <div style={{ fontSize: 12.5, color: 'var(--gray-700)', marginTop: 2 }}>{it.descricao}</div>
                              </div>
                              <span style={{ flexShrink: 0, display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: it.liberada ? '#ecfdf3' : '#fff7ed', color: it.liberada ? '#047857' : '#c2410c' }}>
                                {it.liberada ? 'Liberada' : 'Pendências'}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 12 }}>
                              <div>
                                {it.dadosFaltando.length === 0
                                  ? <span style={{ color: '#15803d' }}>✓ dados completos</span>
                                  : <span style={{ color: '#c2410c' }}>dados: falta {it.dadosFaltando.join(', ')}</span>}
                              </div>
                              <div>
                                {it.imagens === 'completo'
                                  ? <span style={{ color: '#15803d' }}>✓ imagens completas <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>({it.motivo})</span></span>
                                  : it.imagens === 'pendente_tratamento'
                                    ? <span style={{ color: '#c2410c', fontWeight: 600 }}>⚠ imagens pendente tratamento</span>
                                    : <span style={{ color: '#b91c1c', fontWeight: 600 }}>✗ sem fotos disponíveis</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: 'var(--gray-50)' }}>
                          <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase' }}>SKU</th>
                          <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase' }}>Peça</th>
                          <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase' }}>Dados</th>
                          <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase' }}>Imagens</th>
                          <th style={{ textAlign: 'center', padding: '9px 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textTransform: 'uppercase' }}>Status</th>
                        </tr></thead>
                        <tbody>
                          {itensResumoFiltrados().length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--gray-400)' }}>Nenhuma peça com esse filtro.</td></tr>
                          ) : itensResumoFiltrados().map((it: any, i: number) => (
                            <tr key={it.sku + i} style={{ borderTop: '1px solid #f1f5f9', background: it.liberada ? '#fbfffe' : 'var(--white)' }}>
                              <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{it.sku}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--gray-700)' }}>{it.descricao}</td>
                              <td style={{ padding: '9px 12px' }}>
                                {it.dadosFaltando.length === 0
                                  ? <span style={{ color: '#15803d' }}>✓ completo</span>
                                  : <span style={{ color: '#c2410c' }}>falta: {it.dadosFaltando.join(', ')}</span>}
                              </td>
                              <td style={{ padding: '9px 12px' }}>
                                {it.imagens === 'completo'
                                  ? <span style={{ color: '#15803d' }}>✓ completo <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>({it.motivo})</span></span>
                                  : it.imagens === 'pendente_tratamento'
                                    ? <span style={{ color: '#c2410c', fontWeight: 600 }}>⚠ Pendente tratamento</span>
                                    : <span style={{ color: '#b91c1c', fontWeight: 600 }}>✗ Sem fotos disponíveis</span>}
                              </td>
                              <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: it.liberada ? '#ecfdf3' : '#fff7ed', color: it.liberada ? '#047857' : '#c2410c' }}>
                                  {it.liberada ? 'Liberada' : 'Pendências'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 10 }}>
                    Imagens: “completo” = zip na pasta pendente ou 2+ fotos tratadas (nome Capa/02...) · “Pendente tratamento” = 2+ fotos cruas mas sem zip · “Sem fotos disponíveis” = nenhuma ou só 1 foto. Dados = dimensões, nº peça, localização e preço.
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
