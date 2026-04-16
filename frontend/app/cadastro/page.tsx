'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
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
  urlRef?: string; status: string; blingProdutoId?: string;
  moto: { id: number; marca: string; modelo: string; ano?: number; descricaoModelo?: string };
};

const EMPTY_FORM = {
  motoId: '', idPeca: '', descricao: '', descricaoPeca: '', precoVenda: '',
  condicao: 'usado', peso: '', largura: '', altura: '', profundidade: '',
  numeroPeca: '', detranEtiqueta: '', localizacao: '', estoque: '1',
  categoriaMLId: '', categoriaMLNome: '', urlRef: '',
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
    { key: 'detranEtiqueta', label: 'Etiqueta Detran (opcional)', optional: true },
  ];
  const invalidos = campos.filter(c => !form[c.key]);
  if (invalidos.length === 0) return null;
  return (
    <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Campos pendentes:</div>
      {invalidos.map((c: any) => (
        <div key={c.key} style={{ color: c.optional ? '#f59e0b' : '#dc2626', marginBottom: 2 }}>
          {c.optional ? '⚠' : '✗'} {c.label}
        </div>
      ))}
    </div>
  );
}

export default function CadastroPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [caixas, setCaixas] = useState<string[]>([]);
  const [data, setData] = useState<{ total: number; data: CadastroPeca[] }>({ total: 0, data: [] });
  const [loading, setLoading] = useState(true);
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [filters, setFilters] = useState({ motoId: '', search: '', semDimensoes: '' });
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<CadastroPeca | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => { loadAll(); }, [filters, somentePendentes]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (somentePendentes) params.set('somentePendentes', 'true');
      if (filters.motoId) params.set('motoId', filters.motoId);
      if (filters.search) params.set('search', filters.search);
      if (filters.semDimensoes) params.set('semDimensoes', filters.semDimensoes);
      params.set('per', '200');
      const [d, m, cx] = await Promise.all([
        fetch(`${API}/cadastro?${params}`, { credentials: 'include' }).then(r => r.json()),
        api.motos.list(),
        api.pecas.caixas(),
      ]);
      setData(d);
      setMotos(m);
      setCaixas((cx || []).map((c: any) => c.caixa).filter(Boolean));
    } catch { }
    setLoading(false);
  }

  async function openNovo() {
    const motoId = motos[0]?.id ? String(motos[0].id) : '';
    const form0 = { ...EMPTY_FORM, motoId };
    setForm(form0); setEditItem(null); setCategorias([]);
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
      urlRef: item.urlRef || '',
    });
    setCategorias([]); setModal(true);
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

  function inserirHtml(tag: string) {
    const ta = document.getElementById('descricaoPeca-ta') as HTMLTextAreaElement;
    if (!ta) return;
    const start = ta.selectionStart; const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    const novo = ta.value.slice(0, start) + `<${tag}>${sel}</${tag}>` + ta.value.slice(end);
    setForm((p: any) => ({ ...p, descricaoPeca: novo }));
  }

  async function salvar() {
    if (!form.motoId || !form.idPeca || !form.descricao) return alert('Moto, ID da Peça e Descrição são obrigatórios');
    setSaving(true);
    try {
      const body = {
        motoId: Number(form.motoId), idPeca: form.idPeca, descricao: form.descricao,
        descricaoPeca: form.descricaoPeca || null, precoVenda: Number(form.precoVenda) || 0,
        condicao: form.condicao,
        peso: form.peso ? Number(form.peso) : null, largura: form.largura ? Number(form.largura) : null,
        altura: form.altura ? Number(form.altura) : null, profundidade: form.profundidade ? Number(form.profundidade) : null,
        numeroPeca: form.numeroPeca || null, detranEtiqueta: form.detranEtiqueta || null,
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
      await loadAll();
    } catch (e: any) { alert(e.message || 'Erro ao salvar'); }
    setSaving(false);
  }

  async function abrirFinalizar(item: CadastroPeca) {
    if (!item.blingProdutoId) return alert('Produto não foi enviado ao Bling ainda. Salve o pré-cadastro primeiro.');
    setItemFinalizar(item); setPreviewBling(null); setPreviewDiff({});
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
        body: JSON.stringify({ confirmar: true, frete: previewFrete, taxaPct: previewTaxa }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || 'Erro');
      alert(`✓ ${d.pecasCriadas?.length || 0} peça(s) lançada(s) no estoque!`);
      setModalFinalizar(false); await loadAll();
    } catch (e: any) { alert(e.message); }
    setConfirmando(false);
  }

  const valorTaxas = previewBling ? parseFloat((previewBling.precoML * previewTaxa / 100).toFixed(2)) : 0;
  const valorLiq = previewBling ? parseFloat((previewBling.precoML - previewFrete - valorTaxas).toFixed(2)) : 0;
  const motoSelecionada = motos.find((m) => String(m.id) === String(form.motoId));
  const formOk = camposOk(form);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Cadastro</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Pré-cadastro e cadastro de peças</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff' }} onClick={openNovo}>+ Novo Pré-cadastro</button>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <div style={{ ...s.card, padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <button
              style={{ ...s.btn, fontSize: 12, background: somentePendentes ? 'var(--gray-800)' : 'var(--white)', color: somentePendentes ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)' }}
              onClick={() => setSomentePendentes(!somentePendentes)}
            >{somentePendentes ? '📋 Só Pendentes' : '📋 Todos'}</button>
            <select style={{ ...s.input, width: 200 }} value={filters.motoId} onChange={(e) => setFilters({ ...filters, motoId: e.target.value })}>
              <option value="">Todas as motos</option>
              {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
            </select>
            <input style={{ ...s.input, width: 200 }} placeholder="Buscar ID ou descrição..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12 }} onClick={() => setFilters({ motoId: '', search: '', semDimensoes: '' })}>Limpar</button>
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
                          <button onClick={() => abrirFinalizar(item)}
                            style={{ ...s.badge(cadastOk ? '#2563eb' : '#dc2626', cadastOk ? '#eff6ff' : '#fef2f2', cadastOk ? '#bfdbfe' : '#fecaca'), cursor: 'pointer' }}>
                            {cadastOk ? '✓ OK' : 'Pendente'}
                          </button>
                        </td>
                        <td style={s.td}>
                          {!cadastOk && (
                            <button style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }} onClick={() => openEditar(item)}>Editar</button>
                          )}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: 24 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{editItem ? 'Editar Pré-Cadastro' : 'Novo Pré-Cadastro'}</div>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
              <ChecklistValidacao form={form} />

              <div>
                <label style={s.label}>Moto *</label>
                <select style={s.input} value={form.motoId} onChange={async (e) => { setForm((p: any) => ({ ...p, motoId: e.target.value })); if (!editItem) await carregarProximoId(e.target.value); }}>
                  <option value="">Selecione a moto</option>
                  {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo} {m.ano || ''}</option>)}
                </select>
                {motoSelecionada && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Marca: {motoSelecionada.marca}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={s.label}>Preço de Venda (R$) *</label><input style={s.input} type="number" min="0" step="0.01" value={form.precoVenda} onChange={(e) => setForm((p: any) => ({ ...p, precoVenda: e.target.value }))} placeholder="0.00" /></div>
                <div><label style={s.label}>Estoque *</label><input style={s.input} type="number" min="1" value={form.estoque} onChange={(e) => setForm((p: any) => ({ ...p, estoque: e.target.value }))} /></div>
              </div>

              <div>
                <label style={s.label}>Dimensões e Peso *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                  {[{ key: 'peso', label: 'Peso (kg)' }, { key: 'largura', label: 'Largura (cm)' }, { key: 'altura', label: 'Altura (cm)' }, { key: 'profundidade', label: 'Prof. (cm)' }].map(({ key, label }) => (
                    <div key={key}><div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>{label}</div><input style={s.input} type="number" min="0" step="0.01" value={form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder="0" /></div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>Localização (Caixa) *</label>
                  <input style={s.input} list="caixas-list" value={form.localizacao} onChange={(e) => setForm((p: any) => ({ ...p, localizacao: e.target.value }))} placeholder="Nome da caixa" />
                  <datalist id="caixas-list">{caixas.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={s.label}>Etiqueta Detran <span style={{ color: '#f59e0b' }}>(opcional)</span></label>
                  <input style={s.input} value={form.detranEtiqueta} onChange={(e) => setForm((p: any) => ({ ...p, detranEtiqueta: e.target.value }))} placeholder="Número da etiqueta" />
                </div>
              </div>

              <div><label style={s.label}>Número da Peça *</label><input style={s.input} value={form.numeroPeca} onChange={(e) => setForm((p: any) => ({ ...p, numeroPeca: e.target.value }))} placeholder="Código do fabricante" /></div>
              <div><label style={s.label}>URL de Referência</label><input style={s.input} value={form.urlRef || ''} onChange={(e) => setForm((p: any) => ({ ...p, urlRef: e.target.value }))} placeholder="Ex: www.site.com.br/produto" /></div>

              <div>
                <label style={s.label}>Descrição da Peça (corpo do anúncio)</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    {[{ label: 'B', tag: 'strong', style: { fontWeight: 700 } }, { label: 'I', tag: 'em', style: { fontStyle: 'italic' } }, { label: 'U', tag: 'u', style: { textDecoration: 'underline' } }].map(({ label, tag, style }) => (
                      <button key={tag} type="button" onClick={() => inserirHtml(tag)}
                        style={{ ...style, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'serif' }}>{label}</button>
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--gray-400)', alignSelf: 'center', marginLeft: 4 }}>Selecione o texto e clique para formatar</span>
                  </div>
                  <textarea id="descricaoPeca-ta" style={{ ...s.input, minHeight: 160, resize: 'vertical' as const, borderRadius: 0, border: 'none' }}
                    value={form.descricaoPeca} onChange={(e) => setForm((p: any) => ({ ...p, descricaoPeca: e.target.value }))}
                    placeholder="Texto completo do anúncio (puxado do texto modelo da moto)" />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              {!formOk && <span style={{ fontSize: 11, color: '#dc2626', marginRight: 'auto' }}>Preencha os campos obrigatórios</span>}
              <button onClick={() => setModal(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Cancelar</button>
              <button onClick={salvar} disabled={saving} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enviando...' : editItem ? '🔄 Atualizar Produto Bling' : '🚀 Criar Produto Bling'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FINALIZAR */}
      {modalFinalizar && itemFinalizar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Lançar no Estoque</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{itemFinalizar.idPeca} — {itemFinalizar.descricao}</div>
              </div>
              <button onClick={() => setModalFinalizar(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {loadingPreview ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Buscando dados do Bling...</div> : previewBling ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  {[
                    { key: 'descricao', label: 'Título', val: previewBling.descricao },
                    { key: 'precoVenda', label: 'Preço ML', val: `R$ ${Number(previewBling.precoML).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                    { key: 'peso', label: 'Peso (kg)', val: previewBling.peso },
                    { key: 'largura', label: 'Largura (cm)', val: previewBling.largura },
                    { key: 'altura', label: 'Altura (cm)', val: previewBling.altura },
                    { key: 'profundidade', label: 'Profundidade (cm)', val: previewBling.profundidade },
                    { key: null, label: 'Localização', val: previewBling.localizacao },
                    { key: null, label: 'Estoque', val: previewBling.estoque },
                  ].map(({ key, label, val }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{String(val ?? '—')}</div>
                      {key && previewDiff[key] && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>↑ Ajustado (era {String(previewDiff[key].anb ?? '')} no ANB)</div>}
                    </div>
                  ))}

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

                  {Number(previewBling.estoque) > 1 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                      ⚠ Estoque = {previewBling.estoque} → serão criados {previewBling.estoque} registros: {itemFinalizar.idPeca}{Number(previewBling.estoque) > 1 ? `, ${itemFinalizar.idPeca}-2` : ''}{Number(previewBling.estoque) > 2 ? '...' : ''}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalFinalizar(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Cancelar</button>
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
