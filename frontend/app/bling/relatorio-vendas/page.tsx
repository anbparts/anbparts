'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

function today() {
  return new Date().toISOString().split('T')[0];
}

function currentYear() {
  return new Date().getFullYear();
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0=sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // monday
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getYearRange(year: string) {
  return { dataDe: `${year}-01-01`, dataAte: `${year}-12-31` };
}

function roundMoney(v: number) { return Math.round(v * 100) / 100; }

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 14 },
  meta: { fontSize: 11, color: 'var(--gray-500)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.3px' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type ReportItem = { id: number; idPeca: string; descricao: string; dataVenda: string; pedidoId: string | null; pedidoNum: string; motoId: number | null; moto: string | null; precoML: number; valorTaxas: number; valorFrete: number; valorLiq: number; };
type PedidoGroup = { pedidoNum: string; pedidoId: string | null; nomeCliente: string | null; dataVenda: string; quantidadeItens: number; subtotalPrecoML: number; subtotalTaxas: number; subtotalFrete: number; subtotalValorLiq: number; itens: ReportItem[]; };
type TotaisGerais = { totalPedidos: number; totalItens: number; precoML: number; valorTaxas: number; valorFrete: number; valorLiq: number; };
type RelatorioResponse = { ok: boolean; filtros: any; totaisGerais: TotaisGerais; pedidos: PedidoGroup[]; };

function fmtMoney(value: number) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtShareOfPriceML(value: number, totalPriceML: number) {
  if (!Number.isFinite(value) || !Number.isFinite(totalPriceML) || totalPriceML <= 0) return '0,00%';
  return `${((value / totalPriceML) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function fmtDate(value: string) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

type RelatorioViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

function AjustarFreteModal({ pedido, onClose, onSaved }: { pedido: PedidoGroup; onClose: () => void; onSaved: () => void }) {
  const [freteAtualizado, setFreteAtualizado] = useState('');
  const [valorAdicional, setValorAdicional] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const freteTotalAtual = pedido.itens.reduce((s, i) => roundMoney(s + i.valorFrete), 0);

  // Preview do novo frete total
  let previewNovoFrete: number | null = null;
  if (freteAtualizado !== '') {
    previewNovoFrete = Math.max(0, Number(freteAtualizado) || 0);
  } else if (valorAdicional !== '') {
    previewNovoFrete = roundMoney(freteTotalAtual + Math.max(0, Number(valorAdicional) || 0));
  }

  async function salvar() {
    if (freteAtualizado === '' && valorAdicional === '') {
      setErr('Informe o Frete Atualizado ou o Valor Adicional de Frete.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: any = { pedidoNum: pedido.pedidoNum };
      if (freteAtualizado !== '') body.freteAtualizado = Number(freteAtualizado);
      else body.valorAdicional = Number(valorAdicional);

      const resp = await fetch(`${API}/bling/ajustar-frete-pedido`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao ajustar frete');
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.12)' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Ajustar Frete — Pedido #{pedido.pedidoNum}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>Frete total atual: <strong>{fmtMoney(freteTotalAtual)}</strong></div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>

        {/* Itens */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>Itens do pedido</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                {['ID Peça', 'Descrição', 'Preço ML', 'Frete atual', 'Liq. atual'].map((h) => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--blue-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.idPeca}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--gray-700)' }}>{item.descricao}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtMoney(item.precoML)}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: 'var(--gray-700)' }}>{fmtMoney(item.valorFrete)}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: 'var(--green)', fontWeight: 600 }}>{fmtMoney(item.valorLiq)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--gray-50)' }}>
                <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 12, color: 'var(--gray-700)' }}>Total do Pedido</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(freteTotalAtual)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtMoney(pedido.subtotalValorLiq)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Campos de ajuste */}
        <div style={{ padding: '16px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ ...s.label, marginBottom: 6 }}>Frete Atualizado (R$)</label>
              <input
                style={{ ...s.input }}
                type="number" step="0.01" min="0"
                placeholder="Ex: 35.00"
                value={freteAtualizado}
                onChange={(e) => { setFreteAtualizado(e.target.value); setValorAdicional(''); }}
              />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Distribui o novo valor total proporcionalmente</div>
            </div>
            <div>
              <label style={{ ...s.label, marginBottom: 6 }}>Valor Adicional de Frete (R$)</label>
              <input
                style={{ ...s.input }}
                type="number" step="0.01" min="0"
                placeholder="Ex: 5.00"
                value={valorAdicional}
                onChange={(e) => { setValorAdicional(e.target.value); setFreteAtualizado(''); }}
              />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Soma ao frete atual e redistribui</div>
            </div>
          </div>

          {previewNovoFrete !== null && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#2563eb' }}>
              Novo frete total: <strong>{fmtMoney(previewNovoFrete)}</strong> (era {fmtMoney(freteTotalAtual)})
            </div>
          )}

          {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>! {err}</div>}
        </div>

        <div style={{ padding: '0 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button onClick={onClose} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={{ ...s.btn, background: 'var(--ink)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando...' : 'Confirmar Ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RelatorioVendasPage() {
  const [viewportMode, setViewportMode] = useState<RelatorioViewportMode>('desktop');
  const [dataDe, setDataDe] = useState(today());
  const [dataAte, setDataAte] = useState(today());
  const [anoSelecionado, setAnoSelecionado] = useState('');
  const [pedido, setPedido] = useState('');
  const [idPeca, setIdPeca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioResponse | null>(null);
  const [ajustarFretePedido, setAjustarFretePedido] = useState<PedidoGroup | null>(null);

  const anosDisponiveis = Array.from({ length: 11 }, (_, index) => String(currentYear() - index));

  async function buscarRelatorio() {
    setBuscando(true);
    try {
      const params = new URLSearchParams();
      if (dataDe) params.set('dataDe', dataDe);
      if (dataAte) params.set('dataAte', dataAte);
      if (pedido.trim()) params.set('pedido', pedido.trim());
      if (idPeca.trim()) params.set('idPeca', idPeca.trim().toUpperCase());

      const response = await fetch(`${API}/bling/relatorio-vendas?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.ok) { alert(data.error || 'Erro ao consultar relatorio'); return; }
      setRelatorio(data);
      setBuscou(true);
    } catch (e: any) { alert(`Erro: ${e.message}`); }
    setBuscando(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!buscando) buscarRelatorio(); }

  function limparFiltros() {
    const cur = today(); setDataDe(cur); setDataAte(cur); setAnoSelecionado(''); setPedido(''); setIdPeca(''); setRelatorio(null); setBuscou(false);
  }

  function handleAnoChange(value: string) {
    setAnoSelecionado(value);
    if (!value) return;
    const range = getYearRange(value); setDataDe(range.dataDe); setDataAte(range.dataAte);
  }

  function applyQuickFilter(tipo: 'semana' | 'mes') {
    setAnoSelecionado('');
    if (tipo === 'semana') { setDataDe(startOfWeek()); setDataAte(today()); }
    else { setDataDe(startOfMonth()); setDataAte(today()); }
  }

  useEffect(() => { buscarRelatorio(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');
    const syncViewportMode = () => {
      if (phoneMedia.matches) { setViewportMode('phone'); return; }
      if (tabletPortraitMedia.matches) { setViewportMode('tablet-portrait'); return; }
      if (tabletLandscapeMedia.matches) { setViewportMode('tablet-landscape'); return; }
      setViewportMode('desktop');
    };
    syncViewportMode();
    phoneMedia.addEventListener('change', syncViewportMode);
    tabletPortraitMedia.addEventListener('change', syncViewportMode);
    tabletLandscapeMedia.addEventListener('change', syncViewportMode);
    return () => {
      phoneMedia.removeEventListener('change', syncViewportMode);
      tabletPortraitMedia.removeEventListener('change', syncViewportMode);
      tabletLandscapeMedia.removeEventListener('change', syncViewportMode);
    };
  }, []);

  const totais = relatorio?.totaisGerais || { totalPedidos: 0, totalItens: 0, precoML: 0, valorTaxas: 0, valorFrete: 0, valorLiq: 0 };
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const useMobileReportLayout = isPhone || isTabletPortrait;
  const pagePadding = isPhone ? 14 : isTabletPortrait ? 18 : 28;
  const filterGridColumns = isPhone ? '1fr' : isTabletPortrait ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))';
  const summaryGridColumns = isPhone ? 'repeat(2, minmax(0, 1fr))' : isTabletPortrait ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(170px, 1fr))';

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Relatorio de Vendas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Consulte as vendas registradas no sistema com totais por pedido Bling.</div>
        </div>
        {buscou && relatorio && (
          <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap', justifyContent: isPhone ? 'flex-start' : 'flex-end', maxWidth: isPhone ? 180 : undefined }}>
            <span>{totais.totalPedidos} pedidos</span>
            <span>{totais.totalItens} itens</span>
            <span style={{ color: 'var(--green)' }}>{fmtMoney(totais.valorLiq)} liquido</span>
          </div>
        )}
      </div>

      <div style={{ padding: pagePadding }}>
        <form style={s.card} onSubmit={handleSubmit}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>Filtros do relatorio</div>
          <div style={{ display: 'grid', gridTemplateColumns: filterGridColumns, gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Ano</label>
              <select style={s.input} value={anoSelecionado} onChange={(e) => handleAnoChange(e.target.value)}>
                <option value="">Selecionar ano</option>
                {anosDisponiveis.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Data da venda - de</label>
              <input style={s.input} type="date" value={dataDe} onChange={(e) => { setDataDe(e.target.value); setAnoSelecionado(''); }} />
            </div>
            <div>
              <label style={s.label}>Data da venda - ate</label>
              <input style={s.input} type="date" value={dataAte} onChange={(e) => { setDataAte(e.target.value); setAnoSelecionado(''); }} />
            </div>
            <div>
              <label style={s.label}>Pedido Bling</label>
              <input style={s.input} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex: 448" />
            </div>
            <div>
              <label style={s.label}>ID Peca</label>
              <input style={s.input} value={idPeca} onChange={(e) => setIdPeca(e.target.value)} placeholder="Ex: BM01_0001" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row', alignItems: 'center' }}>
            <button type="submit" style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: buscando ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }} disabled={buscando}>
              {buscando ? 'Buscando...' : 'Buscar relatorio'}
            </button>
            {/* Filtros rápidos */}
            <button type="button" style={{ ...s.btn, background: 'var(--white)', color: 'var(--blue-500)', borderColor: '#bfdbfe', background: '#eff6ff', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
              onClick={() => { applyQuickFilter('semana'); buscarRelatorio(); }}>
              Esta semana
            </button>
            <button type="button" style={{ ...s.btn, background: '#eff6ff', color: 'var(--blue-500)', borderColor: '#bfdbfe', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
              onClick={() => { applyQuickFilter('mes'); buscarRelatorio(); }}>
              Este mes
            </button>
            <button type="button" style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }} onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        </form>

        {relatorio && (
          <div style={{ display: 'grid', gridTemplateColumns: summaryGridColumns, gap: 12, marginBottom: 14 }}>
            {([
              { label: 'Pedidos', value: String(totais.totalPedidos), color: 'var(--gray-800)', percentageText: null },
              { label: 'Itens', value: String(totais.totalItens), color: 'var(--gray-800)', percentageText: null },
              { label: 'Preco ML', value: fmtMoney(totais.precoML), color: 'var(--blue-500)', percentageText: null },
              { label: 'Taxas', value: fmtMoney(totais.valorTaxas), color: 'var(--amber)', percentageText: `% Preco Venda: ${fmtShareOfPriceML(totais.valorTaxas, totais.precoML)}` },
              { label: 'Frete', value: fmtMoney(totais.valorFrete), color: 'var(--gray-700)', percentageText: `% Preco Venda: ${fmtShareOfPriceML(totais.valorFrete, totais.precoML)}` },
              { label: 'Receita liquida', value: fmtMoney(totais.valorLiq), color: 'var(--green)', percentageText: `% Preco Venda: ${fmtShareOfPriceML(totais.valorLiq, totais.precoML)}` },
            ] as Array<{ label: string; value: string; color: string; percentageText?: string | null }>).map((card) => (
              <div key={card.label} style={{ ...s.card, padding: isPhone ? 14 : 18, marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: card.color }}>{card.value}</div>
                {card.percentageText ? <div style={s.meta}>{card.percentageText}</div> : null}
              </div>
            ))}
          </div>
        )}

        {buscou && relatorio && relatorio.pedidos.length === 0 && (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>Nenhuma venda integrada encontrada</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Ajuste os filtros e tente novamente.</div>
          </div>
        )}

        {relatorio?.pedidos.map((pedidoGroup) => (
          <div key={pedidoGroup.pedidoNum} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>
                    Pedido #{pedidoGroup.pedidoNum}
                    {pedidoGroup.nomeCliente && (
                      <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}> — {pedidoGroup.nomeCliente}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setAjustarFretePedido(pedidoGroup)}
                    style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: '#eff6ff', color: 'var(--blue-500)', borderColor: '#bfdbfe' }}
                  >
                    Ajustar Frete
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  {pedidoGroup.quantidadeItens} item(ns) - Data da venda: {fmtDate(pedidoGroup.dataVenda)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total do pedido</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(pedidoGroup.subtotalValorLiq)}</div>
              </div>
            </div>

            {useMobileReportLayout ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {pedidoGroup.itens.map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isPhone ? 14 : 16, background: 'var(--white)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--blue-500)', fontWeight: 700 }}>{item.idPeca}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-800)', lineHeight: 1.45 }}>{item.descricao}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{fmtDate(item.dataVenda)}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                      {[{ label: 'Moto', value: item.moto || '-' }, { label: 'Preco ML', value: fmtMoney(item.precoML) }, { label: 'Taxas', value: fmtMoney(item.valorTaxas) }, { label: 'Frete', value: fmtMoney(item.valorFrete) }, { label: 'Valor liq.', value: fmtMoney(item.valorLiq) }].map((meta) => (
                        <div key={meta.label}>
                          <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{meta.label}</div>
                          <div style={{ marginTop: 3, fontSize: 12.5, color: meta.label === 'Valor liq.' ? 'var(--green)' : 'var(--gray-800)', fontWeight: meta.label === 'Valor liq.' ? 700 : 500, wordBreak: 'break-word' }}>{meta.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isPhone ? 14 : 16, background: 'var(--gray-50)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
                    Total do pedido #{pedidoGroup.pedidoNum}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    {[{ label: 'Preco ML', value: fmtMoney(pedidoGroup.subtotalPrecoML), color: 'var(--blue-500)' }, { label: 'Taxas', value: fmtMoney(pedidoGroup.subtotalTaxas), color: 'var(--amber)' }, { label: 'Frete', value: fmtMoney(pedidoGroup.subtotalFrete), color: 'var(--gray-700)' }, { label: 'Valor liq.', value: fmtMoney(pedidoGroup.subtotalValorLiq), color: 'var(--green)' }].map((meta) => (
                      <div key={meta.label}>
                        <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{meta.label}</div>
                        <div style={{ marginTop: 3, fontSize: 12.5, color: meta.color, fontWeight: 700 }}>{meta.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                      {['ID Peca', 'Moto', 'Descricao', 'Data venda', 'Preco ML', 'Taxas', 'Frete', 'Valor liq.'].map((head) => (
                        <th key={head} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoGroup.itens.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--blue-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.idPeca}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{item.moto || '-'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)' }}>{item.descricao}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtDate(item.dataVenda)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>{fmtMoney(item.precoML)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorTaxas)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorFrete)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(item.valorLiq)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--gray-50)' }}>
                      <td colSpan={4} style={{ padding: '11px 12px', fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Total do pedido #{pedidoGroup.pedidoNum}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalPrecoML)}</td>
                      <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalTaxas)}</td>
                      <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalFrete)}</td>
                      <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalValorLiq)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {relatorio && relatorio.pedidos.length > 0 && (
          <div style={{ ...s.card, background: 'linear-gradient(135deg, rgba(25,135,84,.06), rgba(25,135,84,.02))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexDirection: isPhone ? 'column' : 'row' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Total geral do relatorio</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{totais.totalPedidos} pedido(s) - {totais.totalItens} item(ns) integrados</div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', flexDirection: isPhone ? 'column' : 'row' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Preco ML: <strong>{fmtMoney(totais.precoML)}</strong></div>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Taxas: <strong>{fmtMoney(totais.valorTaxas)}</strong></div>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Frete: <strong>{fmtMoney(totais.valorFrete)}</strong></div>
                <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700 }}>Liquido: {fmtMoney(totais.valorLiq)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {ajustarFretePedido && (
        <AjustarFreteModal
          pedido={ajustarFretePedido}
          onClose={() => setAjustarFretePedido(null)}
          onSaved={() => { buscarRelatorio(); }}
        />
      )}
    </>
  );
}
