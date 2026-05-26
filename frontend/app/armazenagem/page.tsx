'use client';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', display: 'block', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.04em' },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 12 },
};

type Detalhe = { id: number; nome: string; posicaoId: number; totalCaixas: number; caixas: string[] };
type Posicao = { id: number; nome: string; areaId: number; totalCaixas: number; detalhes: Detalhe[] };
type Area = { id: number; nome: string; descricao: string | null; totalCaixas: number; posicoes: Posicao[] };

type Caixa = {
  localizacao: string;
  alocada: boolean;
  detailId: number | null;
  detailNome: string | null;
  posicaoNome: string | null;
  areaNome: string | null;
  enderecoCompleto: string | null;
};

type Historico = { id: number; changedAt: string; changedBy: string | null; observacao: string | null; de: string | null; para: string };

type SelectedNode =
  | { tipo: 'area'; id: number }
  | { tipo: 'posicao'; id: number }
  | { tipo: 'detalhe'; id: number };

export default function ArmazenagemPage() {
  const [estrutura, setEstrutura] = useState<Area[]>([]);
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // Expansão da árvore
  const [expandedAreas, setExpandedAreas] = useState<Set<number>>(new Set());
  const [expandedPosicoes, setExpandedPosicoes] = useState<Set<number>>(new Set());

  // Modal criar/editar
  const [modalCriar, setModalCriar] = useState<{ tipo: 'area' | 'posicao' | 'detalhe'; parentId?: number; editando?: { id: number; nome: string; descricao?: string } } | null>(null);
  const [modalNome, setModalNome] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Modal alocar caixa
  const [modalAlocar, setModalAlocar] = useState<{ detailId: number; detailLabel: string } | null>(null);
  const [buscaCaixa, setBuscaCaixa] = useState('');
  const [alocando, setAlocando] = useState<string | null>(null);

  // Modal histórico
  const [modalHistorico, setModalHistorico] = useState<{ localizacao: string } | null>(null);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([
        fetch(`${API}/armazenagem/estrutura`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/armazenagem/caixas`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setEstrutura(Array.isArray(e) ? e : []);
      setCaixas(Array.isArray(c) ? c : []);
    } catch { }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (modalCriar) {
      setModalNome(modalCriar.editando?.nome || '');
      setModalDesc(modalCriar.editando?.descricao || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modalCriar]);

  // ── Helpers de navegação na árvore ─────────────────────────────────────────

  function getArea(id: number) { return estrutura.find(a => a.id === id); }
  function getPosicao(id: number) { return estrutura.flatMap(a => a.posicoes).find(p => p.id === id); }
  function getDetalhe(id: number) { return estrutura.flatMap(a => a.posicoes).flatMap(p => p.detalhes).find(d => d.id === id); }

  function selectedArea(): Area | undefined {
    if (!selected) return;
    if (selected.tipo === 'area') return getArea(selected.id);
    if (selected.tipo === 'posicao') { const p = getPosicao(selected.id); return p ? getArea(p.areaId) : undefined; }
    if (selected.tipo === 'detalhe') { const d = getDetalhe(selected.id); if (!d) return; const p = getPosicao(d.posicaoId); return p ? getArea(p.areaId) : undefined; }
  }
  function selectedPosicao(): Posicao | undefined {
    if (!selected) return;
    if (selected.tipo === 'posicao') return getPosicao(selected.id);
    if (selected.tipo === 'detalhe') { const d = getDetalhe(selected.id); return d ? getPosicao(d.posicaoId) : undefined; }
  }
  function selectedDetalhe(): Detalhe | undefined {
    if (selected?.tipo === 'detalhe') return getDetalhe(selected.id);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function salvarModal() {
    if (!modalCriar || !modalNome.trim()) return;
    setSalvando(true);
    try {
      const { tipo, parentId, editando } = modalCriar;
      if (editando) {
        const url = tipo === 'area' ? `/armazenagem/areas/${editando.id}` : tipo === 'posicao' ? `/armazenagem/posicoes/${editando.id}` : `/armazenagem/detalhes/${editando.id}`;
        await fetch(`${API}${url}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: modalNome.trim(), descricao: modalDesc.trim() || null }) });
      } else {
        const url = tipo === 'area' ? '/armazenagem/areas' : tipo === 'posicao' ? '/armazenagem/posicoes' : '/armazenagem/detalhes';
        const body = tipo === 'area' ? { nome: modalNome.trim(), descricao: modalDesc.trim() || null } : tipo === 'posicao' ? { areaId: parentId, nome: modalNome.trim() } : { posicaoId: parentId, nome: modalNome.trim() };
        await fetch(`${API}${url}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setModalCriar(null);
      await carregar();
    } catch (e: any) { alert(`Erro: ${e.message}`); }
    setSalvando(false);
  }

  async function excluir(tipo: 'area' | 'posicao' | 'detalhe', id: number, nome: string) {
    if (!confirm(`Excluir "${nome}"? Isso só funciona se não houver caixas alocadas.`)) return;
    try {
      const url = tipo === 'area' ? `/armazenagem/areas/${id}` : tipo === 'posicao' ? `/armazenagem/posicoes/${id}` : `/armazenagem/detalhes/${id}`;
      const r = await fetch(`${API}${url}`, { method: 'DELETE', credentials: 'include' });
      const data = await r.json();
      if (!data.ok) { alert(data.error || 'Erro ao excluir'); return; }
      if (selected?.id === id) setSelected(null);
      await carregar();
    } catch (e: any) { alert(`Erro: ${e.message}`); }
  }

  // ── ALOCAÇÃO ───────────────────────────────────────────────────────────────

  async function alocarCaixa(localizacao: string, detailId: number) {
    setAlocando(localizacao);
    try {
      const r = await fetch(`${API}/armazenagem/alocar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localizacao, detailId }) });
      const data = await r.json();
      if (!data.ok) { alert(data.error || 'Erro ao alocar'); return; }
      await carregar();
    } catch (e: any) { alert(`Erro: ${e.message}`); }
    setAlocando(null);
  }

  async function removerAlocacao(localizacao: string) {
    if (!confirm(`Remover alocação de "${localizacao}"?`)) return;
    try {
      const r = await fetch(`${API}/armazenagem/alocar/${encodeURIComponent(localizacao)}`, { method: 'DELETE', credentials: 'include' });
      const data = await r.json();
      if (!data.ok) { alert(data.error || 'Erro ao remover'); return; }
      await carregar();
    } catch (e: any) { alert(`Erro: ${e.message}`); }
  }

  async function abrirHistorico(localizacao: string) {
    setModalHistorico({ localizacao });
    setHistorico([]);
    setLoadingHistorico(true);
    try {
      const r = await fetch(`${API}/armazenagem/historico/${encodeURIComponent(localizacao)}`, { credentials: 'include' });
      const data = await r.json();
      setHistorico(Array.isArray(data) ? data : []);
    } catch { }
    setLoadingHistorico(false);
  }

  // ── PAINEL DIREITO ─────────────────────────────────────────────────────────

  const det = selectedDetalhe();
  const pos = selectedPosicao();
  const area = selectedArea();

  const caixasNoDetalhe = det ? caixas.filter(c => c.detailId === det.id) : [];
  const caixasNaoAlocadas = caixas.filter(c => !c.alocada);
  const caixasFiltradas = modalAlocar
    ? caixas.filter(c => !c.alocada && (!buscaCaixa.trim() || c.localizacao.toLowerCase().includes(buscaCaixa.toLowerCase())))
    : [];

  const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Topbar */}
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Armazenagem</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Gestao de localizacao fisica das caixas (WM)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setModalCriar({ tipo: 'area' })} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff' }}>
            + Espaco
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>

        {/* ── PAINEL ESQUERDO — Árvore ─────────────────────────────────────── */}
        <div style={{ width: 320, borderRight: '1px solid var(--border)', overflowY: 'auto', background: '#f8fafc', flexShrink: 0 }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
          ) : estrutura.length === 0 ? (
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>Nenhum espaco criado ainda.</div>
              <button onClick={() => setModalCriar({ tipo: 'area' })} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', fontSize: 12 }}>
                + Criar primeiro espaco
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px 8px' }}>
              {estrutura.map(area => {
                const areaExpanded = expandedAreas.has(area.id);
                const isAreaSel = selected?.tipo === 'area' && selected.id === area.id;
                return (
                  <div key={area.id}>
                    {/* Área */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', background: isAreaSel ? '#dbeafe' : 'transparent', marginBottom: 2 }}
                      onClick={() => { setSelected({ tipo: 'area', id: area.id }); setExpandedAreas(prev => { const s = new Set(prev); s.has(area.id) ? s.delete(area.id) : s.add(area.id); return s; }); }}
                    >
                      <span style={{ fontSize: 12, color: 'var(--gray-400)', width: 14 }}>{areaExpanded ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isAreaSel ? '#1d4ed8' : 'var(--gray-800)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📦 {area.nome}
                      </span>
                      {area.totalCaixas > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', borderRadius: 99, padding: '1px 7px' }}>{area.totalCaixas}</span>
                      )}
                    </div>

                    {/* Posições */}
                    {areaExpanded && area.posicoes.map(pos => {
                      const posExpanded = expandedPosicoes.has(pos.id);
                      const isPosSel = selected?.tipo === 'posicao' && selected.id === pos.id;
                      return (
                        <div key={pos.id} style={{ marginLeft: 18 }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: isPosSel ? '#dbeafe' : 'transparent', marginBottom: 2 }}
                            onClick={() => { setSelected({ tipo: 'posicao', id: pos.id }); setExpandedPosicoes(prev => { const s = new Set(prev); s.has(pos.id) ? s.delete(pos.id) : s.add(pos.id); return s; }); }}
                          >
                            <span style={{ fontSize: 11, color: 'var(--gray-400)', width: 14 }}>{posExpanded ? '▾' : '▸'}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: isPosSel ? '#1d4ed8' : 'var(--gray-700)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              🗄️ {pos.nome}
                            </span>
                            {pos.totalCaixas > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', borderRadius: 99, padding: '1px 6px' }}>{pos.totalCaixas}</span>
                            )}
                          </div>

                          {/* Detalhes */}
                          {posExpanded && pos.detalhes.map(det => {
                            const isDetSel = selected?.tipo === 'detalhe' && selected.id === det.id;
                            return (
                              <div key={det.id} style={{ marginLeft: 18 }}>
                                <div
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 8, cursor: 'pointer', background: isDetSel ? '#dbeafe' : 'transparent', marginBottom: 2 }}
                                  onClick={() => setSelected({ tipo: 'detalhe', id: det.id })}
                                >
                                  <span style={{ fontSize: 12, color: isDetSel ? '#1d4ed8' : 'var(--gray-500)', flex: 1 }}>• {det.nome}</span>
                                  {det.totalCaixas > 0 && (
                                    <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 99, padding: '1px 6px' }}>{det.totalCaixas}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── PAINEL DIREITO — Contexto ─────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {!selected && (
            <div style={{ color: 'var(--gray-400)', fontSize: 13, marginTop: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏭</div>
              <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>Selecione um item na arvore</div>
              <div>Clique em um espaco, posicao ou detalhe para ver detalhes e gerenciar caixas.</div>
            </div>
          )}

          {/* ── DETALHE selecionado ── */}
          {det && selected?.tipo === 'detalhe' && (() => {
            const posicao = getPosicao(det.posicaoId);
            const areaObj = posicao ? getArea(posicao.areaId) : undefined;
            return (
              <>
                {/* Breadcrumb */}
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>
                  {areaObj?.nome} › {posicao?.nome} › <strong style={{ color: 'var(--gray-700)' }}>{det.nome}</strong>
                </div>

                {/* Header do detalhe */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-800)' }}>{det.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3 }}>{caixasNoDetalhe.length} caixa(s) alocada(s)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setModalCriar({ tipo: 'detalhe', parentId: det.posicaoId, editando: { id: det.id, nome: det.nome } })} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', fontSize: 12 }}>Renomear</button>
                    <button onClick={() => excluir('detalhe', det.id, det.nome)} style={{ ...s.btn, background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12 }}>Excluir</button>
                    <button onClick={() => { setModalAlocar({ detailId: det.id, detailLabel: `${posicao?.nome} › ${det.nome}` }); setBuscaCaixa(''); }} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', fontSize: 12 }}>+ Alocar caixa</button>
                  </div>
                </div>

                {/* Lista de caixas */}
                {caixasNoDetalhe.length === 0 ? (
                  <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                    Nenhuma caixa alocada aqui ainda.
                    <br />
                    <button onClick={() => { setModalAlocar({ detailId: det.id, detailLabel: `${posicao?.nome} › ${det.nome}` }); setBuscaCaixa(''); }} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', fontSize: 12, marginTop: 12 }}>+ Alocar caixa</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {caixasNoDetalhe.map(cx => (
                      <div key={cx.localizacao} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>{cx.localizacao}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => abrirHistorico(cx.localizacao)} style={{ ...s.btn, background: '#f1f5f9', color: 'var(--gray-600)', border: '1px solid var(--border)', fontSize: 11, padding: '5px 10px' }}>Historico</button>
                          <button onClick={() => removerAlocacao(cx.localizacao)} style={{ ...s.btn, background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', fontSize: 11, padding: '5px 10px' }}>Remover</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* ── POSIÇÃO selecionada ── */}
          {pos && selected?.tipo === 'posicao' && (() => {
            const areaObj = getArea(pos.areaId);
            return (
              <>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>{areaObj?.nome} › <strong style={{ color: 'var(--gray-700)' }}>{pos.nome}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-800)' }}>🗄️ {pos.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3 }}>{pos.detalhes.length} detalhe(s) · {pos.totalCaixas} caixa(s)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setModalCriar({ tipo: 'posicao', parentId: pos.areaId, editando: { id: pos.id, nome: pos.nome } })} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', fontSize: 12 }}>Renomear</button>
                    <button onClick={() => excluir('posicao', pos.id, pos.nome)} style={{ ...s.btn, background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12 }}>Excluir</button>
                    <button onClick={() => setModalCriar({ tipo: 'detalhe', parentId: pos.id })} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', fontSize: 12 }}>+ Detalhe</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pos.detalhes.length === 0 ? (
                    <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                      Nenhum detalhe criado. Adicione niveis como N0, N1, Solto, Chao...
                    </div>
                  ) : pos.detalhes.map(d => (
                    <div key={d.id} onClick={() => setSelected({ tipo: 'detalhe', id: d.id })} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>• {d.nome}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, background: d.totalCaixas > 0 ? '#dcfce7' : '#f1f5f9', color: d.totalCaixas > 0 ? '#15803d' : 'var(--gray-400)', borderRadius: 99, padding: '2px 10px' }}>
                        {d.totalCaixas} caixa{d.totalCaixas !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* ── ÁREA selecionada ── */}
          {area && selected?.tipo === 'area' && (() => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-800)' }}>📦 {area.nome}</div>
                  {area.descricao && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{area.descricao}</div>}
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{area.posicoes.length} posicao(oes) · {area.totalCaixas} caixa(s)</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setModalCriar({ tipo: 'area', editando: { id: area.id, nome: area.nome, descricao: area.descricao || '' } })} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', fontSize: 12 }}>Renomear</button>
                  <button onClick={() => excluir('area', area.id, area.nome)} style={{ ...s.btn, background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12 }}>Excluir</button>
                  <button onClick={() => setModalCriar({ tipo: 'posicao', parentId: area.id })} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', fontSize: 12 }}>+ Posicao</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {area.posicoes.length === 0 ? (
                  <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                    Nenhuma posicao criada. Adicione Rack 1, Prateleira 1, Mezanino...
                  </div>
                ) : area.posicoes.map(p => (
                  <div key={p.id} onClick={() => { setSelected({ tipo: 'posicao', id: p.id }); setExpandedPosicoes(prev => { const s = new Set(prev); s.add(p.id); return s; }); }} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>🗄️ {p.nome}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: p.totalCaixas > 0 ? '#dbeafe' : '#f1f5f9', color: p.totalCaixas > 0 ? '#1d4ed8' : 'var(--gray-400)', borderRadius: 99, padding: '2px 10px' }}>
                      {p.totalCaixas} caixa{p.totalCaixas !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ))()}

          {/* Painel de caixas não alocadas (sempre visível no rodapé se não há seleção de detalhe) */}
          {selected?.tipo !== 'detalhe' && caixasNaoAlocadas.length > 0 && (
            <div style={{ marginTop: 32, padding: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>⚠ {caixasNaoAlocadas.length} caixa(s) sem localizacao WM</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {caixasNaoAlocadas.slice(0, 20).map(c => (
                  <span key={c.localizacao} style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, background: '#fff', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', color: '#78350f' }}>{c.localizacao}</span>
                ))}
                {caixasNaoAlocadas.length > 20 && <span style={{ fontSize: 11, color: '#92400e' }}>+{caixasNaoAlocadas.length - 20} mais...</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL CRIAR / EDITAR ─────────────────────────────────────────────── */}
      {modalCriar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModalCriar(null)}>
          <div style={{ background: 'var(--white)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 20 }}>
              {modalCriar.editando ? 'Renomear' : '+'} {modalCriar.tipo === 'area' ? 'Espaco de Armazenagem' : modalCriar.tipo === 'posicao' ? 'Posicao' : 'Detalhe'}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Nome</label>
              <input
                ref={inputRef}
                style={s.input}
                placeholder={modalCriar.tipo === 'area' ? 'Ex: Setor Pecas, Setor Sensores...' : modalCriar.tipo === 'posicao' ? 'Ex: Rack 1, Prateleira 1, Mezanino...' : 'Ex: N0, N1, Solto, Chao...'}
                value={modalNome}
                onChange={e => setModalNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salvarModal(); if (e.key === 'Escape') setModalCriar(null); }}
              />
            </div>
            {modalCriar.tipo === 'area' && (
              <div style={{ marginBottom: 18 }}>
                <label style={s.label}>Descricao (opcional)</label>
                <input style={s.input} placeholder="Ex: Pecas pequenas de moto" value={modalDesc} onChange={e => setModalDesc(e.target.value)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCriar(null)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-600)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvarModal} disabled={salvando || !modalNome.trim()} style={{ ...s.btn, background: '#1d4ed8', color: '#fff', opacity: salvando || !modalNome.trim() ? 0.6 : 1 }}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ALOCAR CAIXA ───────────────────────────────────────────────── */}
      {modalAlocar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModalAlocar(null)}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Alocar caixa em {modalAlocar.detailLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>{caixasNaoAlocadas.length} caixa(s) sem localizacao WM</div>
              <input
                autoFocus
                style={s.input}
                placeholder="Buscar caixa por codigo de localizacao..."
                value={buscaCaixa}
                onChange={e => setBuscaCaixa(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {caixasFiltradas.length === 0 ? (
                <div style={{ color: 'var(--gray-400)', fontSize: 13, padding: 12, textAlign: 'center' }}>
                  {buscaCaixa ? 'Nenhuma caixa encontrada.' : 'Todas as caixas ja estao alocadas!'}
                </div>
              ) : caixasFiltradas.map(cx => (
                <div key={cx.localizacao} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6, background: 'var(--white)' }}>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>{cx.localizacao}</span>
                  <button
                    onClick={async () => { await alocarCaixa(cx.localizacao, modalAlocar.detailId); setModalAlocar(null); }}
                    disabled={alocando === cx.localizacao}
                    style={{ ...s.btn, background: '#1d4ed8', color: '#fff', fontSize: 11, padding: '5px 12px', opacity: alocando === cx.localizacao ? 0.6 : 1 }}
                  >
                    {alocando === cx.localizacao ? '...' : 'Alocar'}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAlocar(null)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-600)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL HISTÓRICO ──────────────────────────────────────────────────── */}
      {modalHistorico && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModalHistorico(null)}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Historico de movimentacao</div>
                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>{modalHistorico.localizacao}</div>
              </div>
              <button onClick={() => setModalHistorico(null)} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {loadingHistorico ? (
                <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Carregando historico...</div>
              ) : historico.length === 0 ? (
                <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Nenhum historico encontrado.</div>
              ) : historico.map(h => (
                <div key={h.id} style={{ borderLeft: '3px solid #dbeafe', paddingLeft: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>{fmtData(h.changedAt)}{h.changedBy ? ` · ${h.changedBy}` : ''}</div>
                  {h.de ? (
                    <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>
                      <span style={{ color: '#dc2626' }}>De:</span> {h.de}
                      <br />
                      <span style={{ color: '#16a34a' }}>Para:</span> {h.observacao === 'Alocacao removida' ? <em style={{ color: '#dc2626' }}>Removido</em> : h.para}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>
                      <span style={{ color: '#16a34a' }}>Alocado em:</span> {h.para}
                    </div>
                  )}
                  {h.observacao && h.observacao !== 'Alocacao removida' && (
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>{h.observacao}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
