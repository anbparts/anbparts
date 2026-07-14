'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { canProcessAction } from '@/lib/permissions';

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
  const { user } = useAuth();
  const podeSugerirIA = canProcessAction(user as any, 'curva_abc', 'sugerir_ia');
  const [aba, setAba] = useState<'relatorio' | 'manual' | 'conf'>('relatorio');
  const [loading, setLoading] = useState(true);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [motoId, setMotoId] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [criterio, setCriterio] = useState<'receita' | 'quantidade'>('receita');
  const [esconderSemCategoria, setEsconderSemCategoria] = useState(false);
  const [skuFiltro, setSkuFiltro] = useState('');

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
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroSkuManual, setFiltroSkuManual] = useState('');
  const [filtroCatManual, setFiltroCatManual] = useState('');
  const [catTree, setCatTree] = useState<any[]>([]);
  const [sugerindoIA, setSugerindoIA] = useState(false);
  const [statusIA, setStatusIA] = useState('');

  // Aba Conf. Categorias (unificação)
  const [confItens, setConfItens] = useState<{ origem: string; skus: number; destino: string }[]>([]);
  const [confModo, setConfModo] = useState<'todas' | 'principal' | 'especifica'>('todas');
  const [confSugestoes, setConfSugestoes] = useState<{ origem: string; destino: string }[]>([]);
  const [confMap, setConfMap] = useState<Record<string, string>>({});
  const [confLoading, setConfLoading] = useState(false);
  const [confSalvando, setConfSalvando] = useState(false);
  const [confBuscou, setConfBuscou] = useState(false);

  // Drill-down de categoria
  const [drillNome, setDrillNome] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<{ itens: any[]; serieMeses: any[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  async function carregarConf() {
    setConfLoading(true);
    try {
      const d = await fetch(`${API}/curva-abc/unificacao`, { credentials: 'include' }).then(r => r.json());
      const itens = d?.itens || [];
      setConfItens(itens);
      setConfModo(d?.modo === 'principal' || d?.modo === 'especifica' ? d.modo : 'todas');
      setConfSugestoes(d?.sugestoes || []);
      const m: Record<string, string> = {};
      for (const it of itens) m[it.origem] = it.destino || '';
      setConfMap(m);
      setConfBuscou(true);
    } catch (e: any) { alert(e?.message || 'Erro ao carregar categorias'); }
    setConfLoading(false);
  }

  const [modoSalvo, setModoSalvo] = useState(false);
  // O modo é salvo na hora (independe da tabela de unificação) e o relatório é atualizado.
  async function selecionarModo(k: 'todas' | 'principal' | 'especifica') {
    setConfModo(k);
    setModoSalvo(false);
    try {
      const r = await fetch(`${API}/curva-abc/modo`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: k }),
      }).then(res => res.json());
      if (r?.ok) {
        setModoSalvo(true);
        setTimeout(() => setModoSalvo(false), 2500);
        carregar(); // atualiza o relatório com o novo modo
      } else {
        alert(r?.error || 'Erro ao salvar o modo');
      }
    } catch (e: any) { alert(e?.message || 'Erro ao salvar o modo'); }
  }

  function aplicarSugestoesConf(lista: { origem: string; destino: string }[]) {
    setConfMap(prev => {
      const n = { ...prev };
      for (const sg of lista) n[sg.origem] = sg.destino;
      return n;
    });
  }

  async function salvarConf() {
    setConfSalvando(true);
    try {
      const mapa = Object.entries(confMap)
        .map(([origem, destino]) => ({ origem, destino: String(destino || '').trim() }))
        .filter(m => m.destino && m.destino.toLowerCase() !== m.origem.toLowerCase());
      const r = await fetch(`${API}/curva-abc/unificacao`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapa, modo: confModo }),
      }).then(res => res.json());
      if (!r?.ok) { alert(r?.error || 'Erro ao salvar'); setConfSalvando(false); return; }
      alert('✓ Unificação salva! O relatório já reflete o agrupamento.');
      await carregar(); // atualiza o relatório
      await carregarConf();
    } catch (e: any) { alert(e?.message || 'Erro ao salvar'); }
    setConfSalvando(false);
  }

  async function abrirDrill(nome: string) {
    setDrillNome(nome);
    setDrillData(null);
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ nome });
      if (motoId) params.set('motoId', motoId);
      if (dataDe) params.set('dataDe', dataDe);
      if (dataAte) params.set('dataAte', dataAte);
      const d = await fetch(`${API}/curva-abc/categoria-detalhe?${params.toString()}`, { credentials: 'include' }).then(r => r.json());
      setDrillData({ itens: d?.itens || [], serieMeses: d?.serieMeses || [] });
    } catch (e: any) { alert(e?.message || 'Erro no detalhe'); }
    setDrillLoading(false);
  }

  function toggleSelecionado(sku: string) {
    setSelecionados(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  }
  // Operam sobre a lista FILTRADA (manualView) — respeitam os filtros de SKU/categoria ativos.
  function toggleSelecionarTodos() {
    const view = manualView;
    const todosSelec = view.length > 0 && view.every(i => selecionados.has(i.sku));
    setSelecionados(todosSelec ? new Set() : new Set(view.map(i => i.sku)));
  }
  // Seleciona o próximo lote de até 10 peças ainda SEM categoria (evita o erro da IA com muitos itens).
  // Como categoriza em lote, a cada clique avança para as 10 seguintes que continuam sem categoria.
  function selecionarProximos10() {
    const semCat = manualView.filter(it => {
      const manuais = edits[it.sku] || [];
      const nuvem = (it.categorias || []).filter(c => c.origem !== 'manual');
      return manuais.length === 0 && nuvem.length === 0;
    }).slice(0, 10).map(it => it.sku);
    if (!semCat.length) { alert('Não há mais peças sem categoria para selecionar.'); return; }
    setSelecionados(new Set(semCat));
  }

  // Chama a MESMA IA da Nuvemshop, mas usa só as categorias sugeridas (sem tags),
  // grava na SkuCategoria (origem manual) e exibe os chips na hora. Só-Bruno (permissão de perfil).
  async function sugerirCategoriasIA() {
    const alvos = manualItens.filter(i => selecionados.has(i.sku));
    if (!alvos.length) { alert('Selecione ao menos uma peça.'); return; }
    if (!catTree.length) { alert('Categorias da Nuvemshop ainda não carregaram — tente novamente em instantes.'); return; }
    const moto = motos.find((m: any) => String(m.id) === String(manualMotoId));
    setSugerindoIA(true);
    setStatusIA('✨ Analisando com IA...');
    try {
      const resp = await fetch(`${API}/nuvemshop/sugerir-ia`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtos: alvos.map(i => ({ sku: i.sku, titulo: i.descricao, moto: moto ? { marca: moto.marca, modelo: moto.modelo, ano: moto.ano } : {} })),
          categorias: catTree.map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parent_id })),
        }),
      }).then(r => r.json());
      if (!resp?.ok) { alert(resp?.error || 'Erro na IA'); setSugerindoIA(false); setStatusIA(''); return; }

      const porSku: Record<string, string[]> = {};
      (resp.sugestoes || []).forEach((s: any) => {
        porSku[String(s.sku).toUpperCase()] = (Array.isArray(s.categorias) ? s.categorias : [])
          .map((c: any) => String(c?.nome || '').trim()).filter(Boolean);
      });

      let salvos = 0;
      for (const it of alvos) {
        const nomes = porSku[it.sku.toUpperCase()] || [];
        if (!nomes.length) continue;
        // mescla com o que já havia de manual, sem duplicar
        const atual = edits[it.sku] || [];
        const merge = Array.from(new Set([...atual, ...nomes]));
        const r = await fetch(`${API}/curva-abc/pecas/categorias`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: it.sku, categorias: merge }),
        }).then(res => res.json());
        if (r?.ok) {
          salvos++;
          setEdits(prev => ({ ...prev, [it.sku]: merge }));
          setManualItens(prev => prev.map(x => x.sku === it.sku
            ? { ...x, categorias: [...x.categorias.filter(c => c.origem !== 'manual'), ...merge.map(n => ({ nome: n, origem: 'manual' }))] }
            : x));
          setNomesCategorias(prev => Array.from(new Set([...prev, ...merge])).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        }
      }
      setStatusIA(`✓ IA categorizou ${salvos} de ${alvos.length} peça(s).`);
      setSelecionados(new Set()); // limpa pro próximo lote de 10
      setTimeout(() => setStatusIA(''), 4000);
    } catch (e: any) {
      alert(e?.message || 'Erro na IA');
      setStatusIA('');
    }
    setSugerindoIA(false);
  }

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
      setSelecionados(new Set());
      setFiltroSkuManual('');
      setFiltroCatManual('');
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
      if (skuFiltro.trim()) params.set('sku', skuFiltro.trim());
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
    fetch(`${API}/nuvemshop/categorias`, { credentials: 'include' }).then(r => r.json()).then((d) => {
      const cats = d?.categorias || [];
      setCatTree(cats);
      // Espelha a hierarquia no backend (para o modo "mais específica")
      const payload = cats.map((c: any) => ({
        id: String(c?.id ?? ''),
        nome: c?.name?.pt || c?.name?.['pt-BR'] || (c?.name ? (Object.values(c.name)[0] as string) : '') || String(c?.id ?? ''),
        parentId: c?.parent != null ? String(c.parent) : (c?.parent_id != null ? String(c.parent_id) : ''),
      })).filter((c: any) => c.id && c.nome);
      if (payload.length) {
        fetch(`${API}/curva-abc/hierarquia`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categorias: payload }),
        }).catch(() => {});
      }
    }).catch(() => {});
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

  // Sugestões de unificação: por nome (backend) + por hierarquia da Nuvemshop (filha → categoria pai).
  const sugestoesTodas = useMemo(() => {
    const nodes = (catTree || []).map((c: any) => {
      const nome = c?.name?.pt || c?.name?.['pt-BR'] || (c?.name ? (Object.values(c.name)[0] as string) : '') || String(c?.id || '');
      const parent = c?.parent != null ? String(c.parent) : (c?.parent_id != null ? String(c.parent_id) : '');
      return { id: String(c?.id || ''), nome: String(nome || '').trim(), parent };
    });
    const idToNome = new Map<string, string>();
    for (const n of nodes) if (n.id) idToNome.set(n.id, n.nome);
    const origensExistentes = new Set(confItens.map(i => i.origem.trim().toLowerCase()));
    const hier: { origem: string; destino: string }[] = [];
    for (const n of nodes) {
      if (!n.parent || !n.nome) continue;
      const paiNome = idToNome.get(n.parent);
      if (!paiNome) continue;
      if (paiNome.trim().toLowerCase() === n.nome.trim().toLowerCase()) continue;
      if (!origensExistentes.has(n.nome.trim().toLowerCase())) continue; // só categorias que temos
      hier.push({ origem: n.nome, destino: paiNome });
    }
    const seen = new Set<string>();
    const todas: { origem: string; destino: string }[] = [];
    for (const sug of [...hier, ...confSugestoes]) { // hierarquia primeiro
      const k = sug.origem.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      todas.push(sug);
    }
    return todas;
  }, [catTree, confItens, confSugestoes]);

  // Filtro client-side da aba manual (SKU + categoria) sobre a lista já carregada.
  const manualView = useMemo(() => {
    const sku = filtroSkuManual.trim().toUpperCase();
    const cat = filtroCatManual.trim().toLowerCase();
    return manualItens.filter(it => {
      if (sku && !it.sku.toUpperCase().includes(sku)) return false;
      if (cat) {
        const manuais = edits[it.sku] || [];
        const nuvem = (it.categorias || []).filter(c => c.origem !== 'manual');
        if (cat === '__sem__') { if (manuais.length || nuvem.length) return false; }
        else {
          const nomes = new Set([...(it.categorias || []).map(c => c.nome), ...manuais].map(n => n.toLowerCase()));
          if (!nomes.has(cat)) return false;
        }
      }
      return true;
    });
  }, [manualItens, filtroSkuManual, filtroCatManual, edits]);

  const catOptionsManual = useMemo(() => {
    const set = new Set<string>();
    for (const it of manualItens) {
      for (const c of (it.categorias || [])) set.add(c.nome);
      for (const n of (edits[it.sku] || [])) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [manualItens, edits]);

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
            {aba === 'relatorio' ? 'Giro e receita por categoria de peça' : aba === 'manual' ? 'Atribua categorias a peças que não vieram da Nuvemshop (vendidas antigas)' : 'Agrupe categorias parecidas e defina como contar peças com várias categorias'}
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
            {([['relatorio', 'Relatório'], ['manual', 'Categorização manual'], ['conf', 'Conf. Categorias']] as const).map(([k, label]) => (
              <button key={k} onClick={() => { setAba(k); if (k === 'conf' && !confBuscou) carregarConf(); }}
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
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>SKU (conferir categorias)</div>
            <input style={{ ...s.input, minWidth: 150, textTransform: 'uppercase' }} value={skuFiltro} placeholder="ex.: HD01_0064"
              onChange={e => setSkuFiltro(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') carregar(); }} />
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-600)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={esconderSemCategoria} onChange={e => setEsconderSemCategoria(e.target.checked)} />
            Esconder “Sem categoria”
          </label>
          <button onClick={carregar} disabled={loading} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: loading ? .7 : 1 }}>
            {loading ? 'Carregando...' : 'Aplicar filtros'}
          </button>
        </div>

        {/* Detalhe do SKU filtrado — mostra onde ele conta */}
        {(rel as any)?.skuInfo && (() => {
          const si = (rel as any).skuInfo;
          if (!si.encontrada) return (
            <div style={{ ...s.card, background: '#fef2f2', borderColor: '#fecaca', fontSize: 13, color: '#b91c1c' }}>
              SKU <b>{si.sku}</b> não encontrado no estoque/vendas.
            </div>
          );
          return (
            <div style={{ ...s.card, background: si.emVariasCategorias ? '#fff7ed' : '#f0fdf4', borderColor: si.emVariasCategorias ? '#fdba74' : '#86efac' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>
                {si.sku} — {si.descricao || 'peça'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: 'var(--gray-500)' }}>Categorias no Nuvemshop/manual: </span>
                  <b>{si.categoriasNuvemshop.length ? si.categoriasNuvemshop.join(' · ') : 'nenhuma'}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)' }}>Conta em ({(rel as any)?.modo === 'especifica' ? 'mais específica' : (rel as any)?.modo === 'principal' ? 'principal' : 'todas'}): </span>
                  <b style={{ color: si.emVariasCategorias ? '#c2410c' : '#15803d' }}>{si.contaEm.join(' · ')}</b>
                  {si.emVariasCategorias
                    ? <span style={{ color: '#c2410c' }}> — está em {si.contaEm.length} categorias</span>
                    : <span style={{ color: '#15803d' }}> ✓ 1 categoria</span>}
                </div>
              </div>
            </div>
          );
        })()}

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

            {/* Gráfico: top categorias */}
            {(() => {
              const base = linhas.filter((c: any) => c.nome !== 'Sem categoria');
              const valor = (c: any) => criterio === 'receita' ? c.receita : c.vendidas;
              const top = [...base].sort((a, b) => valor(b) - valor(a)).slice(0, 8);
              const max = Math.max(...top.map(valor), 1);
              if (!top.length) return null;
              return (
                <div style={{ ...s.card }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
                    Top categorias por {criterio === 'receita' ? 'receita' : 'quantidade vendida'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {top.map((c: any) => {
                      const cor = CLASSE_CORES[c.classe] || CLASSE_CORES['-'];
                      return (
                        <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button onClick={() => abrirDrill(c.nome)} style={{ width: 150, textAlign: 'right', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Inter, sans-serif' }} title={c.nome}>{c.nome}</button>
                          <div style={{ flex: 1, height: 18, background: 'var(--gray-50)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(valor(c) / max) * 100}%`, height: '100%', background: cor.color, borderRadius: 4, minWidth: 2 }} />
                          </div>
                          <span style={{ width: 92, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                            {criterio === 'receita' ? fmtBRL(valor(c)) : `${valor(c)} un.`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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
                          <td style={{ ...s.td, fontWeight: 600 }}>
                            <button onClick={() => abrirDrill(c.nome)} title="Ver peças e vendas desta categoria"
                              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, textAlign: 'left', color: semCat ? 'var(--gray-400)' : '#7c3aed', textDecoration: 'underline', textDecorationColor: 'rgba(124,58,237,.35)', textUnderlineOffset: 2 }}>
                              {c.nome} <span style={{ fontSize: 11, opacity: .7 }}>→</span>
                            </button>
                          </td>
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
                SKU com mais de uma categoria {(rel as any)?.modo === 'principal' ? 'conta só na principal (1ª categoria)' : (rel as any)?.modo === 'especifica' ? 'conta só na mais específica (subcategoria ganha do pai)' : 'conta em todas'} — os totais do topo usam peças únicas. Clique numa categoria para ver os SKUs e vendas.
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

          {manualBuscou && manualItens.length > 0 && (
            <div style={{ ...s.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', paddingBottom: 8 }}>Filtrar:</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>SKU</div>
                <input value={filtroSkuManual} placeholder="ex.: PN0003" style={{ ...s.input, minWidth: 140, textTransform: 'uppercase' }}
                  onChange={e => setFiltroSkuManual(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Categoria</div>
                <select value={filtroCatManual} style={{ ...s.input, minWidth: 200, cursor: 'pointer' }} onChange={e => setFiltroCatManual(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  <option value="__sem__">Sem categoria</option>
                  {catOptionsManual.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {(filtroSkuManual || filtroCatManual) && (
                <button onClick={() => { setFiltroSkuManual(''); setFiltroCatManual(''); }}
                  style={{ ...s.btn, padding: '7px 12px', fontSize: 12.5, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>
                  Limpar filtros
                </button>
              )}
            </div>
          )}

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--gray-500)' }}>
                <span><b style={{ color: 'var(--gray-700)' }}>{manualView.length}</b>{manualView.length !== manualItens.length ? ` de ${manualItens.length}` : ''} peça(s){soSemCat ? ' sem categoria' : ''}{selecionados.size ? ` · ${selecionados.size} selecionada(s)` : ''}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {statusIA && <span style={{ fontSize: 12, fontWeight: 700, color: statusIA.startsWith('✓') ? '#16a34a' : '#7c3aed' }}>{statusIA}</span>}
                  {podeSugerirIA && (
                    <button onClick={selecionarProximos10} disabled={sugerindoIA}
                      style={{ ...s.btn, padding: '6px 12px', fontSize: 12.5, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}
                      title="Seleciona as próximas 10 peças sem categoria (rode a IA em lotes de 10)">
                      Selecionar 10
                    </button>
                  )}
                  {podeSugerirIA && (
                    <button onClick={sugerirCategoriasIA} disabled={sugerindoIA || selecionados.size === 0}
                      style={{ ...s.btn, padding: '6px 14px', fontSize: 12.5, background: '#7c3aed', color: '#fff', opacity: (sugerindoIA || selecionados.size === 0) ? .55 : 1 }}
                      title={selecionados.size === 0 ? 'Selecione peças para sugerir' : 'Gera as categorias com IA para as peças selecionadas'}>
                      {sugerindoIA ? '✨ Analisando...' : `✨ Sugerir com IA${selecionados.size ? ` (${selecionados.size})` : ''}`}
                    </button>
                  )}
                  <span>Digite para buscar/criar categoria</span>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...s.th, width: 34, textAlign: 'center' }}>
                      <input type="checkbox" checked={manualView.length > 0 && manualView.every(i => selecionados.has(i.sku))}
                        onChange={toggleSelecionarTodos} title="Selecionar todas (filtradas)" />
                    </th>
                    <th style={{ ...s.th, width: 120 }}>SKU</th>
                    <th style={s.th}>Peça</th>
                    <th style={{ ...s.th, textAlign: 'center', width: 90 }}>Situação</th>
                    <th style={{ ...s.th, minWidth: 320 }}>Categorias</th>
                    <th style={{ ...s.th, width: 90 }}></th>
                  </tr></thead>
                  <tbody>
                    {manualView.length === 0 ? (
                      <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: 28, color: 'var(--gray-400)' }}>Nenhuma peça com esses filtros.</td></tr>
                    ) : manualView.map((it, i) => {
                      const manuais = edits[it.sku] || [];
                      const nuvem = (it.categorias || []).filter(c => c.origem !== 'manual');
                      return (
                        <tr key={it.sku} style={{ background: selecionados.has(it.sku) ? '#faf5ff' : (i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)'), verticalAlign: 'top' }}>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <input type="checkbox" checked={selecionados.has(it.sku)} onChange={() => toggleSelecionado(it.sku)} />
                          </td>
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

        {aba === 'conf' && <>
          {/* Modo de contagem */}
          <div style={{ ...s.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>Peça com mais de uma categoria</div>
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>— salva sozinho ao clicar</span>
              {modoSalvo && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ modo salvo</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([
                ['todas', 'Contar em todas', 'A peça soma em cada categoria dela'],
                ['especifica', 'Só na mais específica', 'Subcategoria ganha do pai (Sensores em vez de Elétrica)'],
                ['principal', 'Só na principal', 'Conta só na 1ª categoria do SKU'],
              ] as const).map(([k, label, desc]) => (
                <button key={k} onClick={() => selecionarModo(k)}
                  style={{ ...s.btn, flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 14px', flex: '1 1 200px', border: `1px solid ${confModo === k ? '#7c3aed' : 'var(--border)'}`, background: confModo === k ? '#faf5ff' : 'var(--white)', color: 'var(--gray-800)' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{confModo === k ? '● ' : '○ '}{label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--gray-500)', fontWeight: 500 }}>{desc}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 8 }}>
              “Mais específica” usa a hierarquia da Nuvemshop (categoria filha × pai) para desmembrar categorias genéricas como Elétrica. O botão <b>Salvar unificação</b> (abaixo) é só para os agrupamentos da tabela.
            </div>
          </div>

          {confLoading && !confBuscou ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Carregando categorias...</div>
          ) : confItens.length === 0 ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>🏷️</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gray-600)' }}>Nenhuma categoria ainda</div>
              <div style={{ fontSize: 12.5, marginTop: 6 }}>Importe categorias pela tela Nuvemshop → Produtos ou use a categorização manual.</div>
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}><b style={{ color: 'var(--gray-700)' }}>{confItens.length}</b> categoria(s) · deixe o destino vazio para manter o nome original</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {sugestoesTodas.length > 0 && (
                    <button onClick={() => aplicarSugestoesConf(sugestoesTodas)} style={{ ...s.btn, padding: '6px 12px', fontSize: 12.5, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>
                      ✨ Aplicar {sugestoesTodas.length} sugestão(ões)
                    </button>
                  )}
                  <button onClick={salvarConf} disabled={confSalvando} style={{ ...s.btn, padding: '6px 14px', fontSize: 12.5, background: '#7c3aed', color: '#fff', opacity: confSalvando ? .6 : 1 }}>
                    {confSalvando ? 'Salvando...' : 'Salvar unificação'}
                  </button>
                </div>
              </div>
              <datalist id="dl-destinos">
                {Array.from(new Set([...confItens.map(i => i.origem), ...Object.values(confMap).filter(Boolean)])).sort().map(n => <option key={n} value={n} />)}
              </datalist>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={s.th}>Categoria original</th>
                    <th style={{ ...s.th, textAlign: 'right', width: 80 }}>SKUs</th>
                    <th style={{ ...s.th, width: 40, textAlign: 'center' }}></th>
                    <th style={{ ...s.th, minWidth: 240 }}>Agrupar em (destino)</th>
                  </tr></thead>
                  <tbody>
                    {confItens.map((it, i) => {
                      const destino = confMap[it.origem] || '';
                      const sugerido = sugestoesTodas.find(sg => sg.origem === it.origem);
                      return (
                        <tr key={it.origem} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{it.origem}</td>
                          <td style={{ ...s.td, textAlign: 'right', color: 'var(--gray-500)' }}>{it.skus}</td>
                          <td style={{ ...s.td, textAlign: 'center', color: 'var(--gray-300)' }}>{destino ? '→' : ''}</td>
                          <td style={{ ...s.td }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input list="dl-destinos" value={destino} placeholder="manter original"
                                onChange={e => setConfMap(prev => ({ ...prev, [it.origem]: e.target.value }))}
                                style={{ ...s.input, flex: 1, padding: '5px 8px', fontSize: 12.5, borderColor: destino ? '#c4b5fd' : 'var(--border)' }} />
                              {destino && <button onClick={() => setConfMap(prev => ({ ...prev, [it.origem]: '' }))} title="Limpar"
                                style={{ border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer', fontWeight: 800 }}>×</button>}
                            </div>
                            {sugerido && sugerido.destino.trim().toLowerCase() !== destino.trim().toLowerCase() && (
                              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--gray-400)' }}>
                                sugestão:{' '}
                                <button onClick={() => setConfMap(prev => ({ ...prev, [it.origem]: sugerido.destino }))}
                                  title="Clique para aplicar esta sugestão"
                                  style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'var(--gray-500)', textDecoration: 'underline', textDecorationColor: 'rgba(100,116,139,.4)', textUnderlineOffset: 2 }}>
                                  {sugerido.destino}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--gray-400)', borderTop: '1px solid var(--border)' }}>
                Ex.: mande <b>Carroceria</b> e <b>Carenagem (dianteira, lateral, traseira)</b> para <b>Carenagem</b>. As sugestões automáticas agrupam por nome parecido (“Outras Peças X” e “X (…)” → X) <b>e pela hierarquia da Nuvemshop</b> (subcategoria → categoria pai, ex.: Sensores/Faróis → Elétrica).
              </div>
            </div>
          )}
        </>}
      </div>

      {/* Drill-down de categoria */}
      {drillNome && (
        <div onClick={() => setDrillNome(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: 'min(880px, 100%)', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{drillNome}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{drillData ? `${drillData.itens.length} SKU(s)` : 'Carregando...'}</div>
              </div>
              <button onClick={() => setDrillNome(null)} style={{ border: 'none', background: 'var(--gray-100)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--gray-600)' }}>×</button>
            </div>
            <div style={{ overflow: 'auto', padding: 16 }}>
              {drillLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Carregando...</div>
              ) : drillData ? (
                <>
                  {drillData.serieMeses.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Vendas por mês</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '0 4px' }}>
                        {(() => { const max = Math.max(...drillData.serieMeses.map((m: any) => m.vendidas), 1); return drillData.serieMeses.map((m: any) => (
                          <div key={m.mes} title={`${m.mes}: ${m.vendidas} vendida(s) · ${fmtBRL(m.receita)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: '100%', maxWidth: 34, height: `${(m.vendidas / max) * 70}px`, minHeight: 3, background: '#7c3aed', borderRadius: '3px 3px 0 0' }} />
                            <span style={{ fontSize: 9, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{m.mes.slice(2)}</span>
                          </div>
                        )); })()}
                      </div>
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...s.th, width: 110 }}>SKU</th>
                      <th style={s.th}>Peça</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Estoque</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Vendidas</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Receita</th>
                      <th style={{ ...s.th, textAlign: 'right', width: 92 }}>Últ. venda</th>
                    </tr></thead>
                    <tbody>
                      {drillData.itens.map((it: any, i: number) => (
                        <tr key={it.sku} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{it.sku}</td>
                          <td style={{ ...s.td, fontSize: 12.5 }}>{it.descricao}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{it.emEstoque}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{it.vendidas}</td>
                          <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtBRL(it.receita)}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontSize: 12, color: 'var(--gray-500)' }}>{it.ultimaVenda ? new Date(it.ultimaVenda).toLocaleDateString('pt-BR') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
