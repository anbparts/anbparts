'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { printSkuLabels, type SkuEtiquetaPrintItem } from '@/lib/estoque-label-print';
import { opcoesCategoria, useCategoriasDespesa } from '@/lib/despesa-categorias';
import ModalImpressaoA4 from '@/app/components/ModalImpressaoA4';

// Empresa > Estrutura: cadastro dos ativos da empresa (codigo INV_0001...), ligacao com Investimento/Despesa,
// depreciacao e etiqueta de impressao (avulsa ou folha A4 de 21), igual ao estoque.
type Deprec = {
  metodo: string; vidaUtilAnos: number | null; taxaAnualPct: number | null; mensal: number; acumulada: number;
  valorAtual: number; pctDepreciado: number; mesesDecorridos: number; fimPrevisto: string; totalmenteDepreciado: boolean;
};
type DespesaVinc = { id: number; data: string; detalhes: string; categoria: string; valor: number; statusPagamento: string; origem: string };
type InvVinc = { id: number; data: string; socio: string; tipo: string; moto: string; valor: number };
type Ativo = {
  id: number; codigo: string; nome: string; categoria: string; descricao: string; localizacao: string; responsavel: string;
  fornecedor: string; marcaModelo: string; numeroSerie: string; notaFiscal: string; dataAquisicao: string; valor: number;
  status: string; dataBaixa: string; observacao: string; depMetodo: string; depAnos: number | null; depPct: number | null;
  valorResidual: number; depInicio: string; investimentoId: number | null; despesaId: number | null;
  depreciacao: Deprec; investimento: InvVinc | null; despesa: DespesaVinc | null;
};
type InvOpcao = InvVinc & { despesa: DespesaVinc | null; ativos: string[] };
type Form = {
  id?: number; codigo?: string; nome: string; categoria: string; descricao: string; localizacao: string; responsavel: string;
  fornecedor: string; marcaModelo: string; numeroSerie: string; notaFiscal: string; dataAquisicao: string; valor: string;
  status: string; dataBaixa: string; observacao: string; depMetodo: string; depAnos: string; depPct: string;
  valorResidual: string; depInicio: string; investimentoId: string;
};

const STATUS_INFO: Record<string, { label: string; cor: string; fundo: string; borda: string }> = {
  ativo: { label: 'Ativo', cor: '#15803d', fundo: '#f0fdf4', borda: '#86efac' },
  manutencao: { label: 'Em manutenção', cor: '#a16207', fundo: '#fef9c3', borda: '#fde047' },
  baixado: { label: 'Baixado', cor: '#6b7280', fundo: '#f3f4f6', borda: '#d1d5db' },
};
const CATEGORIAS_BASE = ['Ferramentas', 'Equipamentos', 'Máquinas', 'Móveis e utensílios', 'Informática', 'Eletrônicos', 'Veículos', 'Instalações e obras', 'Segurança e monitoramento', 'Estrutura de armazenagem', 'Outros'];

const cs: any = {
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)' },
  th: { padding: '10px 12px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
};

const brl = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtData = (iso: string) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : ''; };
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const FORM_VAZIO = (): Form => ({
  nome: '', categoria: '', descricao: '', localizacao: '', responsavel: '', fornecedor: '', marcaModelo: '', numeroSerie: '', notaFiscal: '',
  dataAquisicao: hojeISO(), valor: '', status: 'ativo', dataBaixa: '', observacao: '', depMetodo: 'nenhuma', depAnos: '', depPct: '',
  valorResidual: '', depInicio: '', investimentoId: '',
});

function paraForm(a: Ativo): Form {
  return {
    id: a.id, codigo: a.codigo, nome: a.nome, categoria: a.categoria, descricao: a.descricao, localizacao: a.localizacao, responsavel: a.responsavel,
    fornecedor: a.fornecedor, marcaModelo: a.marcaModelo, numeroSerie: a.numeroSerie, notaFiscal: a.notaFiscal, dataAquisicao: a.dataAquisicao,
    valor: a.valor ? String(a.valor).replace('.', ',') : '', status: a.status, dataBaixa: a.dataBaixa, observacao: a.observacao,
    depMetodo: a.depMetodo, depAnos: a.depAnos != null ? String(a.depAnos).replace('.', ',') : '', depPct: a.depPct != null ? String(a.depPct).replace('.', ',') : '',
    valorResidual: a.valorResidual ? String(a.valorResidual).replace('.', ',') : '', depInicio: a.depInicio, investimentoId: a.investimentoId != null ? String(a.investimentoId) : '',
  };
}

function itemEtiqueta(a: Ativo): SkuEtiquetaPrintItem {
  return { rotulo: 'Ativo', motoLabel: (a.categoria || 'SEM CATEGORIA').toUpperCase(), sku: a.codigo, descricao: a.nome };
}

async function chamar(caminho: string, opcoes?: RequestInit) {
  const r = await fetch(`${API_BASE}${caminho}`, { credentials: 'include', ...opcoes, headers: opcoes?.body ? { 'Content-Type': 'application/json' } : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.ok === false) throw new Error(d?.error || d?.message || `Erro ${r.status}`);
  return d;
}

export default function EstruturaTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const [itens, setItens] = useState<Ativo[]>([]);
  const [investimentos, setInvestimentos] = useState<InvOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [despesaModal, setDespesaModal] = useState<{ ativo: Ativo; categoria: string; detalhes: string; salvando: boolean } | null>(null);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [modalA4, setModalA4] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const { categorias: catDespesa, grupos: gruposDespesa } = useCategoriasDespesa();

  const [busca, setBusca] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fLocal, setFLocal] = useState('');
  const [fVinculo, setFVinculo] = useState('');
  const [fDeprec, setFDeprec] = useState('');
  const [fAno, setFAno] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const [a, i] = await Promise.all([chamar('/ativos'), chamar('/ativos/investimentos')]);
      setItens(a.itens || []);
      setInvestimentos(i.itens || []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar os ativos');
    }
    setCarregando(false);
  }
  useEffect(() => { void carregar(); }, []);

  const categoriasLista = useMemo(() => {
    const m: Record<string, string> = {};
    [...CATEGORIAS_BASE, ...itens.map((a) => a.categoria)].forEach((c) => { const t = String(c || '').trim(); if (t && !m[semAcento(t)]) m[semAcento(t)] = t; });
    return Object.keys(m).map((k) => m[k]).sort((x, y) => x.localeCompare(y, 'pt-BR', { sensitivity: 'base' }));
  }, [itens]);
  const locaisLista = useMemo(() => Array.from(new Set<string>(itens.map((a) => a.localizacao).filter(Boolean))).sort((x, y) => x.localeCompare(y, 'pt-BR')), [itens]);
  const anosLista = useMemo(() => Array.from(new Set<string>(itens.map((a) => a.dataAquisicao.slice(0, 4)).filter(Boolean))).sort().reverse(), [itens]);

  const filtrados = useMemo(() => {
    const q = semAcento(busca);
    return itens.filter((a) => {
      if (q) {
        const alvo = semAcento([a.codigo, a.nome, a.categoria, a.localizacao, a.responsavel, a.fornecedor, a.marcaModelo, a.numeroSerie, a.notaFiscal, a.descricao].join(' '));
        if (!alvo.includes(q)) return false;
      }
      if (fCategoria && a.categoria !== fCategoria) return false;
      if (fStatus && a.status !== fStatus) return false;
      if (fLocal && a.localizacao !== fLocal) return false;
      if (fAno && !a.dataAquisicao.startsWith(fAno)) return false;
      if (fVinculo === 'sem_inv' && a.investimentoId != null) return false;
      if (fVinculo === 'com_inv' && a.investimentoId == null) return false;
      if (fVinculo === 'inv_sem_despesa' && !(a.investimentoId != null && !a.despesa)) return false;
      if (fVinculo === 'com_despesa' && !a.despesa) return false;
      if (fDeprec === 'sem' && a.depMetodo !== 'nenhuma') return false;
      if (fDeprec === 'depreciando' && !(a.depMetodo !== 'nenhuma' && !a.depreciacao.totalmenteDepreciado)) return false;
      if (fDeprec === 'total' && !a.depreciacao.totalmenteDepreciado) return false;
      return true;
    });
  }, [itens, busca, fCategoria, fStatus, fLocal, fVinculo, fDeprec, fAno]);

  const totais = useMemo(() => {
    const base = filtrados;
    return {
      qtd: base.length,
      aquisicao: base.reduce((s, a) => s + a.valor, 0),
      depreciado: base.reduce((s, a) => s + a.depreciacao.acumulada, 0),
      atual: base.reduce((s, a) => s + a.depreciacao.valorAtual, 0),
      semInv: base.filter((a) => a.investimentoId == null).length,
      invSemDespesa: base.filter((a) => a.investimentoId != null && !a.despesa).length,
    };
  }, [filtrados]);

  const selecionadosAtivos = useMemo(() => itens.filter((a) => selecionados.includes(a.id)), [itens, selecionados]);
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => selecionados.includes(a.id));
  const limparFiltros = () => { setBusca(''); setFCategoria(''); setFStatus(''); setFLocal(''); setFVinculo(''); setFDeprec(''); setFAno(''); };
  const temFiltro = Boolean(busca || fCategoria || fStatus || fLocal || fVinculo || fDeprec || fAno);

  function alternar(id: number) { setSelecionados((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); }
  function alternarTodos() {
    setSelecionados((cur) => (todosMarcados ? cur.filter((id) => !filtrados.some((a) => a.id === id)) : Array.from(new Set<number>([...cur, ...filtrados.map((a) => a.id)]))));
  }

  async function imprimirAvulsa(lista: Ativo[]) {
    if (!lista.length) { alert('Selecione os ativos para imprimir as etiquetas.'); return; }
    setImprimindo(true);
    try { await printSkuLabels(lista.map(itemEtiqueta)); } catch (e: any) { alert(`Erro ao imprimir etiquetas: ${e?.message || e}`); }
    setImprimindo(false);
  }

  function escolherInvestimento(idTxt: string) {
    setForm((f) => {
      if (!f) return f;
      const inv = investimentos.find((i) => String(i.id) === idTxt);
      const next = { ...f, investimentoId: idTxt };
      if (inv) {
        if (!f.valor) next.valor = String(inv.valor).replace('.', ',');
        if (!f.dataAquisicao || f.dataAquisicao === hojeISO()) next.dataAquisicao = inv.data;
      }
      return next;
    });
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) { alert('Informe o nome do ativo.'); return; }
    setSalvando(true);
    try {
      const corpo = JSON.stringify(form);
      const d = form.id
        ? await chamar(`/ativos/${form.id}`, { method: 'PUT', body: corpo })
        : await chamar('/ativos', { method: 'POST', body: corpo });
      setForm(null);
      await carregar();
      if (!form.id && d?.item?.codigo) alert(`Ativo cadastrado com o código ${d.item.codigo}.`);
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar o ativo');
    }
    setSalvando(false);
  }

  async function excluir(a: Ativo) {
    if (!window.confirm(`Excluir o ativo ${a.codigo} · ${a.nome}?\n\nO investimento e a despesa ligados NÃO são apagados.`)) return;
    try {
      await chamar(`/ativos/${a.id}`, { method: 'DELETE' });
      setSelecionados((cur) => cur.filter((x) => x !== a.id));
      await carregar();
    } catch (e: any) { alert(e?.message || 'Erro ao excluir'); }
  }

  function abrirLancarDespesa(a: Ativo) {
    const inv = investimentos.find((i) => i.id === a.investimentoId);
    const irmaos = inv?.ativos?.length ? inv.ativos : [a.codigo];
    setDespesaModal({ ativo: a, categoria: '', detalhes: `Investimento · ${irmaos.join(', ')}${irmaos.length === 1 ? ` · ${a.nome}` : ''}`, salvando: false });
  }

  async function confirmarLancarDespesa() {
    if (!despesaModal) return;
    if (!despesaModal.categoria) { alert('Escolha a categoria da despesa.'); return; }
    setDespesaModal({ ...despesaModal, salvando: true });
    try {
      await chamar(`/ativos/${despesaModal.ativo.id}/lancar-despesa`, { method: 'POST', body: JSON.stringify({ categoria: despesaModal.categoria, detalhes: despesaModal.detalhes }) });
      setDespesaModal(null);
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao lançar a despesa');
      setDespesaModal((m) => (m ? { ...m, salvando: false } : m));
    }
  }

  const badge = (texto: string, cor: string, fundo: string, borda: string, title?: string) => (
    <span title={title} style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: cor, background: fundo, border: `1px solid ${borda}`, whiteSpace: 'nowrap' }}>{texto}</span>
  );

  function celulaVinculo(a: Ativo) {
    if (a.investimentoId == null) return badge('Sem investimento', '#6b7280', '#f3f4f6', '#d1d5db');
    return (
      <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
        {badge(`Investimento #${a.investimentoId}`, '#1d4ed8', '#eff6ff', '#bfdbfe', a.investimento ? `${fmtData(a.investimento.data)} · ${a.investimento.socio} · ${brl(a.investimento.valor)}` : '')}
        {a.despesa
          ? badge(`Despesa #${a.despesa.id}${a.despesa.origem === 'automatica' ? ' · automática' : ''}`, '#15803d', '#f0fdf4', '#86efac', `${fmtData(a.despesa.data)} · ${a.despesa.categoria} · ${brl(a.despesa.valor)}`)
          : canEdit
            ? <button type="button" onClick={() => abrirLancarDespesa(a)} style={{ ...cs.btn, padding: '3px 10px', fontSize: 11, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Lançar despesa</button>
            : badge('Sem despesa', '#c2410c', '#fff7ed', '#fed7aa')}
      </div>
    );
  }

  function celulaValor(a: Ativo) {
    const d = a.depreciacao;
    return (
      <div style={{ lineHeight: 1.45 }}>
        <div style={{ fontWeight: 600 }}>{brl(a.valor)}</div>
        {a.depMetodo !== 'nenhuma' ? (
          <div style={{ fontSize: 11.5, color: d.totalmenteDepreciado ? '#6b7280' : 'var(--ink-muted)' }} title={`Depreciação ${d.taxaAnualPct}% a.a. · ${d.vidaUtilAnos} anos · fim previsto ${fmtData(d.fimPrevisto)}`}>
            Atual {brl(d.valorAtual)} · {d.pctDepreciado.toLocaleString('pt-BR')}%
          </div>
        ) : null}
      </div>
    );
  }

  const acoes = (a: Ativo) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => imprimirAvulsa([a])} disabled={imprimindo} title="Imprimir etiqueta avulsa" style={{ ...cs.btn, padding: '5px 10px', fontSize: 11.5, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Etiqueta</button>
      {canEdit ? <button type="button" onClick={() => setForm(paraForm(a))} style={{ ...cs.btn, padding: '5px 10px', fontSize: 11.5, background: 'var(--white)', color: 'var(--blue-500)', border: '1px solid var(--border)' }}>Editar</button> : null}
      {canEdit ? <button type="button" onClick={() => excluir(a)} style={{ ...cs.btn, padding: '5px 10px', fontSize: 11.5, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}>Excluir</button> : null}
    </div>
  );

  const kpi = (rotulo: string, valor: string, destaque?: string) => (
    <div style={{ ...cs.card, padding: '12px 16px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', fontFamily: 'Geist Mono, monospace' }}>{rotulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: destaque || 'var(--ink)' }}>{valor}</div>
    </div>
  );

  const campoForm = (rotulo: string, chave: keyof Form, props: any = {}) => (
    <div>
      <label style={cs.fl}>{rotulo}</label>
      <input style={cs.fi} value={(form as any)?.[chave] ?? ''} onChange={(e) => setForm((f) => (f ? { ...f, [chave]: e.target.value } : f))} {...props} />
    </div>
  );

  const invSelecionado = form ? investimentos.find((i) => String(i.id) === form.investimentoId) : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Estrutura · ativos da empresa</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Tudo o que a empresa comprou para operar: código INV_XXXX, ligação com investimento e despesa, depreciação e etiqueta.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={!selecionados.length || imprimindo} onClick={() => imprimirAvulsa(selecionadosAtivos)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)', opacity: selecionados.length ? 1 : 0.55 }}>
            {imprimindo ? 'Gerando...' : `Etiqueta avulsa${selecionados.length ? ` (${selecionados.length})` : ''}`}
          </button>
          <button type="button" disabled={!selecionados.length} onClick={() => setModalA4(true)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)', opacity: selecionados.length ? 1 : 0.55 }}>
            Impressão A4{selecionados.length ? ` (${selecionados.length})` : ''}
          </button>
          {canEdit ? <button type="button" onClick={() => setForm(FORM_VAZIO())} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }}>+ Novo ativo</button> : null}
        </div>
      </div>

      {erro ? <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi(temFiltro ? 'Ativos (filtro)' : 'Ativos', String(totais.qtd))}
        {kpi('Valor de aquisição', brl(totais.aquisicao))}
        {kpi('Depreciação acumulada', brl(totais.depreciado))}
        {kpi('Valor atual', brl(totais.atual), '#0f766e')}
        {kpi('Sem investimento', String(totais.semInv), totais.semInv ? '#6b7280' : undefined)}
        {kpi('Invest. sem despesa', String(totais.invSemDespesa), totais.invSemDespesa ? '#c2410c' : undefined)}
      </div>

      <div style={{ ...cs.card, padding: 14, display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div style={{ gridColumn: isPhone ? '1 / -1' : 'span 2' }}>
          <label style={cs.fl}>Buscar</label>
          <input style={cs.fi} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome, série, fornecedor, local..." />
        </div>
        <div><label style={cs.fl}>Categoria</label>
          <select style={cs.fi} value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}><option value="">Todas</option>{categoriasLista.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label style={cs.fl}>Status</label>
          <select style={cs.fi} value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos</option>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label style={cs.fl}>Local</label>
          <select style={cs.fi} value={fLocal} onChange={(e) => setFLocal(e.target.value)}><option value="">Todos</option>{locaisLista.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label style={cs.fl}>Vínculo</label>
          <select style={cs.fi} value={fVinculo} onChange={(e) => setFVinculo(e.target.value)}>
            <option value="">Todos</option><option value="com_inv">Com investimento</option><option value="sem_inv">Sem investimento</option>
            <option value="com_despesa">Com despesa</option><option value="inv_sem_despesa">Investimento sem despesa</option>
          </select></div>
        <div><label style={cs.fl}>Depreciação</label>
          <select style={cs.fi} value={fDeprec} onChange={(e) => setFDeprec(e.target.value)}>
            <option value="">Todas</option><option value="depreciando">Depreciando</option><option value="total">Totalmente depreciado</option><option value="sem">Sem depreciação</option>
          </select></div>
        <div><label style={cs.fl}>Ano da compra</label>
          <select style={cs.fi} value={fAno} onChange={(e) => setFAno(e.target.value)}><option value="">Todos</option>{anosLista.map((c) => <option key={c}>{c}</option>)}</select></div>
        {temFiltro ? <button type="button" onClick={limparFiltros} style={{ ...cs.btn, padding: '9px 14px', background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Limpar filtros</button> : null}
      </div>

      {carregando ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Carregando ativos...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...cs.card, padding: 28, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
          {itens.length === 0 ? 'Nenhum ativo cadastrado ainda. Clique em “+ Novo ativo” para lançar o primeiro (INV_0001).' : 'Nenhum ativo encontrado com esses filtros.'}
        </div>
      ) : isPhone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtrados.map((a) => {
            const st = STATUS_INFO[a.status] || STATUS_INFO.ativo;
            return (
              <div key={a.id} style={{ ...cs.card, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={selecionados.includes(a.id)} onChange={() => alternar(a.id)} style={{ marginTop: 3 }} />
                    <span><span style={{ fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--blue-500)' }}>{a.codigo}</span><br /><span style={{ fontWeight: 600 }}>{a.nome}</span></span>
                  </label>
                  {badge(st.label, st.cor, st.fundo, st.borda)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{[a.categoria, a.localizacao, fmtData(a.dataAquisicao)].filter(Boolean).join(' · ')}</div>
                {celulaValor(a)}
                {celulaVinculo(a)}
                {acoes(a)}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...cs.card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ ...cs.th, width: 34 }}><input type="checkbox" checked={todosMarcados} onChange={alternarTodos} title="Selecionar todos do filtro" /></th>
                  {['Código', 'Ativo', 'Local', 'Compra', 'Valor / atual', 'Status', 'Investimento / despesa', ''].map((h) => <th key={h} style={cs.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => {
                  const st = STATUS_INFO[a.status] || STATUS_INFO.ativo;
                  return (
                    <tr key={a.id} style={{ background: selecionados.includes(a.id) ? '#f8fafc' : undefined }}>
                      <td style={cs.td}><input type="checkbox" checked={selecionados.includes(a.id)} onChange={() => alternar(a.id)} /></td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>{a.codigo}</td>
                      <td style={cs.td}>
                        <div style={{ fontWeight: 600 }}>{a.nome}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{[a.categoria, a.marcaModelo, a.numeroSerie ? `S/N ${a.numeroSerie}` : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={cs.td}>{a.localizacao || '—'}</td>
                      <td style={{ ...cs.td, whiteSpace: 'nowrap' }}>{fmtData(a.dataAquisicao) || '—'}</td>
                      <td style={{ ...cs.td, whiteSpace: 'nowrap' }}>{celulaValor(a)}</td>
                      <td style={cs.td}>{badge(st.label, st.cor, st.fundo, st.borda)}</td>
                      <td style={cs.td}>{celulaVinculo(a)}</td>
                      <td style={cs.td}>{acoes(a)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalA4 && <ModalImpressaoA4 etiquetas={selecionadosAtivos.map(itemEtiqueta)} onClose={() => setModalA4(false)} />}

      {form && (
        <div onClick={() => !salvando && setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: 820, maxHeight: isPhone ? '100dvh' : '92vh', height: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? `Editar ativo ${form.codigo}` : 'Novo ativo'}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{form.id ? 'O código não muda.' : 'O código INV_XXXX (sequencial) é gerado ao salvar.'}</div>
              </div>
              <button type="button" onClick={() => setForm(null)} aria-label="Fechar" style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
            </div>

            <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
                <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>{campoForm('Nome do ativo *', 'nome', { placeholder: 'Ex.: Compressor de ar 100L' })}</div>
                <div>
                  <label style={cs.fl}>Categoria</label>
                  <input style={cs.fi} list="estrutura-categorias" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Ferramentas" />
                  <datalist id="estrutura-categorias">{categoriasLista.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={cs.fl}>Status</label>
                  <select style={cs.fi} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                </div>
                {campoForm('Local / onde fica', 'localizacao', { placeholder: 'Ex.: Galpão, Escritório' })}
                {campoForm('Responsável', 'responsavel')}
                {campoForm('Marca / modelo', 'marcaModelo')}
                {campoForm('Nº de série', 'numeroSerie')}
                {campoForm('Fornecedor', 'fornecedor')}
                {campoForm('Nota fiscal', 'notaFiscal')}
                {campoForm('Data da compra', 'dataAquisicao', { type: 'date' })}
                {campoForm('Valor pago (R$)', 'valor', { inputMode: 'decimal', placeholder: '0,00' })}
                {form.status === 'baixado' ? campoForm('Data da baixa', 'dataBaixa', { type: 'date' }) : null}
                <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                  <label style={cs.fl}>Observações</label>
                  <textarea style={{ ...cs.fi, minHeight: 60, resize: 'vertical' }} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Investimento e despesa</div>
                <div>
                  <label style={cs.fl}>Investimento ligado</label>
                  <select style={cs.fi} value={form.investimentoId} onChange={(e) => escolherInvestimento(e.target.value)}>
                    <option value="">Sem investimento</option>
                    {investimentos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {`#${i.id} · ${fmtData(i.data)} · ${i.socio} · ${i.tipo} · ${brl(i.valor)}${i.ativos.length ? ` · já em ${i.ativos.filter((c) => c !== form.codigo).join(', ') || 'este ativo'}` : ''}${i.despesa ? ' · c/ despesa' : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
                {invSelecionado ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                    {invSelecionado.despesa
                      ? <>Despesa #{invSelecionado.despesa.id} ({invSelecionado.despesa.categoria}, {brl(invSelecionado.despesa.valor)}) {invSelecionado.despesa.origem === 'automatica' ? 'já lançada pelo Investimentos — puxada automaticamente.' : 'já lançada por este cadastro.'}</>
                      : <>Este investimento ainda não tem despesa. Salve o ativo e use o botão <b>Lançar despesa</b> na lista para criá-la ligada a ele.</>}
                  </div>
                ) : null}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Depreciação (linear)</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Método</label>
                    <select style={cs.fi} value={form.depMetodo} onChange={(e) => setForm({ ...form, depMetodo: e.target.value })}>
                      <option value="nenhuma">Sem depreciação</option>
                      <option value="linear_anos">Vida útil em anos</option>
                      <option value="linear_pct">% ao ano</option>
                    </select>
                  </div>
                  {form.depMetodo === 'linear_anos' ? campoForm('Vida útil (anos)', 'depAnos', { inputMode: 'decimal', placeholder: 'Ex.: 5' }) : null}
                  {form.depMetodo === 'linear_pct' ? campoForm('Taxa (% ao ano)', 'depPct', { inputMode: 'decimal', placeholder: 'Ex.: 10' }) : null}
                  {form.depMetodo !== 'nenhuma' ? campoForm('Valor residual (R$)', 'valorResidual', { inputMode: 'decimal', placeholder: '0,00' }) : null}
                  {form.depMetodo !== 'nenhuma' ? (
                    <div>
                      <label style={cs.fl}>Início da depreciação</label>
                      <input style={cs.fi} type="date" value={form.depInicio} onChange={(e) => setForm({ ...form, depInicio: e.target.value })} />
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>Em branco = data da compra.</div>
                    </div>
                  ) : null}
                </div>
                {form.depMetodo !== 'nenhuma' ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    Depreciação mensal = (valor − residual) ÷ (vida útil × 12). A vida útil em anos e o % ao ano são equivalentes (10% = 10 anos).
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setForm(null)} disabled={salvando} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button type="button" onClick={salvar} disabled={salvando} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Cadastrar ativo'}</button>
            </div>
          </div>
        </div>
      )}

      {despesaModal && (() => {
        const inv = investimentos.find((i) => i.id === despesaModal.ativo.investimentoId);
        return (
          <div onClick={() => !despesaModal.salvando && setDespesaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 480, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Lançar despesa do investimento</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Cria uma despesa <b>paga</b> com a mesma data e o mesmo valor do investimento{inv ? <> #{inv.id} ({fmtData(inv.data)} · {brl(inv.valor)})</> : null} e liga ao ativo <b>{despesaModal.ativo.codigo}</b>
                {inv && inv.ativos.length > 1 ? <> e aos outros ativos desse investimento ({inv.ativos.filter((c) => c !== despesaModal.ativo.codigo).join(', ')})</> : null}.
              </div>
              <label style={{ ...cs.fl, display: 'block', marginTop: 14 }}>Categoria da despesa
                <select style={cs.fi} value={despesaModal.categoria} onChange={(e) => setDespesaModal({ ...despesaModal, categoria: e.target.value })}>
                  <option value="">Selecione a categoria</option>
                  {opcoesCategoria(catDespesa, gruposDespesa)}
                </select>
              </label>
              <label style={{ ...cs.fl, display: 'block', marginTop: 12 }}>Detalhes
                <input style={cs.fi} value={despesaModal.detalhes} onChange={(e) => setDespesaModal({ ...despesaModal, detalhes: e.target.value })} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button type="button" onClick={() => setDespesaModal(null)} disabled={despesaModal.salvando} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button type="button" onClick={confirmarLancarDespesa} disabled={despesaModal.salvando || !despesaModal.categoria} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: despesaModal.salvando || !despesaModal.categoria ? 0.6 : 1 }}>
                  {despesaModal.salvando ? 'Lançando...' : 'Lançar despesa'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
