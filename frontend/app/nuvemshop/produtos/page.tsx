'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', width: '100%' },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5, display: 'block' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
  catBadge: { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac' },
  th: { padding: '9px 12px', textAlign: 'left' as const, fontSize: 10.5, fontFamily: 'Geist Mono, monospace', letterSpacing: '.6px', textTransform: 'uppercase' as const, color: 'var(--gray-500)', fontWeight: 500, whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)', borderBottom: '1px solid var(--gray-100)', verticalAlign: 'middle' as const },
};

type Moto = { id: number; marca: string; modelo: string; ano?: number };
type Categoria = { id: number; nome: string; parent_id?: number | null; name?: any };
type Produto = {
  sku: string; titulo: string; moto: { marca: string; modelo: string; ano?: number } | null;
  encontradoNuvemshop: boolean; produtoId: number | null; imagens: number;
  categorias: { id: number; nome: string }[]; tags: string[];
  semCategoria: boolean; semTags: boolean;
};
type Sugestao = { sku: string; categorias: { id: number; nome: string }[]; tags: string[] };

export default function NuvemshopProdutosPage() {
  const [motos, setMotos] = useState<Moto[]>([]);
  const [motoId, setMotoId] = useState('');
  const [skusInput, setSkusInput] = useState('');
  const [modo, setModo] = useState<'moto' | 'skus'>('moto');
  const [buscando, setBuscando] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [editandoSugestao, setEditandoSugestao] = useState<Record<string, Sugestao>>({});
  const [aplicando, setAplicando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalSku, setModalSku] = useState<string | null>(null);

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/nuvemshop/categorias`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setCategorias(d.categorias || []); })
      .catch(() => {});
  }, []);

  async function buscar() {
    setBuscando(true);
    setBuscou(false);
    setSugestoes([]);
    setEditandoSugestao({});
    setSelecionados(new Set());
    try {
      const body: any = {};
      if (modo === 'moto' && motoId) body.motoId = Number(motoId);
      if (modo === 'skus') body.skus = skusInput.split('\n').map(s => s.trim()).filter(Boolean);
      const resp = await fetch(`${API}/nuvemshop/buscar-produtos`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.ok) setProdutos(data.produtos || []);
      else alert(data.error || 'Erro ao buscar');
      setBuscou(true);
    } catch (e: any) { alert(e.message); }
    setBuscando(false);
  }

  async function sugerirIA() {
    // Usa selecionados ou todos sem categoria/tag
    const alvo = produtos.filter(p => p.encontradoNuvemshop && (selecionados.size ? selecionados.has(p.sku) : (p.semCategoria || p.semTags)));
    if (!alvo.length) { alert('Nenhum produto selecionado ou pendente de sugestão.'); return; }
    setSugerindo(true);
    try {
      const resp = await fetch(`${API}/nuvemshop/sugerir-ia`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos: alvo, categorias }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error);
      const map: Record<string, Sugestao> = {};
      (data.sugestoes || []).forEach((s: Sugestao) => { map[s.sku] = s; });
      setSugestoes(data.sugestoes || []);
      setEditandoSugestao(map);
    } catch (e: any) { alert(e.message); }
    setSugerindo(false);
  }

  async function aplicarSugestoes() {
    const aplicacoes = sugestoes
      .filter(s => editandoSugestao[s.sku])
      .map(s => {
        const prod = produtos.find(p => p.sku === s.sku);
        const edit = editandoSugestao[s.sku];
        return { produtoId: prod?.produtoId, categorias: edit.categorias, tags: edit.tags };
      })
      .filter(a => a.produtoId);

    if (!aplicacoes.length) { alert('Nenhuma sugestão para aplicar.'); return; }
    setAplicando(true);
    try {
      const resp = await fetch(`${API}/nuvemshop/aplicar`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aplicacoes }),
      });
      const data = await resp.json();
      const erros = (data.resultados || []).filter((r: any) => !r.ok);
      if (erros.length) alert(`${erros.length} produto(s) com erro ao aplicar.`);
      else alert(`✓ ${aplicacoes.length} produto(s) atualizados na Nuvemshop!`);
      setSugestoes([]);
      setEditandoSugestao({});
      await buscar();
    } catch (e: any) { alert(e.message); }
    setAplicando(false);
  }

  function toggleSel(sku: string) {
    setSelecionados(prev => {
      const n = new Set(prev);
      n.has(sku) ? n.delete(sku) : n.add(sku);
      return n;
    });
  }

  const semDados = produtos.filter(p => p.encontradoNuvemshop && (p.semCategoria || p.semTags));
  const arvore = categorias.filter(c => !c.parent_id);
  const filhos = categorias.filter(c => c.parent_id);
  function nomeCategoria(id: number) {
    const c = categorias.find(x => x.id === id);
    return c ? (c.name?.pt || c.name?.['pt-BR'] || Object.values(c.name || {})[0] || String(id)) : String(id);
  }

  // Modal de edição de sugestão
  const modalProd = modalSku ? produtos.find(p => p.sku === modalSku) : null;
  const modalSugestao = modalSku ? editandoSugestao[modalSku] : null;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Produtos Nuvemshop</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Diagnóstico e enriquecimento com IA de categorias e tags</div>
        </div>
        {sugestoes.length > 0 && (
          <button style={{ ...s.btn, background: '#16a34a', color: '#fff' }} onClick={aplicarSugestoes} disabled={aplicando}>
            {aplicando ? 'Aplicando...' : `✓ Aplicar ${sugestoes.length} sugestão(ões) na Nuvemshop`}
          </button>
        )}
      </div>

      <div style={{ padding: 28 }}>
        {/* Filtros */}
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>Buscar produtos</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['moto', 'skus'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)}
                style={{ ...s.btn, padding: '6px 14px', background: modo === m ? 'var(--gray-800)' : 'var(--white)', color: modo === m ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)' }}>
                {m === 'moto' ? '🏍️ Por Moto' : '📋 Por Lista de SKUs'}
              </button>
            ))}
          </div>

          {modo === 'moto' ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Moto (somente com estoque)</label>
                <select style={s.input} value={motoId} onChange={e => setMotoId(e.target.value)}>
                  <option value="">Selecione a moto...</option>
                  {motos.map(m => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo} {m.ano || ''}</option>)}
                </select>
              </div>
              <button style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: buscando ? 0.7 : 1 }} onClick={buscar} disabled={buscando || !motoId}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          ) : (
            <div>
              <label style={s.label}>SKUs (um por linha)</label>
              <textarea style={{ ...s.input, minHeight: 100, resize: 'vertical' }} value={skusInput}
                onChange={e => setSkusInput(e.target.value)} placeholder={'HD01_0074\nHD01_0075\nBM01_0012'} />
              <button style={{ ...s.btn, background: '#7c3aed', color: '#fff', marginTop: 10, opacity: buscando ? 0.7 : 1 }} onClick={buscar} disabled={buscando || !skusInput.trim()}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          )}
        </div>

        {/* Resultados */}
        {buscou && (
          <>
            {/* Sumário */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Encontrados', value: produtos.filter(p => p.encontradoNuvemshop).length, color: 'var(--gray-800)' },
                { label: 'Não encontrados', value: produtos.filter(p => !p.encontradoNuvemshop).length, color: 'var(--amber)' },
                { label: 'Sem categoria', value: produtos.filter(p => p.semCategoria).length, color: 'var(--red)' },
                { label: 'Sem tags', value: produtos.filter(p => p.semTags).length, color: '#7c3aed' },
              ].map(card => (
                <div key={card.label} style={{ ...s.card, marginBottom: 0, padding: 16 }}>
                  <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Botão sugerir IA */}
            {semDados.length > 0 && (
              <div style={{ ...s.card, background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#5b21b6' }}>
                    ✨ {selecionados.size ? selecionados.size : semDados.length} produto(s) pendentes de categoria/tag
                  </div>
                  <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 2 }}>
                    A IA vai analisar o título e sugerir categorias e tags baseadas na sua estrutura atual da Nuvemshop
                  </div>
                </div>
                <button style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: sugerindo ? 0.7 : 1 }} onClick={sugerirIA} disabled={sugerindo}>
                  {sugerindo ? '✨ Analisando...' : '✨ Sugerir com IA'}
                </button>
              </div>
            )}

            {/* Tabela */}
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)' }}>
                    <tr>
                      <th style={{ ...s.th, width: 36 }}>
                        <input type="checkbox" onChange={e => {
                          if (e.target.checked) setSelecionados(new Set(produtos.filter(p => p.encontradoNuvemshop).map(p => p.sku)));
                          else setSelecionados(new Set());
                        }} />
                      </th>
                      {['SKU', 'Título', 'Moto', 'Imagens', 'Categorias', 'Tags', 'Status', ''].map(h => <th key={h} style={s.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map(p => {
                      const sug = editandoSugestao[p.sku];
                      const temSugestao = !!sug;
                      const rowBg = !p.encontradoNuvemshop ? '#fffbeb' : temSugestao ? '#f5f3ff' : 'var(--white)';
                      return (
                        <tr key={p.sku} style={{ background: rowBg }}>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {p.encontradoNuvemshop && (
                              <input type="checkbox" checked={selecionados.has(p.sku)} onChange={() => toggleSel(p.sku)} />
                            )}
                          </td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--blue-500)', fontWeight: 600 }}>{p.sku}</td>
                          <td style={{ ...s.td, maxWidth: 260 }}><div style={{ fontSize: 12, lineHeight: 1.4 }}>{p.titulo}</div></td>
                          <td style={{ ...s.td, fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                            {p.moto ? `${p.moto.marca} ${p.moto.modelo}` : '-'}
                          </td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {p.encontradoNuvemshop ? (
                              <span style={{ fontSize: 12, fontWeight: 600, color: p.imagens > 0 ? 'var(--green)' : 'var(--red)' }}>
                                {p.imagens > 0 ? `📷 ${p.imagens}` : '0'}
                              </span>
                            ) : '-'}
                          </td>
                          <td style={s.td}>
                            {temSugestao ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {sug.categorias.map(c => <span key={c.id} style={{ ...s.catBadge, background: '#f0fdf4', color: '#16a34a' }}>✨ {c.nome}</span>)}
                              </div>
                            ) : p.categorias.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {p.categorias.map(c => <span key={c.id} style={s.catBadge}>{c.nome}</span>)}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--red)' }}>Sem categoria</span>
                            )}
                          </td>
                          <td style={s.td}>
                            {temSugestao ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {sug.tags.slice(0, 5).map(t => <span key={t} style={{ ...s.tag, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #c4b5fd' }}>✨ {t}</span>)}
                                {sug.tags.length > 5 && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>+{sug.tags.length - 5}</span>}
                              </div>
                            ) : p.tags.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {p.tags.slice(0, 4).map(t => <span key={t} style={s.tag}>{t}</span>)}
                                {p.tags.length > 4 && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>+{p.tags.length - 4}</span>}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#7c3aed' }}>Sem tags</span>
                            )}
                          </td>
                          <td style={s.td}>
                            {!p.encontradoNuvemshop ? (
                              <span style={{ fontSize: 11, background: '#fffbeb', color: 'var(--amber)', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>Não encontrado</span>
                            ) : temSugestao ? (
                              <span style={{ fontSize: 11, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #c4b5fd', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>✨ Com sugestão</span>
                            ) : p.semCategoria || p.semTags ? (
                              <span style={{ fontSize: 11, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>Pendente</span>
                            ) : (
                              <span style={{ fontSize: 11, background: '#f0fdf4', color: 'var(--green)', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>✓ OK</span>
                            )}
                          </td>
                          <td style={{ ...s.td, width: 80 }}>
                            {temSugestao && (
                              <button onClick={() => setModalSku(p.sku)}
                                style={{ ...s.btn, padding: '4px 10px', fontSize: 11, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #c4b5fd' }}>
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {produtos.length === 0 && (
                      <tr><td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Nenhum produto encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal edição sugestão */}
      {modalSku && modalProd && modalSugestao && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Editar sugestão — {modalSku}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{modalProd.titulo}</div>
              </div>
              <button onClick={() => setModalSku(null)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '16px 22px' }}>
              {/* Categorias */}
              <div style={{ marginBottom: 20 }}>
                <label style={s.label}>Categorias selecionadas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {modalSugestao.categorias.map(c => (
                    <span key={c.id} style={{ ...s.catBadge, cursor: 'pointer' }} onClick={() => {
                      setEditandoSugestao(prev => ({ ...prev, [modalSku]: { ...prev[modalSku], categorias: prev[modalSku].categorias.filter(x => x.id !== c.id) } }));
                    }}>
                      {c.nome} ×
                    </span>
                  ))}
                </div>
                <label style={{ ...s.label, marginTop: 8 }}>Adicionar categoria</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {categorias.map(c => {
                    const nome = c.name?.pt || c.name?.['pt-BR'] || Object.values(c.name || {})[0] || String(c.id);
                    const isParent = !c.parent_id;
                    const already = modalSugestao.categorias.some(x => x.id === c.id);
                    return (
                      <div key={c.id} onClick={() => {
                        if (already) return;
                        setEditandoSugestao(prev => ({ ...prev, [modalSku]: { ...prev[modalSku], categorias: [...prev[modalSku].categorias, { id: c.id, nome }] } }));
                      }} style={{ padding: '5px 8px', borderRadius: 6, cursor: already ? 'not-allowed' : 'pointer', background: already ? 'var(--gray-100)' : 'var(--white)', border: '1px solid var(--border)', fontSize: 12, fontWeight: isParent ? 700 : 400, color: already ? 'var(--gray-400)' : 'var(--gray-800)', paddingLeft: isParent ? 8 : 16 }}>
                        {isParent ? '' : '↳ '}{nome}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label style={s.label}>Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {modalSugestao.tags.map(t => (
                    <span key={t} style={{ ...s.tag, cursor: 'pointer' }} onClick={() => {
                      setEditandoSugestao(prev => ({ ...prev, [modalSku]: { ...prev[modalSku], tags: prev[modalSku].tags.filter(x => x !== t) } }));
                    }}>
                      {t} ×
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="nova-tag-input" style={{ ...s.input, flex: 1 }} placeholder="Adicionar tag..." onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !modalSugestao.tags.includes(val)) {
                        setEditandoSugestao(prev => ({ ...prev, [modalSku]: { ...prev[modalSku], tags: [...prev[modalSku].tags, val] } }));
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModalSku(null)} style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
