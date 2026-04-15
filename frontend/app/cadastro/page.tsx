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

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pre_cadastro: { label: 'Pré-cadastro', color: 'var(--green)', bg: '#f0fdf4', border: '#86efac' },
  cadastrado:   { label: 'Cadastrado',   color: '#2563eb',      bg: '#eff6ff',  border: '#bfdbfe' },
};

type CadastroPeca = {
  id: number; motoId: number; idPeca: string; descricao: string;
  descricaoPeca?: string; precoVenda: number; condicao: string;
  peso?: number; largura?: number; altura?: number; profundidade?: number;
  numeroPeca?: string; detranEtiqueta?: string; localizacao?: string;
  estoque: number; categoriaMLId?: string; categoriaMLNome?: string;
  fotoCapa?: string; status: string; blingProdutoId?: string;
  moto: { id: number; marca: string; modelo: string; ano?: number; descricaoModelo?: string };
};

const EMPTY_FORM = {
  motoId: '', idPeca: '', descricao: '', descricaoPeca: '', precoVenda: '',
  condicao: 'usado', peso: '', largura: '', altura: '', profundidade: '',
  numeroPeca: '', detranEtiqueta: '', localizacao: '', estoque: '1',
  categoriaMLId: '', categoriaMLNome: '',
};

export default function CadastroPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [caixas, setCaixas] = useState<string[]>([]);
  const [data, setData] = useState<{ total: number; data: CadastroPeca[] }>({ total: 0, data: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', motoId: '', search: '', semDimensoes: '', semNumeroPeca: '' });
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<CadastroPeca | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [buscandoCategoria, setBuscandoCategoria] = useState(false);
  const categoriaTimerRef = useRef<any>(null);
  // Etapa 2
  const [modal2, setModal2] = useState(false);
  const [item2, setItem2] = useState<CadastroPeca | null>(null);
  const [fotoBase64, setFotoBase64] = useState('');
  const [finalizando, setFinalizando] = useState(false);

  useEffect(() => { loadAll(); }, [filters]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.motoId) params.set('motoId', filters.motoId);
      if (filters.search) params.set('search', filters.search);
      if (filters.semDimensoes) params.set('semDimensoes', filters.semDimensoes);
      if (filters.semNumeroPeca) params.set('semNumeroPeca', filters.semNumeroPeca);
      params.set('per', '200');

      const [d, m, cx] = await Promise.all([
        fetch(`${API}/cadastro?${params}`, { credentials: 'include' }).then(r => r.json()),
        api.motos.list(),
        api.pecas.caixas(),
      ]);
      setData(d);
      setMotos(m);
      setCaixas((cx || []).map((c: any) => c.caixa).filter(Boolean));
    } catch { /* silent */ }
    setLoading(false);
  }

  async function openNovo() {
    const ultimaMoto = motos[0];
    const motoId = ultimaMoto?.id || '';
    const form0 = { ...EMPTY_FORM, motoId: String(motoId) };
    setForm(form0);
    setEditItem(null);
    setCategorias([]);
    if (motoId) await carregarProximoId(String(motoId), form0);
    setModal(true);
  }

  async function openEditar(item: CadastroPeca) {
    setEditItem(item);
    setForm({
      motoId: String(item.motoId),
      idPeca: item.idPeca,
      descricao: item.descricao,
      descricaoPeca: item.descricaoPeca || '',
      precoVenda: String(item.precoVenda),
      condicao: item.condicao,
      peso: item.peso != null ? String(item.peso) : '',
      largura: item.largura != null ? String(item.largura) : '',
      altura: item.altura != null ? String(item.altura) : '',
      profundidade: item.profundidade != null ? String(item.profundidade) : '',
      numeroPeca: item.numeroPeca || '',
      detranEtiqueta: item.detranEtiqueta || '',
      localizacao: item.localizacao || '',
      estoque: String(item.estoque),
      categoriaMLId: item.categoriaMLId || '',
      categoriaMLNome: item.categoriaMLNome || '',
    });
    setCategorias([]);
    setModal(true);
  }

  async function carregarProximoId(motoId: string, formAtual?: any) {
    if (!motoId) return;
    try {
      const resp = await fetch(`${API}/cadastro/proximo-id/${motoId}`, { credentials: 'include' });
      const d = await resp.json();
      if (d.sugestao) {
        setForm((prev: any) => ({ ...(formAtual || prev), idPeca: d.sugestao }));
      }
      // Carregar texto modelo da moto
      const motoResp = await fetch(`${API}/cadastro/motos/${motoId}/descricao-modelo`, { credentials: 'include' });
      const motoData = await motoResp.json();
      if (motoData.descricaoModelo) {
        setForm((prev: any) => ({ ...(formAtual || prev), idPeca: d.sugestao || prev.idPeca, descricaoPeca: motoData.descricaoModelo }));
      }
    } catch { /* silent */ }
  }

  async function buscarCategoriaML(titulo: string) {
    if (!titulo || titulo.length < 5) { setCategorias([]); return; }
    setBuscandoCategoria(true);
    try {
      // Proxy via backend para evitar CORS
      const resp = await fetch(
        `${API}/mercado-livre/categoria-predictor?titulo=${encodeURIComponent(titulo + ' moto')}`,
        { credentials: 'include' },
      );
      if (!resp.ok) throw new Error('Erro na API ML');
      const d = await resp.json();
      // Retorna array direto: [{category_id, category_name, ...}]
      const sugestoes = Array.isArray(d) ? d : [];
      setCategorias(sugestoes.slice(0, 5));
      if (sugestoes.length > 0) {
        const melhor = sugestoes[0];
        setForm((prev: any) => ({
          ...prev,
          categoriaMLId: melhor.category_id || melhor.id || '',
          categoriaMLNome: melhor.category_name || melhor.name || '',
        }));
      }
    } catch { /* silent */ }
    setBuscandoCategoria(false);
  }

  function handleDescricaoChange(val: string) {
    setForm((prev: any) => ({ ...prev, descricao: val.slice(0, 60) }));
    clearTimeout(categoriaTimerRef.current);
    categoriaTimerRef.current = setTimeout(() => buscarCategoriaML(val), 800);
  }

  async function salvar() {
    if (!form.motoId || !form.idPeca || !form.descricao) {
      return alert('Moto, ID da Peça e Descrição são obrigatórios');
    }
    setSaving(true);
    try {
      const body = {
        motoId: Number(form.motoId),
        idPeca: form.idPeca,
        descricao: form.descricao,
        descricaoPeca: form.descricaoPeca || null,
        precoVenda: Number(form.precoVenda) || 0,
        condicao: form.condicao,
        peso: form.peso ? Number(form.peso) : null,
        largura: form.largura ? Number(form.largura) : null,
        altura: form.altura ? Number(form.altura) : null,
        profundidade: form.profundidade ? Number(form.profundidade) : null,
        numeroPeca: form.numeroPeca || null,
        detranEtiqueta: form.detranEtiqueta || null,
        localizacao: form.localizacao || null,
        estoque: Number(form.estoque) || 1,
        categoriaMLId: form.categoriaMLId || null,
        categoriaMLNome: form.categoriaMLNome || null,
      };

      if (editItem) {
        await fetch(`${API}/cadastro/${editItem.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(body),
        });
      } else {
        const resp = await fetch(`${API}/cadastro`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Erro ao salvar'); }
      }

      setModal(false);
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  function openEtapa2(item: CadastroPeca) {
    setItem2(item);
    setFotoBase64('');
    setModal2(true);
  }

  async function finalizar() {
    if (!item2) return;
    if (!fotoBase64) return alert('Selecione a foto capa antes de finalizar');
    setFinalizando(true);
    try {
      const resp = await fetch(`${API}/cadastro/${item2.id}/finalizar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fotoCapa: fotoBase64 }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || 'Erro ao finalizar');
      alert(`Cadastrado no Bling! ID: ${d.blingProdutoId}`);
      setModal2(false);
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'Erro ao finalizar');
    }
    setFinalizando(false);
  }

  function handleFotoUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoBase64(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
  }

  const motoSelecionada = motos.find((m) => String(m.id) === String(form.motoId));

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Cadastro</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Pré-cadastro e cadastro de peças</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff' }} onClick={openNovo}>+ Novo Pré-cadastro</button>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Filtros */}
        <div style={{ ...s.card, padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ ...s.input, width: 160 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos os status</option>
              <option value="pre_cadastro">Pré-cadastro</option>
              <option value="cadastrado">Cadastrado</option>
            </select>
            <select style={{ ...s.input, width: 200 }} value={filters.motoId} onChange={(e) => setFilters({ ...filters, motoId: e.target.value })}>
              <option value="">Todas as motos</option>
              {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
            </select>
            <input style={{ ...s.input, width: 200 }} placeholder="Buscar ID ou descrição..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            <select style={{ ...s.input, width: 150 }} value={filters.semDimensoes} onChange={(e) => setFilters({ ...filters, semDimensoes: e.target.value })}>
              <option value="">Dimensões</option>
              <option value="true">Sem dimensões</option>
            </select>
            <select style={{ ...s.input, width: 160 }} value={filters.semNumeroPeca} onChange={(e) => setFilters({ ...filters, semNumeroPeca: e.target.value })}>
              <option value="">Nº de peça</option>
              <option value="true">Sem número</option>
            </select>
            <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 12 }} onClick={() => setFilters({ status: '', motoId: '', search: '', semDimensoes: '', semNumeroPeca: '' })}>Limpar</button>
          </div>
        </div>

        {/* Tabela */}
        <div style={s.card}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>{data.total} registro(s)</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Carregando...</div>
          ) : data.data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>Nenhum cadastro encontrado.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['ID Peça', 'Descrição', 'Moto', 'Preço', 'Estoque', 'Pré-Cadastro', 'Cadastro', 'Ações'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((item) => {
                    const preCadOk = true;
                    const cadastOk = item.status === 'cadastrado';
                    return (
                      <tr key={item.id} style={{ background: 'var(--white)' }}>
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-600)', whiteSpace: 'nowrap' }}>{item.idPeca}</td>
                        <td style={{ ...s.td, maxWidth: 240 }}><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</div></td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: 12 }}>{item.moto?.marca} {item.moto?.modelo}</td>
                        <td style={s.td}>R$ {Number(item.precoVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={s.td}>{item.estoque}</td>
                        <td style={s.td}>
                          <button
                            onClick={() => openEditar(item)}
                            style={{ ...s.badge('var(--green)', '#f0fdf4', '#86efac'), cursor: 'pointer', border: '1px solid #86efac' }}
                            title="Editar pré-cadastro"
                          >
                            ✓ OK
                          </button>
                        </td>
                        <td style={s.td}>
                          {cadastOk ? (
                            <span style={s.badge('#2563eb', '#eff6ff', '#bfdbfe')}>✓ OK</span>
                          ) : (
                            <button
                              onClick={() => openEtapa2(item)}
                              style={{ ...s.badge('#dc2626', '#fef2f2', '#fecaca'), cursor: 'pointer' }}
                              title="Finalizar cadastro"
                            >
                              Pendente
                            </button>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}
                              onClick={() => openEditar(item)}
                            >Editar</button>
                            <button
                              style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }}
                              title="Imprimir etiqueta (em breve)"
                              disabled
                            >🏷️ Etiqueta</button>
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

      {/* Modal Pré-Cadastro */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: 24 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)' }}>{editItem ? 'Editar Pré-Cadastro' : 'Novo Pré-Cadastro'}</div>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
              {/* Moto */}
              <div>
                <label style={s.label}>Moto *</label>
                <select
                  style={s.input}
                  value={form.motoId}
                  onChange={async (e) => {
                    setForm((p: any) => ({ ...p, motoId: e.target.value }));
                    if (!editItem) await carregarProximoId(e.target.value);
                  }}
                >
                  <option value="">Selecione a moto</option>
                  {motos.map((m) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo} {m.ano || ''}</option>)}
                </select>
                {motoSelecionada && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Marca: {motoSelecionada.marca}</div>}
              </div>

              {/* ID Peça e Condição */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>ID Peça (SKU) *</label>
                  <input style={s.input} value={form.idPeca} onChange={(e) => setForm((p: any) => ({ ...p, idPeca: e.target.value.toUpperCase() }))} placeholder="Ex: HD04_0023" disabled={!!editItem} />
                </div>
                <div>
                  <label style={s.label}>Condição</label>
                  <select style={s.input} value={form.condicao} onChange={(e) => setForm((p: any) => ({ ...p, condicao: e.target.value }))}>
                    <option value="usado">Usado</option>
                    <option value="novo">Novo</option>
                  </select>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label style={s.label}>Descrição (título do anúncio) * — {form.descricao.length}/60</label>
                <input style={{ ...s.input, borderColor: form.descricao.length >= 55 ? '#fcd34d' : undefined }} value={form.descricao} onChange={(e) => handleDescricaoChange(e.target.value)} placeholder="Título do produto para ML e Nuvemshop" />
                {buscandoCategoria && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Buscando categoria no ML...</div>}
              </div>

              {/* Categoria ML */}
              <div>
                <label style={s.label}>Categoria ML</label>
                {categorias.length > 0 ? (
                  <div>
                    <select style={s.input} value={form.categoriaMLId} onChange={(e) => {
                      const cat = categorias.find((c: any) => (c.category_id || c.id) === e.target.value);
                      setForm((p: any) => ({ ...p, categoriaMLId: e.target.value, categoriaMLNome: cat?.category_name || cat?.name || '' }));
                    }}>
                      <option value="">Selecione uma sugestão</option>
                      {categorias.map((c: any) => (
                        <option key={c.category_id || c.id} value={c.category_id || c.id}>{c.category_name || c.name}</option>
                      ))}
                    </select>
                    {form.categoriaMLId && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>ID: {form.categoriaMLId}</div>}
                  </div>
                ) : (
                  <input style={s.input} value={form.categoriaMLNome || form.categoriaMLId || ''} placeholder="Digite a descrição para sugerir automaticamente" readOnly />
                )}
              </div>

              {/* Preço e Estoque */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>Preço de Venda (R$)</label>
                  <input style={s.input} type="number" min="0" step="0.01" value={form.precoVenda} onChange={(e) => setForm((p: any) => ({ ...p, precoVenda: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label style={s.label}>Estoque</label>
                  <input style={s.input} type="number" min="1" value={form.estoque} onChange={(e) => setForm((p: any) => ({ ...p, estoque: e.target.value }))} />
                </div>
              </div>

              {/* Dimensões */}
              <div>
                <label style={s.label}>Dimensões e Peso</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { key: 'peso', label: 'Peso (kg)' },
                    { key: 'largura', label: 'Largura (cm)' },
                    { key: 'altura', label: 'Altura (cm)' },
                    { key: 'profundidade', label: 'Prof. (cm)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>{label}</div>
                      <input style={s.input} type="number" min="0" step="0.01" value={form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder="0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Localização e Detran */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>Localização (Caixa)</label>
                  <input
                    style={s.input}
                    list="caixas-list"
                    value={form.localizacao}
                    onChange={(e) => setForm((p: any) => ({ ...p, localizacao: e.target.value }))}
                    placeholder="Nome da caixa"
                  />
                  <datalist id="caixas-list">
                    {caixas.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label style={s.label}>Etiqueta Detran</label>
                  <input style={s.input} value={form.detranEtiqueta} onChange={(e) => setForm((p: any) => ({ ...p, detranEtiqueta: e.target.value }))} placeholder="Número da etiqueta" />
                </div>
              </div>

              {/* Número da Peça */}
              <div>
                <label style={s.label}>Número da Peça</label>
                <input style={s.input} value={form.numeroPeca} onChange={(e) => setForm((p: any) => ({ ...p, numeroPeca: e.target.value }))} placeholder="Código do fabricante" />
              </div>

              {/* Descrição da Peça (corpo do anúncio) */}
              <div>
                <label style={s.label}>Descrição da Peça (corpo do anúncio)</label>
                <textarea
                  style={{ ...s.input, minHeight: 160, resize: 'vertical' }}
                  value={form.descricaoPeca}
                  onChange={(e) => setForm((p: any) => ({ ...p, descricaoPeca: e.target.value }))}
                  placeholder="Texto completo do anúncio (puxado automaticamente do texto modelo da moto)"
                />
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ ...s.btn, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }} disabled title="Em breve">🏷️ Imp. Etiqueta</button>
              <button onClick={() => setModal(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Cancelar</button>
              <button onClick={salvar} disabled={saving} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Salvar pré-cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Etapa 2 — Cadastro Final */}
      {modal2 && item2 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)' }}>Finalizar Cadastro</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{item2.idPeca} — {item2.descricao}</div>
              </div>
              <button onClick={() => setModal2(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
              <div>
                <label style={s.label}>Foto Capa *</label>
                <input type="file" accept="image/*" onChange={handleFotoUpload} style={{ fontSize: 13 }} />
                {fotoBase64 && (
                  <img src={fotoBase64} alt="preview" style={{ marginTop: 12, width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
                )}
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.7 }}>
                <div><strong>Conferência antes de finalizar:</strong></div>
                <div>{item2.descricao ? '✓' : '✗'} Descrição: {item2.descricao || 'não preenchida'}</div>
                <div>{item2.precoVenda ? '✓' : '✗'} Preço: R$ {Number(item2.precoVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div>{item2.peso ? '✓' : '⚠'} Peso: {item2.peso ? `${item2.peso} kg` : 'não preenchido'}</div>
                <div>{item2.largura && item2.altura && item2.profundidade ? '✓' : '⚠'} Dimensões: {item2.largura && item2.altura && item2.profundidade ? 'OK' : 'incompletas'}</div>
                <div>{item2.categoriaMLId ? '✓' : '⚠'} Categoria ML: {item2.categoriaMLNome || 'não selecionada'}</div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>Ao finalizar, o produto será criado no Bling com estoque mín/máx = {item2.estoque}.</div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal2(false)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Cancelar</button>
              <button onClick={finalizar} disabled={finalizando || !fotoBase64} style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: (finalizando || !fotoBase64) ? 0.7 : 1 }}>
                {finalizando ? 'Criando no Bling...' : 'Finalizar e criar no Bling'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
