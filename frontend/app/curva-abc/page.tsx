'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type CategoriaRow = {
  nome: string;
  skus: number;
  unidades: number;
  emEstoque: number;
  vendidas: number;
  receita: number;
  receitaLiq: number;
  giroPct: number;
};

type Relatorio = {
  ok: boolean;
  semTabela?: boolean;
  atualizadoEm: string | null;
  categorias: CategoriaRow[];
  totais: {
    categorias: number; skus: number; skusCategorizado: number; skusSemCategoria: number;
    unidades: number; emEstoque: number; vendidas: number; receita: number; receitaLiq: number; giroPct: number;
  } | null;
};

const fmtBRL = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const CLASSE_CORES: Record<string, { bg: string; color: string }> = {
  A: { bg: '#ecfdf3', color: '#047857' },
  B: { bg: '#fff7ed', color: '#c2410c' },
  C: { bg: '#fef2f2', color: '#b91c1c' },
  '-': { bg: '#f1f5f9', color: '#64748b' },
};

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' as const, padding: '12px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--gray-800)', outline: 'none', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  th: { textAlign: 'left' as const, padding: '10px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)', borderBottom: '1px solid #f1f5f9' },
};

type PecaItem = {
  sku: string; descricao: string; emEstoque: boolean; vendida: boolean; qtd: number;
  categorias: { nome: string; origem: string }[];
};

export default function CurvaAbcPage() {
  const [aba, setAba] = useState<'relatorio' | 'manual'>('relatorio');
  const [loading, setLoading] = useState(true);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [motoId, setMotoId] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [criterio, setCriterio] = useState<'receita' | 'quantidade'>('receita');
  const [esconderSemCategoria, setEsconderSemCategoria] = useState(false);

  // Aba de categorização manual
  const [manualMotoId, setManualMotoId] = useState('');
  const [soSemCat, setSoSemCat] = useState(true);
  const [manualItens, setManualItens] = useState<PecaItem[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualBuscou, setManualBuscou] = useState(false);
  const [nomesCategorias, setNomesCategorias] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [salvandoSku, setSalvandoSku] = useState('');
  const [salvoSku, setSalvoSku] = useState('');

  async function carregarManual() {
    if (!manualMotoId) { setManualItens([]); setManualBuscou(false); return; }
    setManualLoading(true);
    try {
      const params = new URLSearchParams({ motoId: manualMotoId });
      if (soSemCat) params.set('semCategoria', '1');
      const d = await fetch(`${API}/curva-abc/pecas?${params.toString()}`, { credentials: 'include' }).then(r => r.json());
      const itens: PecaItem[] = d?.itens || [];
      setManualItens(itens);
      const ed: Record<string, string[]> = {};
      for (const it of itens) ed[it.sku] = (it.categorias || []).filter(c => c.origem === 'manual').map(c => c.nome);
      setEdits(ed);
      setManualBuscou(true);
    } catch (e: any) {
      alert(e?.message || 'Erro ao carregar peças');
    }
    setManualLoading(false);
  }

  function addCategoria(sku: string, nomeRaw: string) {
    const nome = String(nomeRaw || '').trim();
    if (!nome) return;
    setEdits(prev => {
      const atual = prev[sku] || [];
      if (atual.some(n => n.toLowerCase() === nome.toLowerCase())) return prev;
      return { ...prev, [sku]: [...atual, nome] };
    });
    setDrafts(prev => ({ ...prev, [sku]: '' }));
  }

  function removeCategoria(sku: string, nome: string) {
    setEdits(prev => ({ ...prev, [sku]: (prev[sku] || []).filter(n => n !== nome) }));
  }

  async function salvarCategorias(sku: string) {
    setSalvandoSku(sku);
    try {
      const categorias = edits[sku] || [];
      const r = await fetch(`${API}/curva-abc/pecas/categorias`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, categorias }),
      }).then(res => res.json());
      if (!r?.ok) { alert(r?.error || 'Erro ao salvar'); setSalvandoSku(''); return; }
      // Atualiza o item local: mantém nuvemshop, troca as manuais pelo que foi salvo
      setManualItens(prev => prev.map(it => it.sku === sku
        ? { ...it, categorias: [...it.categorias.filter(c => c.origem !== 'manual'), ...categorias.map(n => ({ nome: n, origem: 'manual' }))] }
        : it));
      setNomesCategorias(prev => Array.from(new Set([...prev, ...categorias])).sort((a, b) => a.localeCompare(b, 'pt-BR')));
      setSalvoSku(sku);
      setTimeout(() => setSalvoSku(s => (s === sku ? '' : s)), 2000);
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar');
    }
    setSalvandoSku('');
  }

  async function carregar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (motoId) params.set('motoId', motoId);
      if (dataDe) params.set('dataDe', dataDe);
      if (dataAte) params.set('dataAte', dataAte);
      const d = await fetch(`${API}/curva-abc/relatorio?${params.toString()}`, { credentials: 'include' }).then(r => r.json());
      setRel(d);
    } catch (e: any) {
      alert(e?.message || 'Erro ao carregar relatorio');
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    fetch(`${API}/motos`, { credentials: 'include' }).then(r => r.json()).then((d) => setMotos(Array.isArray(d) ? d : (d?.data || []))).catch(() => {});
    fetch(`${API}/curva-abc/categorias-nomes`, { credentials: 'include' }).then(r => r.json()).then((d) => setNomesCategorias(d?.nomes || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Classificacao ABC pelo criterio escolhido: A = ate 80% acumulado, B = ate 95%, C = resto.
  // "Sem categoria" fica fora do ranking (badge neutro) e vai pro fim da tabela.
  const linhas = useMemo(() => {
    const cats = (rel?.categorias || []).filter(c => c.nome !== 'Sem categoria');
    const semCat = (rel?.categorias || []).find(c => c.nome === 'Sem categoria') || null;
    const valor = (c: CategoriaRow) => criterio === 'receita' ? c.receita : c.vendidas;
    const ordenadas = [...cats].sort((a, b) => valor(b) - valor(a) || b.receita - a.receita);
    const total = ordenadas.reduce((acc, c) => acc + valor(c), 0);
    let acumulado = 0;
    const comClasse = ordenadas.map((c) => {
      acumulado += valor(c);
      const pctAcum = total > 0 ? acumulado / total : 1;
      const classe = valor(c) <= 0 ? 'C' : pctAcum <= 0.80 ? 'A' : pctAcum <= 0.95 ? 'B' : 'C';
      return { ...c, classe, participacaoPct: total > 0 ? Math.round((valor(c) / total) * 1000) / 10 : 0 };
    });
    if (semCat && !esconderSemCategoria) comClasse.push({ ...semCat, classe: '-', participacaoPct: 0 } as any);
    return comClasse;
  }, [rel, criterio, esconderSemCategoria]);

  const semVenda = useMemo(
    () => (rel?.categorias || []).filter(c => c.nome !== 'Sem categoria' && c.vendidas === 0),
    [rel],
  );

  const t = rel?.totais;
  const atualizadoEm = rel?.atualizadoEm ? new Date(rel.atualizadoEm) : null;

  const kpi = (label: string, valor: string, sub?: string) => (
    <div style={{ ...s.card, padding: '12px 16px', minWidth: 130, flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gray-800)', marginTop: 2 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Curva ABC</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            {aba === 'relatorio' ? 'Giro e receita por categoria de peça' : 'Atribua categorias a peças que não vieram da Nuvemshop (vendidas antigas)'}
            {aba === 'relatorio' && atualizadoEm ? ` · categorias atualizadas em ${atualizadoEm.toLocaleDateString('pt-BR')} às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {aba === 'relatorio' && (
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['receita', 'quantidade'] as const).map((c) => (
                <button key={c} onClick={() => setCriterio(c)}
                  style={{ border: 'none', padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', background: criterio === c ? 'var(--gray-800)' : 'var(--white)', color: criterio === c ? '#fff' : 'var(--gray-600)' }}>
                  {c === 'receita' ? 'ABC por Receita' : 'ABC por Quantidade'}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['relatorio', 'Relatório'], ['manual', 'Categorização manual']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setAba(k)}
                style={{ border: 'none', padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', background: aba === k ? '#7c3aed' : 'var(--white)', color: aba === k ? '#fff' : 'var(--gray-600)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {aba === 'relatorio' && <>
        {/* Filtros */}
        <div style={{ ...s.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Moto</div>
            <select style={{ ...s.input, minWidth: 220 }} value={motoId} onChange={e => setMotoId(e.target.value)}>
              <option value="">Todas as motos</option>
              {motos.map((m: any) => <option key={m.id} value={m.id}>#{m.id} — {m.marca} {m.modelo}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Venda de</div>
            <input type="date" style={s.input} value={dataDe} onChange={e => setDataDe(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>até</div>
            <input type="date" style={s.input} value={dataAte} onChange={e => setDataAte(e.target.value)} />
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-600)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={esconderSemCategoria} onChange={e => setEsconderSemCategoria(e.target.checked)} />
            Esconder “Sem categoria”
          </label>
          <button onClick={carregar} disabled={loading} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: loading ? .7 : 1 }}>
            {loading ? 'Carregando...' : 'Aplicar filtros'}
          </button>
        </div>

        {rel?.semTabela || (!loading && !(rel?.categorias || []).length) ? (
          <div style={{ ...s.card, textAlign: 'center', padding: 48, color: 'var(--gray-400)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-600)' }}>Ainda não há categorias importadas</div>
            <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
              Rode a busca na tela <b>Nuvemshop → Produtos</b> — as categorias lidas de lá alimentam este relatório automaticamente.
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {kpi('Categorias', String(t?.categorias ?? '—'))}
              {kpi('SKUs', String(t?.skus ?? '—'), t ? `${t.skusCategorizado} categorizados · ${t.skusSemCategoria} sem categoria` : undefined)}
              {kpi('Já teve em estoque', String(t?.unidades ?? '—'), 'unidades (histórico)')}
              {kpi('Em estoque', String(t?.emEstoque ?? '—'))}
              {kpi('Vendidas', String(t?.vendidas ?? '—'), t ? `${t.giroPct}% de giro` : undefined)}
              {kpi('Receita', t ? fmtBRL(t.receita) : '—', t ? `líquida ${fmtBRL(t.receitaLiq)}` : undefined)}
            </div>

            {/* Categorias sem venda */}
            {semVenda.length > 0 && (
              <div style={{ ...s.card, background: '#fff7ed', borderColor: '#fdba74' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9a3412' }}>
                  ⚠ {semVenda.length} categoria(s) sem nenhuma venda{dataDe || dataAte ? ' no período' : ''}:
                </div>
                <div style={{ fontSize: 12.5, color: '#9a3412', marginTop: 4, lineHeight: 1.7 }}>
                  {semVenda.map(c => `${c.nome} (${c.unidades} un.)`).join(' · ')}
                </div>
              </div>
            )}

            {/* Tabela ABC */}
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={s.th}>Categoria</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>Classe</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>SKUs</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Já teve</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Em estoque</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Vendidas</th>
                    <th style={{ ...s.th, width: 180 }}>% giro</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Receita</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Receita líq.</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Particip.</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={10} style={{ ...s.td, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Carregando...</td></tr>
                    ) : linhas.map((c: any, i: number) => {
                      const cor = CLASSE_CORES[c.classe] || CLASSE_CORES['-'];
                      const semCat = c.nome === 'Sem categoria';
                      return (
                        <tr key={c.nome} style={{ background: semCat ? '#f8fafc' : (i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)') }}>
                          <td style={{ ...s.td, fontWeight: 600, color: semCat ? 'var(--gray-400)' : 'var(--gray-800)' }}>{c.nome}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', minWidth: 24, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: cor.bg, color: cor.color }}>{c.classe}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{c.skus}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{c.unidades}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{c.emEstoque}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{c.vendidas}</td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef1f5', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, c.giroPct)}%`, height: '100%', borderRadius: 3, background: c.giroPct >= 60 ? '#16a34a' : c.giroPct >= 30 ? '#f59e0b' : '#dc2626' }} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--gray-500)', minWidth: 34, textAlign: 'right' }}>{c.giroPct}%</span>
                            </div>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtBRL(c.receita)}</td>
                          <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--gray-500)' }}>{fmtBRL(c.receitaLiq)}</td>
                          <td style={{ ...s.td, textAlign: 'right', color: 'var(--gray-500)' }}>{semCat ? '—' : `${c.participacaoPct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--gray-400)', borderTop: '1px solid var(--border)' }}>
                Classe pela participação acumulada em {criterio === 'receita' ? 'receita' : 'quantidade vendida'}: A até 80% · B até 95% · C restante.
                SKU com mais de uma categoria conta em todas — os totais do topo usam peças únicas.
              </div>
            </div>
          </>
        )}
        </>}

        {aba === 'manual' && <>
          {/* Filtro da moto */}
          <div style={{ ...s.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Moto (ID completo — inclui vendidas)</div>
              <select style={{ ...s.input, minWidth: 260 }} value={manualMotoId} onChange={e => setManualMotoId(e.target.value)}>
                <option value="">Selecione a moto...</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo} {m.ano || ''}</option>)}
              </select>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-600)', cursor: 'pointer', paddingBottom: 8 }}>
              <input type="checkbox" checked={soSemCat} onChange={e => setSoSemCat(e.target.checked)} />
              Só peças sem categoria
            </label>
            <button onClick={carregarManual} disabled={manualLoading || !manualMotoId}
              style={{ ...s.btn, background: '#7c3aed', color: '#fff', opacity: (manualLoading || !manualMotoId) ? .6 : 1 }}>
              {manualLoading ? 'Carregando...' : 'Buscar peças'}
            </button>
          </div>

          <datalist id="dl-categorias">
            {nomesCategorias.map(n => <option key={n} value={n} />)}
          </datalist>

          {!manualBuscou ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>🏷️</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gray-600)' }}>Selecione uma moto e clique em “Buscar peças”</div>
              <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
                Aqui você categoriza as peças que não vêm da Nuvemshop (as já vendidas). O que você salvar aqui nunca é apagado pela sincronização automática.
              </div>
            </div>
          ) : manualItens.length === 0 ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gray-600)' }}>
                {soSemCat ? 'Nenhuma peça sem categoria nesta moto' : 'Nenhuma peça encontrada'}
              </div>
              {soSemCat && <div style={{ fontSize: 12.5, marginTop: 6 }}>Desmarque “Só peças sem categoria” para revisar todas.</div>}
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--gray-500)' }}>
                <span><b style={{ color: 'var(--gray-700)' }}>{manualItens.length}</b> peça(s){soSemCat ? ' sem categoria' : ''}</span>
                <span>Digite para buscar uma categoria existente ou criar uma nova</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...s.th, width: 120 }}>SKU</th>
                    <th style={s.th}>Peça</th>
                    <th style={{ ...s.th, textAlign: 'center', width: 90 }}>Situação</th>
                    <th style={{ ...s.th, minWidth: 320 }}>Categorias</th>
                    <th style={{ ...s.th, width: 90 }}></th>
                  </tr></thead>
                  <tbody>
                    {manualItens.map((it, i) => {
                      const manuais = edits[it.sku] || [];
                      const nuvem = (it.categorias || []).filter(c => c.origem !== 'manual');
                      return (
                        <tr key={it.sku} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)', verticalAlign: 'top' }}>
                          <td style={{ ...s.td, fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{it.sku}</td>
                          <td style={{ ...s.td }}>{it.descricao}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: it.emEstoque ? '#ecfdf3' : '#f1f5f9', color: it.emEstoque ? '#047857' : '#64748b' }}>
                              {it.emEstoque ? 'Em estoque' : 'Vendida'}
                            </span>
                          </td>
                          <td style={{ ...s.td }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                              {nuvem.map(c => (
                                <span key={'n' + c.nome} title="Categoria da Nuvemshop (não editável aqui)"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: 12, background: '#eef2ff', color: '#4338ca' }}>
                                  {c.nome}
                                </span>
                              ))}
                              {manuais.map(nome => (
                                <span key={'m' + nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 12, background: '#f3e8ff', color: '#7c3aed' }}>
                                  {nome}
                                  <button onClick={() => removeCategoria(it.sku, nome)} title="Remover"
                                    style={{ border: 'none', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 800, fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                                </span>
                              ))}
                              {nuvem.length === 0 && manuais.length === 0 && <span style={{ fontSize: 12, color: '#dc2626' }}>Sem categoria</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input list="dl-categorias" placeholder="Adicionar categoria..." value={drafts[it.sku] || ''}
                                onChange={e => setDrafts(prev => ({ ...prev, [it.sku]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategoria(it.sku, drafts[it.sku] || ''); } }}
                                style={{ ...s.input, flex: 1, padding: '5px 8px', fontSize: 12.5 }} />
                              <button onClick={() => addCategoria(it.sku, drafts[it.sku] || '')}
                                style={{ ...s.btn, padding: '5px 12px', fontSize: 12.5, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>+ Add</button>
                            </div>
                          </td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <button onClick={() => salvarCategorias(it.sku)} disabled={salvandoSku === it.sku}
                              style={{ ...s.btn, padding: '5px 12px', fontSize: 12.5, background: salvoSku === it.sku ? '#16a34a' : '#7c3aed', color: '#fff', opacity: salvandoSku === it.sku ? .6 : 1 }}>
                              {salvandoSku === it.sku ? '...' : salvoSku === it.sku ? '✓ Salvo' : 'Salvar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--gray-400)', borderTop: '1px solid var(--border)' }}>
                Chips <span style={{ color: '#4338ca' }}>azuis</span> vêm da Nuvemshop (só leitura aqui); <span style={{ color: '#7c3aed' }}>roxos</span> são manuais. Salve peça a peça — as manuais entram no relatório e resistem à sincronização.
              </div>
            </div>
          )}
        </>}
      </div>
    </>
  );
}
