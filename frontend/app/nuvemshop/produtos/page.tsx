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
type FotoQueueItem = {
  file: File;
  preview: string;
  base64: string;
  status: 'aguardando'|'enviando'|'ok'|'erro';
  erro?: string;
};
type FotoPendente = { foto: FotoQueueItem; idx: number };

const MAX_UPLOAD_BATCH_BYTES = 18 * 1024 * 1024;

function montarPayloadFotos(produtoId: number | null, itens: FotoPendente[]) {
  return {
    produtoId,
    imagens: itens.map(({ foto, idx }) => ({
      queueIndex: idx,
      filename: foto.file.name,
      base64: foto.base64,
    })),
  };
}

function estimarPayloadFotosBytes(produtoId: number | null, itens: FotoPendente[]) {
  return new TextEncoder().encode(JSON.stringify(montarPayloadFotos(produtoId, itens))).length;
}

function dividirLotesPorTamanho(produtoId: number | null, itens: FotoPendente[]) {
  const lotes: FotoPendente[][] = [];
  let loteAtual: FotoPendente[] = [];

  for (const item of itens) {
    const loteTeste = [...loteAtual, item];
    const tamanhoTeste = estimarPayloadFotosBytes(produtoId, loteTeste);

    if (loteAtual.length > 0 && tamanhoTeste > MAX_UPLOAD_BATCH_BYTES) {
      lotes.push(loteAtual);
      loteAtual = [item];
      continue;
    }

    loteAtual = loteTeste;
  }

  if (loteAtual.length > 0) {
    lotes.push(loteAtual);
  }

  return lotes;
}

async function lerRespostaApi<T = any>(resp: Response): Promise<T> {
  const text = await resp.text();

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!resp.ok) {
    throw new Error(data?.error || text || `Erro ${resp.status}`);
  }

  if (!data) {
    throw new Error(text || 'Resposta invalida da API');
  }

  if (data.ok === false) {
    throw new Error(data.error || 'Erro na API');
  }

  return data as T;
}

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
  const [sugerindoLabel, setSugerindoLabel] = useState('');
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [editandoSugestao, setEditandoSugestao] = useState<Record<string, Sugestao>>({});
  const [aplicando, setAplicando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalSku, setModalSku] = useState<string | null>(null);
  const [modalFoto, setModalFoto] = useState<Produto | null>(null);
  const [fotosQueue, setFotosQueue] = useState<FotoQueueItem[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/nuvemshop/categorias`, { credentials: 'include' })
      .then(lerRespostaApi)
      .then((d: any) => { if (d.ok) setCategorias(d.categorias || []); })
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
      const data = await lerRespostaApi(resp);
      if (data.ok) setProdutos(data.produtos || []);
      else alert(data.error || 'Erro ao buscar');
      setBuscou(true);
    } catch (e: any) { alert(e.message); }
    setBuscando(false);
  }

  async function sugerirIA() {
    const alvo = produtos.filter(p => p.encontradoNuvemshop && (selecionados.size ? selecionados.has(p.sku) : (p.semCategoria || p.semTags)));
    if (!alvo.length) { alert('Nenhum produto selecionado ou pendente de sugestão.'); return; }
    setSugerindo(true);
    setSugestoes([]);
    setEditandoSugestao({});

    // Divide em lotes de 10 para não estourar o limite de tokens
    const LOTE = 10;
    const lotes: typeof alvo[] = [];
    for (let i = 0; i < alvo.length; i += LOTE) lotes.push(alvo.slice(i, i + LOTE));

    const todasSugestoes: Sugestao[] = [];
    const map: Record<string, Sugestao> = {};
    let erros = 0;

    for (let i = 0; i < lotes.length; i++) {
      setSugerindoLabel(`✨ Analisando lote ${i + 1} de ${lotes.length}...`);
      try {
        const resp = await fetch(`${API}/nuvemshop/sugerir-ia`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produtos: lotes[i].map((p: any) => ({ sku: p.sku, titulo: p.titulo, moto: p.moto })),
            categorias: categorias.map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parent_id })),
          }),
        });
        const data = await lerRespostaApi(resp);
        (data.sugestoes || []).forEach((s: Sugestao) => {
          todasSugestoes.push(s);
          map[s.sku] = s;
        });
        // Atualiza progressivamente
        setSugestoes([...todasSugestoes]);
        setEditandoSugestao({ ...map });
      } catch (e: any) {
        erros++;
        console.error(`Erro no lote ${i + 1}:`, e.message);
      }
    }

    if (erros > 0 && todasSugestoes.length === 0) {
      alert(`Erro ao chamar IA em todos os lotes.`);
    } else if (erros > 0) {
      alert(`⚠️ ${erros} lote(s) falharam, mas ${todasSugestoes.length} produto(s) foram processados.`);
    }
    setSugerindoLabel('');
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
      const data = await lerRespostaApi(resp);
      const erros = (data.resultados || []).filter((r: any) => !r.ok);
      if (erros.length) alert(`${erros.length} produto(s) com erro:\n${data.errosDetalhados || erros.map((e: any) => `Produto ${e.produtoId}: ${e.error}`).join('\n')}`);
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
  const modalFotoAtual = modalFoto ? (produtos.find(p => p.sku === modalFoto.sku) || modalFoto) : null;

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
                  {sugerindo ? (sugerindoLabel || '✨ Analisando...') : '✨ Sugerir com IA'}
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
                              <button onClick={() => { setModalFoto(p); setFotosQueue([]); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: p.imagens > 0 ? 'var(--green)' : 'var(--red)', textDecoration: 'underline dotted' }}>
                              📷 {p.imagens}
                            </span>
                          </button>
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
      {/* MODAL UPLOAD FOTOS */}
      {modalFotoAtual && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.15)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>📷 Fotos — {modalFotoAtual.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                  {modalFotoAtual.titulo} · {modalFotoAtual.imagens} foto(s) já cadastrada(s)
                </div>
              </div>
              <button onClick={() => { setModalFoto(null); setFotosQueue([]); }}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            {/* Drop zone */}
            <div style={{ padding: '16px 22px', flexShrink: 0 }}>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 10, padding: 24, cursor: 'pointer', background: '#fafafa', gap: 8 }}>
                <div style={{ fontSize: 32 }}>📁</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>Clique para selecionar fotos</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>JPG, PNG, WEBP · Várias de uma vez</div>
                <input type="file" multiple accept="image/*" style={{ display: 'none' }}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    const novas = await Promise.all(files.map(file => new Promise<any>(resolve => {
                      const reader = new FileReader();
                      reader.onload = (ev) => resolve({
                        file,
                        preview: ev.target?.result as string,
                        base64: (ev.target?.result as string).split(',')[1],
                        status: 'aguardando',
                      });
                      reader.readAsDataURL(file);
                    })));
                    setFotosQueue(prev => [...prev, ...novas]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* Preview grid */}
            {fotosQueue.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>
                  {fotosQueue.length} foto(s) na fila · serão adicionadas a partir da posição {modalFotoAtual.imagens + 1}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {fotosQueue.map((foto, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `2px solid ${foto.status === 'ok' ? '#86efac' : foto.status === 'erro' ? '#fca5a5' : foto.status === 'enviando' ? '#93c5fd' : 'var(--border)'}` }}>
                      <img src={foto.preview} alt={foto.file.name} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                      {/* Status overlay */}
                      {foto.status !== 'aguardando' && (
                        <div style={{ position: 'absolute', inset: 0, background: foto.status === 'enviando' ? 'rgba(37,99,235,.4)' : foto.status === 'ok' ? 'rgba(22,163,74,.4)' : 'rgba(220,38,38,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                          {foto.status === 'enviando' ? '⏳' : foto.status === 'ok' ? '✓' : '✗'}
                        </div>
                      )}
                      {/* Remove button (só quando aguardando) */}
                      {foto.status === 'aguardando' && (
                        <button onClick={() => setFotosQueue(prev => prev.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ×
                        </button>
                      )}
                      <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--gray-600)', background: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {foto.status === 'erro' ? `✗ ${foto.erro}` : foto.file.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                {fotosQueue.filter(f => f.status === 'ok').length > 0 && `✓ ${fotosQueue.filter(f => f.status === 'ok').length} enviada(s)`}
                {fotosQueue.filter(f => f.status === 'erro').length > 0 && ` · ✗ ${fotosQueue.filter(f => f.status === 'erro').length} com erro`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setModalFoto(null); setFotosQueue([]); }}
                  style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }}>
                  Fechar
                </button>
                <button
                  disabled={enviandoFotos || fotosQueue.filter(f => f.status === 'aguardando').length === 0}
                  onClick={async () => {
                    const pendentes = fotosQueue.filter(f => f.status === 'aguardando');
                    if (!pendentes.length) return;
                    setEnviandoFotos(true);

                    const pendentesComIndice = fotosQueue
                      .map((foto, idx) => ({ foto, idx }))
                      .filter(item => item.foto.status === 'aguardando');
                    const lotes = dividirLotesPorTamanho(modalFotoAtual.produtoId, pendentesComIndice);

                    setFotosQueue(prev => prev.map((f, idx) => (
                      pendentesComIndice.some(item => item.idx === idx)
                        ? { ...f, status: 'enviando', erro: undefined }
                        : f
                    )));

                    try {
                      for (const lote of lotes) {
                        const resp = await fetch(`${API}/nuvemshop/upload-imagens`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(montarPayloadFotos(modalFotoAtual.produtoId, lote)),
                        });
                        const data = await lerRespostaApi(resp);

                        const resultados = new Map<number, any>();
                        (data.resultados || []).forEach((r: any, ordem: number) => {
                          const idx = typeof r?.queueIndex === 'number'
                            ? r.queueIndex
                            : lote[ordem]?.idx;
                          if (typeof idx === 'number') {
                            resultados.set(idx, r);
                          }
                        });

                        setFotosQueue(prev => prev.map((f, idx) => {
                          if (!lote.some(item => item.idx === idx)) return f;
                          const resultado = resultados.get(idx);
                          if (!resultado) {
                            return { ...f, status: 'erro', erro: 'Sem retorno para esta foto' };
                          }
                          return {
                            ...f,
                            status: resultado.ok ? 'ok' : 'erro',
                            erro: resultado.ok ? undefined : (resultado.error || 'Falha no envio'),
                          };
                        }));

                        const enviadasComSucesso = (data.resultados || []).filter((r: any) => r.ok).length;
                        if (enviadasComSucesso) {
                          setProdutos(prev => prev.map(p => (
                            p.sku === modalFotoAtual.sku
                              ? { ...p, imagens: p.imagens + enviadasComSucesso }
                              : p
                          )));
                        }
                      }
                    } catch (e: any) {
                      setFotosQueue(prev => prev.map((f, idx) => (
                        pendentesComIndice.some(item => item.idx === idx) && f.status === 'enviando'
                          ? { ...f, status: 'erro', erro: e.message }
                          : f
                      )));
                    } finally {
                      setEnviandoFotos(false);
                    }
                  }}
                  style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (enviandoFotos || fotosQueue.filter(f => f.status === 'aguardando').length === 0) ? 0.6 : 1 }}>
                  {enviandoFotos ? '⏳ Enviando...' : `Enviar ${fotosQueue.filter(f => f.status === 'aguardando').length} foto(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
