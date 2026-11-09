'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

// Empresa > Solicitações: pedidos de peças que clientes/oficinas fazem e que a gente não tinha (vendas perdidas).
// Cadastro + painel do mês (receita oculta, ticket médio, % de ruptura, rankings por montadora/peça/canal/cliente).
type Status = 'perdida' | 'em_busca' | 'atendida';
type Solicitacao = {
  id: number;
  data: string; // YYYY-MM-DD
  montadora: string;
  moto: string;
  ano: string;
  peca: string;
  valorEstimado: number;
  solicitante: string;
  telefone: string;
  canal: string;
  tipoCliente: string;
  referenciaInterna: string;
  observacao: string;
  status: Status;
};
type Form = Omit<Solicitacao, 'id'> & { id?: number; valorTexto: string };
type Vendidos = Record<string, { manual: number | null; sistema: number }>;

const STATUS_INFO: Record<Status, { label: string; cor: string; fundo: string; borda: string }> = {
  perdida: { label: 'Perdida', cor: '#b91c1c', fundo: '#fef2f2', borda: '#fecaca' },
  em_busca: { label: 'Em busca', cor: '#a16207', fundo: '#fef9c3', borda: '#fde047' },
  atendida: { label: 'Atendida', cor: '#15803d', fundo: '#f0fdf4', borda: '#86efac' },
};
const STATUS_LISTA: Status[] = ['perdida', 'em_busca', 'atendida'];
const MONTADORAS_BASE = ['Harley Davidson', 'BMW', 'Triumph', 'Yamaha', 'Honda', 'Kawasaki', 'Suzuki', 'Ducati'];
const CANAIS_BASE = ['Whatsapp', 'OLX', 'Instagram', 'Telefone', 'Presencial', 'Mercado Livre', 'Site'];
const TIPOS_BASE = ['Oficina', 'Consumidor Final', 'Lojista'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const PALETA = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#64748b'];

const cs: any = {
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 6, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)' },
  th: { padding: '10px 12px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' },
  td: { padding: '11px 12px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
};

function brl(v: number) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function brl0(v: number) { return `R$ ${Math.round(Number(v || 0)).toLocaleString('pt-BR')}`; }
function pct(v: number | null) { return v == null || !isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtData(iso: string) { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : iso; }
function nomeMes(m: string) { const [a, n] = m.split('-'); return `${MESES[Number(n) - 1] || m} de ${a}`; }
function mesCurto(m: string) { const [a, n] = m.split('-'); return `${MESES_CURTO[Number(n) - 1] || m}/${String(a).slice(2)}`; }
function deslocaMes(m: string, delta: number) {
  const [a, n] = m.split('-').map(Number);
  const d = new Date(a, n - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function semAcento(s: string) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function digitos(v: string) { return String(v || '').replace(/\D/g, ''); }
function linkWhatsapp(tel: string) {
  const d = digitos(tel);
  if (d.length < 10) return '';
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}
function unicos(lista: string[]) {
  const m: Record<string, string> = {};
  lista.forEach((x) => { const t = String(x || '').trim(); if (t && !m[semAcento(t)]) m[semAcento(t)] = t; });
  return Object.keys(m).map((k) => m[k]).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}
function motoTitulo(s: Solicitacao) { return [s.montadora, s.moto].filter(Boolean).join(' ') || '—'; }

type Grupo = { chave: string; nome: string; n: number; valor: number };
function agrupar(lista: Solicitacao[], chaveDe: (s: Solicitacao) => string): Grupo[] {
  const m: Record<string, Grupo> = {};
  lista.forEach((s) => {
    const nome = chaveDe(s);
    if (!nome) return;
    const k = semAcento(nome);
    if (!m[k]) m[k] = { chave: k, nome, n: 0, valor: 0 };
    m[k].n += 1;
    m[k].valor += s.valorEstimado;
  });
  return Object.keys(m).map((k) => m[k]).sort((a, b) => (b.valor - a.valor) || (b.n - a.n) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const FORM_VAZIO = (): Form => ({
  data: hojeISO(), montadora: '', moto: '', ano: '', peca: '', valorEstimado: 0, valorTexto: '', solicitante: '', telefone: '',
  canal: 'Whatsapp', tipoCliente: '', referenciaInterna: '', observacao: '', status: 'perdida',
});

export default function SolicitacoesTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const API = API_BASE;
  const [itens, setItens] = useState<Solicitacao[]>([]);
  const [vendidos, setVendidos] = useState<Vendidos>({});
  const [oficinas, setOficinas] = useState<Array<{ nome: string; telefone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mes, setMes] = useState<string>(''); // '' = todo o período
  const [mesInicializado, setMesInicializado] = useState(false);
  const [avisoMes, setAvisoMes] = useState('');
  const [busca, setBusca] = useState('');
  const [fMontadora, setFMontadora] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCanal, setFCanal] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [editando, setEditando] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [excluindo, setExcluindo] = useState<number | null>(null);

  async function carregar() {
    setLoading(true);
    setErro('');
    try {
      const r = await fetch(`${API}/solicitacoes`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao carregar solicitações');
      setItens(d.itens || []);
      setVendidos(d.vendidos || {});
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar solicitações');
    }
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    fetch(`${API}/oficinas`, { credentials: 'include' }).then((r) => r.json()).then((d) => {
      if (d?.ok && Array.isArray(d.itens)) setOficinas(d.itens.map((o: any) => ({ nome: String(o.nome || ''), telefone: Array.isArray(o.telefones) ? String(o.telefones[0] || '') : '' })));
    }).catch(() => { /* autocomplete e' opcional */ });
  }, []);

  // 1ª carga: abre no mês corrente; se ele ainda não tem solicitações, abre no último mês com dados.
  useEffect(() => {
    if (loading || mesInicializado) return;
    setMesInicializado(true);
    const atual = hojeISO().slice(0, 7);
    if (!itens.length || itens.some((i) => i.data.slice(0, 7) === atual)) { setMes(atual); return; }
    const ultimo = itens.reduce((mx, i) => (i.data > mx ? i.data : mx), '').slice(0, 7);
    setMes(ultimo || atual);
    setAvisoMes(`${nomeMes(atual)} ainda não tem solicitações — mostrando ${nomeMes(ultimo || atual)}.`);
  }, [loading, itens, mesInicializado]);

  const todosMeses = useMemo(() => {
    const m: Record<string, true> = {};
    itens.forEach((i) => { m[i.data.slice(0, 7)] = true; });
    Object.keys(vendidos).forEach((k) => { m[k] = true; });
    return Object.keys(m).sort();
  }, [itens, vendidos]);

  function pecasVendidasDo(m: string) { const v = vendidos[m]; return v ? (v.manual != null ? v.manual : v.sistema) : 0; }

  const noPeriodo = useMemo(() => (mes ? itens.filter((i) => i.data.slice(0, 7) === mes) : itens), [itens, mes]);

  function resumo(lista: Solicitacao[], periodo: string) {
    const perdidas = lista.filter((i) => i.status === 'perdida');
    const receita = perdidas.reduce((s, i) => s + i.valorEstimado, 0);
    let vendidas = 0;
    let perdidasComBase = perdidas.length;
    if (periodo) vendidas = pecasVendidasDo(periodo);
    else {
      const meses = todosMeses.filter((m) => pecasVendidasDo(m) > 0);
      vendidas = meses.reduce((s, m) => s + pecasVendidasDo(m), 0);
      perdidasComBase = perdidas.filter((i) => meses.indexOf(i.data.slice(0, 7)) >= 0).length;
    }
    return {
      total: lista.length, perdidas: perdidas.length, emBusca: lista.filter((i) => i.status === 'em_busca').length,
      atendidas: lista.filter((i) => i.status === 'atendida').length, receita,
      ticket: perdidas.length ? receita / perdidas.length : 0, vendidas,
      ruptura: vendidas > 0 ? perdidasComBase / vendidas : null,
      valorTotal: lista.reduce((s, i) => s + i.valorEstimado, 0),
    };
  }
  const R = useMemo(() => resumo(noPeriodo, mes), [noPeriodo, mes, vendidos, todosMeses]);
  const Rant = useMemo(() => {
    if (!mes) return null;
    const ant = deslocaMes(mes, -1);
    return resumo(itens.filter((i) => i.data.slice(0, 7) === ant), ant);
  }, [itens, mes, vendidos, todosMeses]);

  const serie = useMemo(() => {
    const meses = todosMeses.slice(-8);
    return meses.map((m) => { const r = resumo(itens.filter((i) => i.data.slice(0, 7) === m), m); return { mes: m, receita: r.receita, perdidas: r.perdidas, ruptura: r.ruptura }; });
  }, [itens, todosMeses, vendidos]);
  const maxReceita = Math.max(1, ...serie.map((s) => s.receita));

  const porMontadora = useMemo(() => agrupar(noPeriodo, (s) => s.montadora), [noPeriodo]);
  const porPeca = useMemo(() => agrupar(noPeriodo, (s) => s.peca), [noPeriodo]);
  const porMoto = useMemo(() => agrupar(noPeriodo, (s) => [s.montadora, s.moto].filter(Boolean).join(' ')), [noPeriodo]);
  const porCanal = useMemo(() => agrupar(noPeriodo, (s) => s.canal || 'Não informado'), [noPeriodo]);
  const porTipo = useMemo(() => agrupar(noPeriodo, (s) => s.tipoCliente || 'Não informado'), [noPeriodo]);
  const recorrentes = useMemo(() => agrupar(noPeriodo.filter((s) => s.solicitante), (s) => s.solicitante).filter((g) => g.n >= 2), [noPeriodo]);

  const filtrados = useMemo(() => {
    const q = semAcento(busca);
    return noPeriodo.filter((i) => {
      if (fMontadora && semAcento(i.montadora) !== semAcento(fMontadora)) return false;
      if (fStatus && i.status !== fStatus) return false;
      if (fCanal && semAcento(i.canal) !== semAcento(fCanal)) return false;
      if (fTipo && semAcento(i.tipoCliente) !== semAcento(fTipo)) return false;
      if (!q) return true;
      return semAcento([i.peca, i.montadora, i.moto, i.ano, i.solicitante, i.telefone, i.referenciaInterna, i.observacao, i.canal].join(' ')).indexOf(q) >= 0;
    });
  }, [noPeriodo, busca, fMontadora, fStatus, fCanal, fTipo]);

  const opMontadoras = useMemo(() => unicos(MONTADORAS_BASE.concat(itens.map((i) => i.montadora))), [itens]);
  const opCanais = useMemo(() => unicos(CANAIS_BASE.concat(itens.map((i) => i.canal))), [itens]);
  const opTipos = useMemo(() => unicos(TIPOS_BASE.concat(itens.map((i) => i.tipoCliente))), [itens]);
  const opSolicitantes = useMemo(() => {
    const m: Record<string, { nome: string; telefone: string; tipo: string }> = {};
    oficinas.forEach((o) => { if (o.nome) m[semAcento(o.nome)] = { nome: o.nome, telefone: o.telefone, tipo: 'Oficina' }; });
    itens.forEach((i) => { if (i.solicitante) { const k = semAcento(i.solicitante); m[k] = { nome: i.solicitante, telefone: i.telefone || (m[k]?.telefone || ''), tipo: i.tipoCliente || (m[k]?.tipo || '') }; } });
    return Object.keys(m).map((k) => m[k]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  }, [oficinas, itens]);

  function novo() { setErroForm(''); setEditando(FORM_VAZIO()); }
  function editar(s: Solicitacao) { setErroForm(''); setEditando({ ...s, valorTexto: s.valorEstimado ? String(s.valorEstimado).replace('.', ',') : '' }); }
  function duplicar(s: Solicitacao) { setErroForm(''); setEditando({ ...s, id: undefined, data: hojeISO(), valorTexto: s.valorEstimado ? String(s.valorEstimado).replace('.', ',') : '', status: 'perdida' }); }
  function setCampo(campo: string, valor: any) { setEditando((e) => (e ? { ...e, [campo]: valor } : e)); }

  function escolherSolicitante(nome: string) {
    setEditando((e) => {
      if (!e) return e;
      const achou = opSolicitantes.filter((o) => semAcento(o.nome) === semAcento(nome))[0];
      if (!achou) return { ...e, solicitante: nome };
      return { ...e, solicitante: achou.nome, telefone: e.telefone || achou.telefone, tipoCliente: e.tipoCliente || achou.tipo };
    });
  }

  async function salvar() {
    if (!editando) return;
    if (!editando.peca.trim()) { setErroForm('Informe a peça solicitada.'); return; }
    const valor = Number(String(editando.valorTexto || '').replace(/\./g, '').replace(',', '.')) || 0;
    setSalvando(true);
    setErroForm('');
    try {
      const corpo = { ...editando, valorEstimado: valor };
      const r = await fetch(editando.id ? `${API}/solicitacoes/${editando.id}` : `${API}/solicitacoes`, {
        method: editando.id ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao salvar');
      setEditando(null);
      if (d.item?.data) setMes((m) => (m && d.item.data.slice(0, 7) !== m ? d.item.data.slice(0, 7) : m));
      setAvisoMes('');
      await carregar();
    } catch (e: any) {
      setErroForm(e?.message || 'Erro ao salvar');
    }
    setSalvando(false);
  }

  async function mudarStatus(s: Solicitacao, status: Status) {
    const antes = itens;
    setItens((cur) => cur.map((i) => (i.id === s.id ? { ...i, status } : i)));
    try {
      const r = await fetch(`${API}/solicitacoes/${s.id}/status`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao atualizar status');
    } catch (e: any) {
      setItens(antes);
      alert(e?.message || 'Erro ao atualizar status');
    }
  }

  async function excluir(s: Solicitacao) {
    if (!window.confirm(`Excluir a solicitação "${s.peca}"${s.solicitante ? ` de ${s.solicitante}` : ''}? Isso não pode ser desfeito.`)) return;
    setExcluindo(s.id);
    try {
      const r = await fetch(`${API}/solicitacoes/${s.id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao excluir');
      setItens((cur) => cur.filter((i) => i.id !== s.id));
    } catch (e: any) {
      alert(e?.message || 'Erro ao excluir');
    }
    setExcluindo(null);
  }

  async function ajustarPecasVendidas() {
    if (!mes) return;
    const v = vendidos[mes];
    const atual = v ? (v.manual != null ? v.manual : v.sistema) : 0;
    const resp = window.prompt(`Peças vendidas em ${nomeMes(mes)} (base do % de ruptura).\nDeixe vazio para voltar ao valor automático do sistema (${v ? v.sistema : 0}).`, String(atual || ''));
    if (resp === null) return;
    try {
      const r = await fetch(`${API}/solicitacoes/pecas-vendidas`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, quantidade: resp.trim() }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao salvar');
      await carregar();
    } catch (e: any) { alert(e?.message || 'Erro ao salvar'); }
  }

  function exportarCsv() {
    const cab = ['Data', 'Montadora', 'Moto', 'Ano', 'Peça Solicitada', 'Valor Estimado', 'Solicitante', 'Telefone', 'Canal', 'Tipo Cliente', 'Referência Interna', 'Obs.', 'Status'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = filtrados.map((i) => [fmtData(i.data), i.montadora, i.moto, i.ano, i.peca, String(i.valorEstimado).replace('.', ','), i.solicitante, i.telefone, i.canal, i.tipoCliente, i.referenciaInterna, i.observacao, STATUS_INFO[i.status].label].map(esc).join(';'));
    const blob = new Blob(['﻿' + [cab.map(esc).join(';')].concat(linhas).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solicitacoes-${mes || 'todas'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filtrosAtivos = !!(busca || fMontadora || fStatus || fCanal || fTipo);
  const topMontadora = porMontadora[0];
  const valorTodasMontadoras = porMontadora.reduce((s, g) => s + g.valor, 0);

  // ───────── peças de UI ─────────
  function Delta({ atual, anterior, inverso }: { atual: number; anterior: number | undefined; inverso?: boolean }) {
    if (anterior == null || !mes) return null;
    if (!anterior && !atual) return null;
    if (!anterior) return <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>novo vs mês anterior</span>;
    const d = (atual - anterior) / anterior;
    const subiu = d > 0;
    const ruim = inverso ? subiu : !subiu;
    return <span style={{ fontSize: 11, fontWeight: 600, color: d === 0 ? 'var(--ink-muted)' : ruim ? '#b91c1c' : '#15803d' }}>{d === 0 ? '= mês anterior' : `${subiu ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}% vs mês anterior`}</span>;
  }

  function Kpi({ titulo, valor, sub, cor, destaque, extra }: { titulo: string; valor: string; sub?: any; cor?: string; destaque?: boolean; extra?: any }) {
    return (
      <div style={{ ...cs.card, padding: '16px 18px', minWidth: 0, position: 'relative', overflow: 'hidden', borderTop: `3px solid ${cor || 'var(--border)'}`, background: destaque ? 'linear-gradient(180deg, var(--white) 0%, var(--gray-50) 100%)' : 'var(--white)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>{titulo}</div>
          {extra}
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: isPhone ? 24 : 28, fontWeight: 600, letterSpacing: '-0.5px', color: cor || 'var(--ink)', marginTop: 8, lineHeight: 1.1 }}>{valor}</div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 11.5, color: 'var(--ink-muted)' }}>{sub}</div>
      </div>
    );
  }

  function Ranking({ titulo, sub, grupos, max = 6, mostrarValor = true, cores }: { titulo: string; sub?: string; grupos: Grupo[]; max?: number; mostrarValor?: boolean; cores?: boolean }) {
    const lista = grupos.slice(0, max);
    const maior = Math.max(1, ...lista.map((g) => (mostrarValor ? g.valor : g.n)));
    return (
      <div style={{ ...cs.card, padding: '16px 18px', minWidth: 0 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>{titulo}</div>
        {sub ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>{sub}</div> : null}
        <div style={{ display: 'grid', gap: 11, marginTop: 14 }}>
          {lista.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', padding: '6px 0' }}>Sem dados no período.</div> : lista.map((g, idx) => {
            const cor = cores ? PALETA[idx % PALETA.length] : 'var(--blue-500)';
            const larg = Math.max(4, ((mostrarValor ? g.valor : g.n) / maior) * 100);
            return (
              <div key={g.chave}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{g.nome}</span>
                  <span style={{ color: 'var(--ink-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {g.n}× {mostrarValor ? <b style={{ color: 'var(--ink)', marginLeft: 4 }}>{brl0(g.valor)}</b> : null}
                  </span>
                </div>
                <div style={{ height: 7, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${larg}%`, height: '100%', background: cor, borderRadius: 999, transition: 'width .3s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function StatusChip({ s }: { s: Solicitacao }) {
    const info = STATUS_INFO[s.status];
    if (!canEdit) return <span style={{ background: info.fundo, color: info.cor, border: `1px solid ${info.borda}`, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{info.label}</span>;
    return (
      <select value={s.status} onChange={(e) => mudarStatus(s, e.target.value as Status)}
        style={{ background: info.fundo, color: info.cor, border: `1px solid ${info.borda}`, padding: '4px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Geist, sans-serif', outline: 'none' }}>
        {STATUS_LISTA.map((st) => <option key={st} value={st}>{STATUS_INFO[st].label}</option>)}
      </select>
    );
  }

  function Contato({ s }: { s: Solicitacao }) {
    const wa = linkWhatsapp(s.telefone);
    const incompleto = !s.solicitante || !s.telefone;
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: s.solicitante ? 'var(--ink)' : 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {s.solicitante || 'Sem identificação'}
          {s.tipoCliente ? <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: s.tipoCliente === 'Oficina' ? '#eff6ff' : 'var(--gray-100)', color: s.tipoCliente === 'Oficina' ? '#1d4ed8' : 'var(--ink-soft)' }}>{s.tipoCliente}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {s.telefone ? (wa ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ color: '#15803d', textDecoration: 'none', fontWeight: 600 }}>💬 {s.telefone}</a> : <span>{s.telefone}</span>) : null}
          {incompleto ? <span title="Falta identificar o solicitante ou o telefone" style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#fef9c3', color: '#a16207', border: '1px solid #fde047' }}>preencher contato</span> : null}
        </div>
      </div>
    );
  }

  const acoes = (s: Solicitacao) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      {canEdit ? <button type="button" onClick={() => editar(s)} title="Editar" style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink)' }}>Editar</button> : null}
      {canEdit ? <button type="button" onClick={() => duplicar(s)} title="Nova solicitação com os mesmos dados (outra peça da mesma moto/cliente)" style={{ ...cs.btn, padding: '5px 9px', fontSize: 12, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink-soft)' }}>＋</button> : null}
      {canEdit ? <button type="button" disabled={excluindo === s.id} onClick={() => excluir(s)} title="Excluir" style={{ ...cs.btn, padding: '5px 9px', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', opacity: excluindo === s.id ? 0.6 : 1 }}>✕</button> : null}
    </div>
  );

  const kpiGrid: any = { display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };
  const gridRank: any = { display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Cabeçalho + seletor de período */}
      <div style={{ ...cs.card, padding: isPhone ? 14 : '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>Solicitações de peças</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3 }}>Peças que clientes e oficinas pediram e que não tínhamos — a receita que ficou na mesa.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden', background: 'var(--white)' }}>
            <button type="button" disabled={!mes} onClick={() => { setAvisoMes(''); setMes(deslocaMes(mes, -1)); }} style={{ border: 'none', background: 'transparent', padding: '8px 12px', cursor: mes ? 'pointer' : 'default', fontSize: 14, color: 'var(--ink-soft)' }}>‹</button>
            <span style={{ minWidth: isPhone ? 110 : 150, textAlign: 'center', fontSize: 13, fontWeight: 600, textTransform: 'capitalize', color: 'var(--ink)' }}>{mes ? nomeMes(mes) : 'Todo o período'}</span>
            <button type="button" disabled={!mes} onClick={() => { setAvisoMes(''); setMes(deslocaMes(mes, 1)); }} style={{ border: 'none', background: 'transparent', padding: '8px 12px', cursor: mes ? 'pointer' : 'default', fontSize: 14, color: 'var(--ink-soft)' }}>›</button>
          </div>
          <button type="button" onClick={() => { setAvisoMes(''); setMes(mes ? '' : hojeISO().slice(0, 7)); }} style={{ ...cs.btn, padding: '8px 14px', background: mes ? 'var(--white)' : 'var(--ink)', color: mes ? 'var(--ink)' : '#fff', border: '1px solid var(--border)' }}>{mes ? 'Todo o período' : 'Voltar ao mês'}</button>
          {canEdit ? <button type="button" onClick={novo} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff' }}>+ Nova solicitação</button> : null}
        </div>
      </div>

      {avisoMes ? <div style={{ fontSize: 12.5, color: '#a16207', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '8px 14px' }}>{avisoMes}</div> : null}
      {erro ? <div style={{ fontSize: 13, color: 'var(--red)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px' }}>{erro}</div> : null}

      {loading ? <div style={{ ...cs.card, padding: 28, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Carregando solicitações...</div> : (<>

        {/* KPIs */}
        <div style={kpiGrid}>
          <Kpi titulo="Solicitações" valor={String(R.total)} cor="#2563eb"
            sub={<><span>{R.perdidas} perdida(s) · {R.emBusca} em busca · {R.atendidas} atendida(s)</span>{Rant ? <><br /><Delta atual={R.total} anterior={Rant.total} inverso /></> : null}</>} />
          <Kpi titulo="Receita oculta" valor={brl0(R.receita)} cor="#b91c1c" destaque
            sub={<><span>valor estimado das vendas perdidas</span>{Rant ? <><br /><Delta atual={R.receita} anterior={Rant.receita} inverso /></> : null}</>} />
          <Kpi titulo="Ticket médio" valor={brl(R.ticket)} cor="#7c3aed"
            sub={<><span>por solicitação perdida</span>{Rant ? <><br /><Delta atual={R.ticket} anterior={Rant.ticket} /></> : null}</>} />
          <Kpi titulo="% de ruptura" valor={pct(R.ruptura)} cor="#d97706"
            sub={R.vendidas > 0 ? `${R.perdidas} perdidas ÷ ${R.vendidas} peças vendidas` : 'sem peças vendidas no período'} />
          <Kpi titulo="Peças vendidas" valor={String(R.vendidas)} cor="#15803d"
            sub={mes ? (vendidos[mes]?.manual != null ? `ajustado manualmente (sistema: ${vendidos[mes]?.sistema || 0})` : 'do sistema (pedidos do Bling)') : 'soma dos meses com base'}
            extra={mes && canEdit ? <button type="button" onClick={ajustarPecasVendidas} title="Ajustar manualmente a base do % de ruptura" style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 6, fontSize: 11, padding: '2px 7px', cursor: 'pointer', color: 'var(--ink-soft)' }}>✎</button> : null} />
        </div>

        {/* Insight */}
        {topMontadora && valorTodasMontadoras > 0 ? (
          <div style={{ ...cs.card, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(90deg, #eff6ff 0%, var(--white) 70%)' }}>
            <span style={{ fontSize: 20 }}>💡</span>
            <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
              <b>{topMontadora.nome}</b> concentra <b>{Math.round((topMontadora.valor / valorTodasMontadoras) * 100)}%</b> do valor solicitado
              {porPeca[0] ? <> · peça mais procurada: <b>{porPeca.slice().sort((a, b) => b.n - a.n || b.valor - a.valor)[0].nome}</b> ({porPeca.slice().sort((a, b) => b.n - a.n || b.valor - a.valor)[0].n}×)</> : null}
              {porMoto[0] ? <> · moto mais pedida: <b>{porMoto.slice().sort((a, b) => b.n - a.n || b.valor - a.valor)[0].nome}</b></> : null}.
            </div>
          </div>
        ) : null}

        {/* Evolução mensal */}
        {serie.length > 0 ? (
          <div style={{ ...cs.card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Evolução mensal</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>Receita oculta por mês (barras) e % de ruptura. Clique em um mês para filtrar o painel.</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: isPhone ? 8 : 18, marginTop: 18, overflowX: 'auto', paddingBottom: 4 }}>
              {serie.map((s) => {
                const ativo = s.mes === mes;
                const h = Math.max(6, (s.receita / maxReceita) * 130);
                return (
                  <button key={s.mes} type="button" onClick={() => { setAvisoMes(''); setMes(s.mes); }}
                    style={{ flex: '1 0 64px', maxWidth: 120, border: 'none', background: ativo ? 'var(--gray-50)' : 'transparent', borderRadius: 10, padding: '8px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'Geist, sans-serif', outline: ativo ? '1.5px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.receita ? '#b91c1c' : 'var(--ink-muted)' }}>{s.receita ? brl0(s.receita) : '—'}</span>
                    <div style={{ height: 130, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: 34, height: s.receita ? h : 4, borderRadius: '6px 6px 2px 2px', background: ativo ? 'linear-gradient(180deg,#ef4444,#b91c1c)' : 'linear-gradient(180deg,#fca5a5,#f87171)', transition: 'height .3s' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: ativo ? 700 : 500, color: 'var(--ink)', textTransform: 'capitalize' }}>{mesCurto(s.mes)}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{s.perdidas} perd.</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#fffbeb', color: '#a16207', border: '1px solid #fde68a' }}>{pct(s.ruptura)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Rankings */}
        <div style={gridRank}>
          <Ranking titulo="Por montadora" sub="valor estimado solicitado" grupos={porMontadora} cores />
          <Ranking titulo="Peças mais procuradas" sub="o que mais falta no estoque" grupos={porPeca.slice().sort((a, b) => b.n - a.n || b.valor - a.valor)} />
          <Ranking titulo="Motos mais pedidas" sub="onde vale a pena buscar sucata" grupos={porMoto.slice().sort((a, b) => b.n - a.n || b.valor - a.valor)} />
          <Ranking titulo="Por canal" sub="de onde vêm os pedidos" grupos={porCanal} mostrarValor={false} cores />
          <Ranking titulo="Tipo de cliente" sub="oficina x consumidor final" grupos={porTipo} cores />
          <Ranking titulo="Clientes que voltaram" sub="2+ solicitações no período — oportunidade de relacionamento" grupos={recorrentes} />
        </div>

        {/* Lista */}
        <div style={{ ...cs.card, overflow: 'hidden' }}>
          <div style={{ padding: isPhone ? 14 : '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Solicitações {mes ? `de ${nomeMes(mes)}` : '— todo o período'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>{filtrados.length} registro(s){filtrosAtivos ? ` (filtrado de ${noPeriodo.length})` : ''} · {brl(filtrados.reduce((s, i) => s + i.valorEstimado, 0))} estimados</div>
              </div>
              <button type="button" onClick={exportarCsv} disabled={!filtrados.length} style={{ ...cs.btn, padding: '7px 14px', fontSize: 12, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink)', opacity: filtrados.length ? 1 : 0.5 }}>⬇ Exportar CSV</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'minmax(220px, 2fr) repeat(4, minmax(130px, 1fr))', gap: 10 }}>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça, moto, cliente, telefone, SKU..." style={{ ...cs.fi, marginTop: 0, gridColumn: isPhone ? '1 / -1' : 'auto' }} />
              <select value={fMontadora} onChange={(e) => setFMontadora(e.target.value)} style={{ ...cs.fi, marginTop: 0 }}><option value="">Montadora</option>{opMontadoras.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ ...cs.fi, marginTop: 0 }}><option value="">Status</option>{STATUS_LISTA.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}</select>
              <select value={fCanal} onChange={(e) => setFCanal(e.target.value)} style={{ ...cs.fi, marginTop: 0 }}><option value="">Canal</option>{opCanais.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ ...cs.fi, marginTop: 0 }}><option value="">Tipo de cliente</option>{opTipos.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            {filtrosAtivos ? <div><button type="button" onClick={() => { setBusca(''); setFMontadora(''); setFStatus(''); setFCanal(''); setFTipo(''); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--blue-500)', fontFamily: 'Geist, sans-serif' }}>✕ limpar filtros</button></div> : null}
          </div>

          {filtrados.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              {itens.length === 0 ? 'Nenhuma solicitação cadastrada ainda.' : 'Nenhuma solicitação neste período/filtro.'}
              {canEdit && itens.length === 0 ? <div style={{ marginTop: 10 }}><button type="button" onClick={novo} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff' }}>+ Cadastrar a primeira</button></div> : null}
            </div>
          ) : isPhone ? (
            <div style={{ display: 'grid', gap: 10, padding: 12 }}>
              {filtrados.map((s) => (
                <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.peca}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{motoTitulo(s)}{s.ano ? ` · ${s.ano}` : ''} · {fmtData(s.data)}</div>
                    </div>
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{brl0(s.valorEstimado)}</div>
                  </div>
                  <Contato s={s} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusChip s={s} />
                    {acoes(s)}
                  </div>
                  {s.observacao ? <div style={{ fontSize: 12, color: 'var(--ink-soft)', background: 'var(--gray-50)', borderRadius: 8, padding: '6px 10px' }}>{s.observacao}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Data', 'Moto', 'Peça solicitada', 'Valor est.', 'Solicitante', 'Canal', 'Ref. interna', 'Status', ''].map((h, idx) => <th key={idx} style={{ ...cs.th, textAlign: h === 'Valor est.' ? 'right' : 'left' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtrados.map((s) => (
                    <tr key={s.id}>
                      <td style={{ ...cs.td, whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{fmtData(s.data)}</td>
                      <td style={cs.td}>
                        <div style={{ fontWeight: 600 }}>{motoTitulo(s)}</div>
                        {s.ano ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{s.ano}</div> : null}
                      </td>
                      <td style={{ ...cs.td, maxWidth: 260 }}>
                        <div style={{ fontWeight: 600 }}>{s.peca}</div>
                        {s.observacao ? <div title={s.observacao} style={{ fontSize: 11.5, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.observacao}</div> : null}
                      </td>
                      <td style={{ ...cs.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(s.valorEstimado)}</td>
                      <td style={{ ...cs.td, minWidth: 190 }}><Contato s={s} /></td>
                      <td style={{ ...cs.td, whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{s.canal || '—'}</td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-soft)' }}>{s.referenciaInterna || '—'}</td>
                      <td style={cs.td}><StatusChip s={s} /></td>
                      <td style={{ ...cs.td, whiteSpace: 'nowrap' }}>{acoes(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* Datalists do formulário */}
      <datalist id="sol-montadoras">{opMontadoras.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="sol-canais">{opCanais.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="sol-tipos">{opTipos.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="sol-solicitantes">{opSolicitantes.map((o) => <option key={o.nome} value={o.nome} />)}</datalist>

      {/* Modal nova/editar */}
      {editando ? (
        <div onClick={() => !salvando && setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: 720, maxHeight: isPhone ? '100%' : '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--white)', zIndex: 1 }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>{editando.id ? 'Editar solicitação' : 'Nova solicitação'}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Peça pedida por cliente ou oficina</div>
              </div>
              <button type="button" onClick={() => setEditando(null)} style={{ border: 'none', background: 'var(--gray-100)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)' }}>×</button>
            </div>

            <div style={{ padding: 22, display: 'grid', gap: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Peça</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 110px', gap: 12 }}>
                  <div><label style={cs.fl}>Montadora</label><input list="sol-montadoras" style={cs.fi} value={editando.montadora} onChange={(e) => setCampo('montadora', e.target.value)} placeholder="Ex: Harley Davidson" /></div>
                  <div><label style={cs.fl}>Moto / modelo</label><input style={cs.fi} value={editando.moto} onChange={(e) => setCampo('moto', e.target.value)} placeholder="Ex: Sportster 883" /></div>
                  <div><label style={cs.fl}>Ano</label><input style={cs.fi} value={editando.ano} onChange={(e) => setCampo('ano', e.target.value)} placeholder="2012" /></div>
                  <div style={{ gridColumn: isPhone ? 'auto' : '1 / 3' }}><label style={cs.fl}>Peça solicitada *</label><input style={cs.fi} value={editando.peca} onChange={(e) => setCampo('peca', e.target.value)} placeholder="Ex: Carcaça do punho esquerdo" autoFocus /></div>
                  <div><label style={cs.fl}>Valor estimado (R$)</label><input inputMode="decimal" style={cs.fi} value={editando.valorTexto} onChange={(e) => setCampo('valorTexto', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" /></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Quem pediu</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.4fr 1fr 1fr', gap: 12 }}>
                  <div><label style={cs.fl}>Solicitante</label><input list="sol-solicitantes" style={cs.fi} value={editando.solicitante} onChange={(e) => escolherSolicitante(e.target.value)} placeholder="Nome ou oficina (busca em Oficinas)" /></div>
                  <div><label style={cs.fl}>Telefone</label><input style={cs.fi} value={editando.telefone} onChange={(e) => setCampo('telefone', e.target.value)} placeholder="(11) 99999-9999" /></div>
                  <div><label style={cs.fl}>Tipo de cliente</label><input list="sol-tipos" style={cs.fi} value={editando.tipoCliente} onChange={(e) => setCampo('tipoCliente', e.target.value)} placeholder="Oficina / Consumidor Final" /></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Controle</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
                  <div><label style={cs.fl}>Data</label><input type="date" style={cs.fi} value={editando.data} onChange={(e) => setCampo('data', e.target.value)} /></div>
                  <div><label style={cs.fl}>Canal</label><input list="sol-canais" style={cs.fi} value={editando.canal} onChange={(e) => setCampo('canal', e.target.value)} /></div>
                  <div><label style={cs.fl}>Referência interna (SKU)</label><input style={cs.fi} value={editando.referenciaInterna} onChange={(e) => setCampo('referenciaInterna', e.target.value)} placeholder="Ex: HD03_0072" /></div>
                  <div>
                    <label style={cs.fl}>Status</label>
                    <select style={cs.fi} value={editando.status} onChange={(e) => setCampo('status', e.target.value)}>
                      {STATUS_LISTA.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={cs.fl}>Observações</label><textarea style={{ ...cs.fi, minHeight: 64, resize: 'vertical' as const }} value={editando.observacao} onChange={(e) => setCampo('observacao', e.target.value)} placeholder="Ex: cliente procurou 2x para peças da F800" /></div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 8 }}><b>Perdida</b> = não tínhamos a peça (entra na receita oculta) · <b>Em busca</b> = procurando · <b>Atendida</b> = conseguimos vender.</div>
              </div>

              {erroForm ? <div style={{ fontSize: 13, color: 'var(--red)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px 12px' }}>{erroForm}</div> : null}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, position: 'sticky', bottom: 0, background: 'var(--white)' }}>
              <button type="button" disabled={salvando} onClick={() => setEditando(null)} style={{ ...cs.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--ink)' }}>Cancelar</button>
              <button type="button" disabled={salvando} onClick={salvar} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar solicitação'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
