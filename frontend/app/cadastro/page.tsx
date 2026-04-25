'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { formatEtiquetaMotoLabel, printSkuLabels } from '@/lib/estoque-label-print';

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

type CadastroPeca = {
  id: number; motoId: number; idPeca: string; descricao: string;
  descricaoPeca?: string; precoVenda: number; condicao: string;
  peso?: number; largura?: number; altura?: number; profundidade?: number;
  numeroPeca?: string; detranEtiqueta?: string; localizacao?: string;
  estoque: number; categoriaMLId?: string; categoriaMLNome?: string;
  urlRef?: string; fotoCapa?: string; fotoCapaNome?: string; status: string; blingProdutoId?: string;
  moto: { id: number; marca: string; modelo: string; ano?: number; descricaoModelo?: string };
};

const EMPTY_FORM = {
  motoId: '', idPeca: '', descricao: '', descricaoPeca: '', precoVenda: '',
  condicao: 'usado', peso: '', largura: '', altura: '', profundidade: '',
  numeroPeca: '', detranEtiqueta: '', localizacao: '', estoque: '1',
  categoriaMLId: '', categoriaMLNome: '', urlRef: '', fotoCapa: '', fotoCapaNome: '',
};

function camposOk(form: any) {
  return !!(form.motoId && form.idPeca && form.descricao && form.precoVenda &&
    form.peso && form.largura && form.altura && form.profundidade &&
    form.localizacao && form.numeroPeca && form.estoque && form.categoriaMLId);
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

  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const isMobile = isPhone || isTabletPortrait;

  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<CadastroPeca | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [buscandoCategoria, setBuscandoCategoria] = useState(false);
  const categoriaTimerRef = useRef<any>(null);
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
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadSupportData() {
    try {
      const resp = await fetch(`${API}/cadastro/opcoes`, { credentials: 'include' });
      const d = await resp.json();
      setMotos(Array.isArray(d?.motos) ? d.motos : []);
      setCaixas(Array.isArray(d?.caixas) ? d.caixas : []);
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
      setData(d);
    } catch { }
    setLoading(false);
  }

  async function openNovo() {
    // Moto default = a de ID mais alto (última adicionada)
    const motoOrdenada = [...motos].sort((a, b) => b.id - a.id);
    const motoId = motoOrdenada[0]?.id ? String(motoOrdenada[0].id) : '';
    const form0 = { ...EMPTY_FORM, motoId };
    setForm(form0); setEditItem(null); setCategorias([]); setEtiquetas(['']); setFotoPreviewOpen(false);
    if (motoId) await carregarProximoId(motoId, form0);
    setModal(true);
  }

  async function openEditar(item: CadastroPeca) {
    if (item.status === 'cadastrado') return;
    setEditItem(item);
    setForm({
      motoId: String(item.motoId), idPeca: item.idPeca, descricao: item.descricao,
      descricaoPeca: item.descricaoPeca || '', precoVenda: String(item.precoVenda),
      condicao: item.condicao,
      peso: item.peso != null ? String(item.peso) : '',
      largura: item.largura != null ? String(item.largura) : '',
      altura: item.altura != null ? String(item.altura) : '',
      profundidade: item.profundidade != null ? String(item.profundidade) : '',
      numeroPeca: item.numeroPeca || '', detranEtiqueta: item.detranEtiqueta || '',
      localizacao: item.localizacao || '', estoque: String(item.estoque),
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
      setForm((prev: any) => ({
        ...(formAtual || prev),
        idPeca: idResp.sugestao || prev.idPeca,
        descricaoPeca: modeloResp.descricaoModelo || prev.descricaoPeca,
      }));
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
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Arquivo invalido'));
        };
        reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem'));
        reader.readAsDataURL(file);
      });

      setFinalizarFotoCapa(dataUrl);
      setFinalizarFotoCapaNome(file.name);
    } catch (e: any) {
      alert(e.message || 'Erro ao importar foto capa');
    }
    setUploadingFotoCapa(false);
  }

  async function salvar() {
    if (!form.motoId || !form.idPeca || !form.descricao) return alert('Moto, ID da Peça e Descrição são obrigatórios');
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

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '0 14px' : '0 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Cadastro</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Pré-cadastro e cadastro de peças</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', fontSize: isPhone ? 12 : 12.5, padding: isPhone ? '7px 12px' : '7px 14px' }} onClick={openNovo}>+ Novo Pré-cadastro</button>
      </div>

      <div style={{ padding: isPhone ? '14px' : '20px 24px' }}>
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

        <div style={s.card}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>{data.total} registro(s){somentePendentes ? ' (pendentes)' : ''}</div>
          {loading ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Carregando...</div> :
            data.data.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Nenhum cadastro encontrado.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['ID Peça', 'Descrição', 'Moto', 'Preço', 'Estoque', 'Pré-Cadastro', 'Cadastro', 'Ações'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.data.map((item) => {
                    const cadastOk = item.status === 'cadastrado';
                    return (
                      <tr key={item.id}>
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', whiteSpace: 'nowrap' as const }}>{item.idPeca}</td>
                        <td style={{ ...s.td, maxWidth: 240 }}><div style={{ whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</div></td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' as const, fontSize: 12 }}>{item.moto?.marca} {item.moto?.modelo}</td>
                        <td style={s.td}>R$ {Number(item.precoVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={s.td}>{item.estoque}</td>
                        <td style={s.td}>
                          {cadastOk
                            ? <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>✓ OK</span>
                            : <button onClick={() => openEditar(item)} style={{ ...s.badge('var(--green)', '#f0fdf4', '#86efac'), cursor: 'pointer' }}>✓ OK</button>}
                        </td>
                        <td style={s.td}>
                          {cadastOk ? (
                            <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>✓ OK</span>
                          ) : (
                            <button onClick={() => abrirFinalizar(item)}
                              style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca'), cursor: 'pointer' }}>
                              Pendente
                            </button>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                            <button
                              style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', opacity: imprimindoItemId === item.id ? 0.7 : 1 }}
                              onClick={() => imprimirEtiquetasCadastro(item)}
                              disabled={imprimindoItemId === item.id}
                            >
                              {imprimindoItemId === item.id ? 'Imprimindo...' : 'Impressão'}
                            </button>
                            {!cadastOk && (
                              <button style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }} onClick={() => openEditar(item)}>Editar</button>
                            )}
                            {isBruno && (
                              <button
                                style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', opacity: eliminandoLinhaId === item.id ? 0.7 : 1 }}
                                onClick={() => eliminarLinhaCadastro(item)}
                                disabled={eliminandoLinhaId === item.id}
                              >
                                {eliminandoLinhaId === item.id ? 'Eliminando...' : 'Eliminar linha'}
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
      </div>

      {/* MODAL PRÉ-CADASTRO */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'flex-start', justifyContent: 'center', padding: isPhone ? 0 : isTabletLandscape ? '16px' : '20px 16px', overflowY: isPhone ? 'hidden' : 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : isMobile ? 680 : 1100, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: isPhone ? 0 : 20, display: 'flex', flexDirection: 'column', maxHeight: isPhone ? '100dvh' : undefined, minHeight: isPhone ? '100dvh' : undefined }}>

            {/* Header */}
            <div style={{ padding: isPhone ? '14px 14px 12px' : '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: isPhone ? 16 : 14, fontWeight: 600 }}>{editItem ? 'Editar Pré-Cadastro' : 'Novo Pré-Cadastro'}</div>
              <button onClick={() => setModal(false)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
            </div>

            {/* Corpo */}
            <div style={{ flex: 1, overflowY: 'auto', display: isPhone ? 'block' : 'grid', gridTemplateColumns: isPhone ? undefined : isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>

              {/* COLUNA ESQUERDA — campos do produto */}
              <div style={{ padding: isPhone ? '12px 14px' : '10px 14px', display: 'grid', gap: isPhone ? 8 : 5, borderRight: (!isPhone && !isMobile) ? '1px solid var(--border)' : 'none', borderBottom: isMobile && !isPhone ? '1px solid var(--border)' : 'none' }}>

                <div>
                  <label style={s.label}>Moto *</label>
                  <select style={s.input} value={form.motoId} onChange={async (e) => { setForm((p: any) => ({ ...p, motoId: e.target.value })); if (!editItem) await carregarProximoId(e.target.value); }}>
                    <option value="">Selecione a moto</option>
                    {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo} {m.ano || ''}</option>)}
                  </select>
                  {motoSelecionada && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>Marca: {motoSelecionada.marca}</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                  <label style={s.label}>Descrição (título) * — {form.descricao.length}/60</label>
                  <input style={{ ...s.input, borderColor: form.descricao.length >= 55 ? '#fcd34d' : undefined }} value={form.descricao} onChange={(e) => handleDescricaoChange(e.target.value)} placeholder="Título para ML e Nuvemshop" />
                </div>

                <div>
                  <label style={s.label}>Categoria ML *{form.categoriaMLId && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--gray-400)', fontWeight: 400 }}>ID: {form.categoriaMLId}</span>}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {categorias.length > 0 ? (
                      <select style={{ ...s.input, flex: 1 }} value={form.categoriaMLId} onChange={(e) => {
                        const cat = categorias.find((c: any) => (c.category_id || c.id) === e.target.value);
                        setForm((p: any) => ({ ...p, categoriaMLId: e.target.value, categoriaMLNome: cat?.category_name || cat?.name || '' }));
                      }}>
                        <option value="">Selecione</option>
                        {categorias.map((c: any) => <option key={c.category_id || c.id} value={c.category_id || c.id}>{c.category_name || c.name}</option>)}
                      </select>
                    ) : (
                      <input style={{ ...s.input, flex: 1 }} value={form.categoriaMLNome || ''} onChange={(e) => setForm((p: any) => ({ ...p, categoriaMLNome: e.target.value }))}
                        placeholder={buscandoCategoria ? 'Buscando...' : 'Clique buscar para sugerir'} readOnly={buscandoCategoria} />
                    )}
                    <button type="button" style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12, whiteSpace: 'nowrap' as const, opacity: buscandoCategoria ? 0.6 : 1 }}
                      onClick={() => { setCategorias([]); buscarCategoriaML(form.descricao); }} disabled={buscandoCategoria || !form.descricao}>
                      {buscandoCategoria ? '...' : '🔍 Buscar'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={s.label}>Preço de Venda (R$) *</label><input style={s.input} type="number" min="0" step="0.01" value={form.precoVenda} onChange={(e) => setForm((p: any) => ({ ...p, precoVenda: e.target.value }))} placeholder="0.00" /></div>
                  <div><label style={s.label}>Estoque *</label><input style={s.input} type="number" min="1" value={form.estoque} onChange={(e) => setForm((p: any) => ({ ...p, estoque: e.target.value }))} /></div>
                </div>

                <div>
                  <label style={s.label}>Dimensões e Peso *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                    {[{ key: 'peso', label: 'Peso (kg)' }, { key: 'largura', label: 'Largura (cm)' }, { key: 'altura', label: 'Altura (cm)' }, { key: 'profundidade', label: 'Prof. (cm)' }].map(({ key, label }) => (
                      <div key={key}><div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>{label}</div><input style={s.input} type="number" min="0" step="0.01" value={form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder="0" /></div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              <div style={{ padding: isPhone ? '0 14px 12px' : '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: isPhone ? 8 : 5 }}>

                <ChecklistValidacao form={form} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const }}>
                  <label style={s.label}>Descrição da Peça (corpo do anúncio)</label>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' as const }}>
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
                      contentEditable
                      suppressContentEditableWarning
                      style={{ ...s.input, flex: 1, minHeight: isPhone ? 200 : 220, borderRadius: 0, border: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', outline: 'none' }}
                      dangerouslySetInnerHTML={{ __html: form.descricaoPeca || '' }}
                      onInput={(e) => setForm((p: any) => ({ ...p, descricaoPeca: (e.target as HTMLDivElement).innerHTML }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: isPhone ? '14px' : '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexDirection: isPhone ? 'column-reverse' : 'row', flexShrink: 0 }}>
              <button onClick={() => setModal(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Cancelar</button>
              {editItem && isBruno && (
                <button onClick={() => excluir()} disabled={excluindo}
                  style={{ ...s.btn, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', opacity: excluindo ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                  {excluindo ? 'Excluindo...' : '🗑️ Excluir'}
                </button>
              )}
              <button onClick={salvar} disabled={saving} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Lançar no Estoque</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{itemFinalizar.idPeca} — {itemFinalizar.descricao}</div>
              </div>
              <button onClick={() => { setModalFinalizar(false); setFotoPreviewOpen(false); }} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
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
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFotoCapaChange}
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
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
                        style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', opacity: uploadingFotoCapa ? 0.7 : 1 }}
                      >
                        {uploadingFotoCapa ? 'Importando...' : (finalizarFotoCapa ? 'Trocar Foto Capa' : 'Importar Foto Capa')}
                      </button>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={s.label}>Frete (R$)</label><input style={s.input} type="number" step="0.01" value={previewFrete} onChange={(e) => setPreviewFrete(Number(e.target.value))} /></div>
                    <div><label style={s.label}>Taxa ML (%)</label><input style={s.input} type="number" step="0.1" value={previewTaxa} onChange={(e) => setPreviewTaxa(Number(e.target.value))} /></div>
                  </div>

                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' as const }}>
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
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setModalFinalizar(false); setFotoPreviewOpen(false); }} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Cancelar</button>
              <button onClick={confirmarFinalizar} disabled={confirmando || !previewBling || loadingPreview}
                style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: (confirmando || !previewBling || loadingPreview) ? 0.7 : 1 }}>
                {confirmando ? 'Lançando...' : '✓ Confirmar e Lançar no Estoque'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
