'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type Defaults = {
  fretePadrao: number;
  taxaPadraoPct: number;
};

type Item = {
  entryKey: string;
  tipo: 'VENDA' | 'CANCELAMENTO';
  statusLabel: string;
  pedidoId: number;
  pedidoNum: string;
  dataVenda: string;
  idPeca: string;
  descricao: string;
  skuBling: string;
  quantidade: number;
  quantidadePedido?: number;
  quantidadeJaBaixada?: number;
  precoVenda: number;
  frete: number;
  taxaPct: number;
  taxaValor: number;
  valorLiq: number;
  encontrada: boolean;
  baixaVinculada?: boolean;
  jaVendida: boolean;
  jaEstornada: boolean;
  pecaId: number | null;
  pecaIds?: number[];
  moto: string | null;
  precoMLAtual: number | null;
  fretePadrao: number;
  taxaPadraoPct: number;
  taxaPadraoValor: number;
  valorLiqPadrao: number;
  _confirmado?: boolean;
  _cancelamentoAprovado?: boolean;
  _baixando?: boolean;
  _aprovandoCancelamento?: boolean;
  _erro?: string;
  _dataVenda?: string;
  _precoML?: string;
  _frete?: string;
  _taxaPct?: string;
  _taxaValor?: string;
  _valorLiq?: string;
};

type SeparacaoItem = {
  lineKey: string;
  skuBase: string;
  skuBling: string | null;
  quantidade: number;
  descricao: string;
  idsPecaAnb: string[];
  localizacaoBling: string | null;
  localizacaoAnb: string | null;
  localizacaoConfere: boolean;
  detranRelatorio: string;
  etiquetasDetranDisponiveis: string[];
};

type SeparacaoPedido = {
  pedidoId: number;
  pedidoNum: string;
  dataVenda: string;
  statusLabel: string;
  transportador: string | null;
  quantidadeItens: number;
  itens: SeparacaoItem[];
};

type SeparacaoRelatorio = {
  ok: boolean;
  filtros: {
    dataInicio: string;
    dataFim: string;
    status: string;
  };
  totaisGerais: {
    totalPedidos: number;
    totalItens: number;
    totalLinhas: number;
    totalEtiquetasDetran: number;
    totalLocalizacoesDivergentes: number;
  };
  pedidos: SeparacaoPedido[];
  geradoEm: string;
};

function calcularLiq(precoML: number, frete: number, taxaPct: number) {
  const taxaValor = parseFloat((precoML * taxaPct / 100).toFixed(2));
  const valorLiq = parseFloat((precoML - frete - taxaValor).toFixed(2));
  return { taxaValor, valorLiq };
}

function fmtMoney(value: any) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}%`;
}

function fmtDate(value: string) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function inputDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  return {
    dataInicio: inputDateString(start),
    dataFim: inputDateString(end),
  };
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSeparacaoPrintHtml(relatorio: SeparacaoRelatorio) {
  const periodo = `${fmtDate(relatorio.filtros.dataInicio)} a ${fmtDate(relatorio.filtros.dataFim)}`;
  const cards = [
    ['Pedidos', String(relatorio.totaisGerais.totalPedidos)],
    ['Itens', String(relatorio.totaisGerais.totalItens)],
    ['Linhas', String(relatorio.totaisGerais.totalLinhas)],
    ['Etiquetas DETRAN', String(relatorio.totaisGerais.totalEtiquetasDetran)],
    ['Divergencias loc.', String(relatorio.totaisGerais.totalLocalizacoesDivergentes)],
  ]
    .map(([label, value]) => `
      <div class="metric-card">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
      </div>
    `)
    .join('');

  const pedidosHtml = relatorio.pedidos
    .map((pedido) => {
      const rows = pedido.itens
        .map((item) => `
          <tr class="${item.localizacaoConfere ? 'row-ok' : 'row-warn'}">
            <td>${escapeHtml(item.skuBase || '-')}</td>
            <td>${escapeHtml(item.idsPecaAnb.join(' / ') || '-')}</td>
            <td>${escapeHtml(item.descricao || '-')}</td>
            <td class="center">${escapeHtml(item.quantidade)}</td>
            <td>${escapeHtml(item.localizacaoBling || '-')}</td>
            <td>${escapeHtml(item.localizacaoAnb || '-')}</td>
            <td class="center status-cell">${item.localizacaoConfere ? 'Confere' : 'Divergente'}</td>
            <td>${escapeHtml(item.detranRelatorio || '-')}</td>
          </tr>
        `)
        .join('');

      return `
        <section class="pedido">
          <div class="pedido-header">
            <div>
              <div class="pedido-title">Pedido #${escapeHtml(pedido.pedidoNum)}</div>
              <div class="pedido-meta">Data da venda: ${escapeHtml(fmtDate(pedido.dataVenda))} | Status: ${escapeHtml(pedido.statusLabel || 'Em Aberto')}</div>
              <div class="pedido-meta">Transportador: ${escapeHtml(pedido.transportador || 'Nao informado')}</div>
            </div>
            <div class="pedido-badge">${escapeHtml(`${pedido.quantidadeItens} item(ns)`)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>SKU Base</th>
                <th>SKUs ANB</th>
                <th>Descricao</th>
                <th>Qtd</th>
                <th>Loc. Bling</th>
                <th>Loc. ANB</th>
                <th>Status Loc.</th>
                <th>Etiqueta DETRAN</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatorio de Separacao - ${escapeHtml(periodo)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        color: #1e293b;
        background: #ffffff;
      }
      .page {
        width: 100%;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
        padding-bottom: 12px;
        border-bottom: 2px solid #1e56a0;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 4px;
      }
      .subtitle {
        font-size: 12px;
        color: #475569;
        line-height: 1.5;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(110px, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .metric-card {
        border: 1px solid #dbeafe;
        background: #f8fbff;
        border-radius: 10px;
        padding: 10px 12px;
      }
      .metric-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      .metric-value {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
      }
      .pedido {
        margin-bottom: 16px;
        page-break-inside: avoid;
      }
      .pedido-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 10px;
      }
      .pedido-title {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      .pedido-meta {
        margin-top: 3px;
        font-size: 11px;
        color: #475569;
      }
      .pedido-badge {
        white-space: nowrap;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        color: #1e293b;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #e2e8f0;
        padding: 7px 8px;
        vertical-align: top;
        word-break: break-word;
      }
      th {
        background: #eff6ff;
        color: #334155;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        text-align: left;
      }
      td {
        font-size: 11px;
      }
      .center {
        text-align: center;
      }
      .status-cell {
        font-weight: 700;
      }
      .row-warn td {
        background: #fff7ed;
      }
      .row-ok td {
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div>
          <div class="title">Relatorio de Separacao</div>
          <div class="subtitle">Periodo: ${escapeHtml(periodo)}<br />Status filtrado: ${escapeHtml(relatorio.filtros.status || 'Em Aberto')}</div>
        </div>
        <div class="subtitle">Gerado em ${escapeHtml(fmtDate(String(relatorio.geradoEm || '').split('T')[0]))}</div>
      </div>
      <div class="metrics">${cards}</div>
      ${pedidosHtml}
    </div>
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 200);
      });
    </script>
  </body>
</html>`;
}

export default function VendasBlingPage() {
  const [dataInicio, setDataInicio] = useState(() => defaultDateRange().dataInicio);
  const [dataFim, setDataFim] = useState(() => defaultDateRange().dataFim);
  const [buscando, setBuscando] = useState(false);
  const [carregandoSeparacao, setCarregandoSeparacao] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [buscouSeparacao, setBuscouSeparacao] = useState(false);
  const [relatorioSeparacao, setRelatorioSeparacao] = useState<SeparacaoRelatorio | null>(null);
  const [defaults, setDefaults] = useState<Defaults>({ fretePadrao: 29.9, taxaPadraoPct: 17 });

  useEffect(() => {
    fetch(`${API}/bling/config-produtos`)
      .then((r) => r.json())
      .then((d) => setDefaults({
        fretePadrao: Number(d.fretePadrao ?? 29.9),
        taxaPadraoPct: Number(d.taxaPadraoPct ?? 17),
      }))
      .catch(() => {});
  }, []);

  async function buscarVendas() {
    setBuscando(true);
    setBuscou(false);
    setItens([]);
    try {
      const response = await fetch(`${API}/bling/sync/vendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataInicio, dataFim }),
      });
      const data = await response.json();
      if (!data.ok) {
        alert(data.error || 'Erro ao buscar vendas');
        return;
      }

      if (data.defaults) {
        setDefaults({
          fretePadrao: Number(data.defaults.fretePadrao ?? 29.9),
          taxaPadraoPct: Number(data.defaults.taxaPadraoPct ?? 17),
        });
      }

      setItens((data.itens || []).map((item: Item) => ({
        ...item,
        _dataVenda: item.dataVenda,
        _precoML: String(item.precoVenda || item.precoMLAtual || ''),
        _frete: String(item.frete || 0),
        _taxaPct: String(item.taxaPct || 0),
        _taxaValor: String(item.taxaValor || 0),
        _valorLiq: String(item.valorLiq || 0),
      })));
      setBuscou(true);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setBuscando(false);
  }

  async function buscarRelatorioSeparacao() {
    setCarregandoSeparacao(true);
    setBuscouSeparacao(false);
    setRelatorioSeparacao(null);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);

      const response = await fetch(`${API}/bling/relatorio-separacao?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        alert(data.error || 'Erro ao carregar relatorio de separacao');
        return;
      }

      setRelatorioSeparacao(data);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setBuscouSeparacao(true);
    setCarregandoSeparacao(false);
  }

  function gerarPdfSeparacao() {
    if (!relatorioSeparacao || relatorioSeparacao.pedidos.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Nao foi possivel abrir a janela de impressao do PDF.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildSeparacaoPrintHtml(relatorioSeparacao));
    printWindow.document.close();
  }

  function updateItem(idx: number, field: string, value: any) {
    setItens((prev) => prev.map((item, index) => (index === idx ? { ...item, [field]: value } : item)));
  }

  function updateFinanceiro(idx: number, field: string, value: string) {
    setItens((prev) => prev.map((item, index) => {
      if (index !== idx) return item;
      const updated = { ...item, [field]: value };
      const precoML = Number(updated._precoML) || 0;
      const frete = Number(updated._frete) || 0;
      const taxaPct = Number(updated._taxaPct) || 0;
      const { taxaValor, valorLiq } = calcularLiq(precoML, frete, taxaPct);
      return { ...updated, _taxaValor: String(taxaValor), _valorLiq: String(valorLiq) };
    }));
  }

  async function baixarItem(idx: number) {
    const item = itens[idx];
    if ((!item.pecaIds?.length && !item.pecaId) || !item._dataVenda) return;

    updateItem(idx, '_baixando', true);
    try {
      const response = await fetch(`${API}/bling/baixar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pecaIds: item.pecaIds?.length ? item.pecaIds : undefined,
          pecaId: item.pecaId,
          pedidoId: item.pedidoId,
          pedidoNum: item.pedidoNum,
          dataVenda: item._dataVenda,
          precoVenda: Number(item._precoML) || item.precoVenda,
          frete: Number(item._frete) || 0,
          taxaValor: Number(item._taxaValor) || 0,
          valorLiq: Number(item._valorLiq) || 0,
        }),
      });
      const data = await response.json();
      if (data.ok) updateItem(idx, '_confirmado', true);
      else updateItem(idx, '_erro', data.error || 'Erro ao baixar');
    } catch (e: any) {
      updateItem(idx, '_erro', e.message);
    }
    updateItem(idx, '_baixando', false);
  }

  async function aprovarCancelamento(idx: number) {
    const item = itens[idx];
    if ((!item.pecaIds?.length && !item.pecaId)) return;

    updateItem(idx, '_aprovandoCancelamento', true);
    try {
      const response = await fetch(`${API}/bling/aprovar-cancelamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pecaIds: item.pecaIds?.length ? item.pecaIds : undefined,
          pecaId: item.pecaId,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        updateItem(idx, '_cancelamentoAprovado', true);
        updateItem(idx, 'jaEstornada', true);
      } else {
        updateItem(idx, '_erro', data.error || 'Erro ao aprovar cancelamento');
      }
    } catch (e: any) {
      updateItem(idx, '_erro', e.message);
    }
    updateItem(idx, '_aprovandoCancelamento', false);
  }

  const pendentes = itens.filter((item) => item.tipo === 'VENDA' && item.encontrada && !item.jaVendida && !item._confirmado);
  const confirmados = itens.filter((item) => item.tipo === 'VENDA' && item._confirmado);
  const naoAchados = itens.filter((item) => item.tipo === 'VENDA' && !item.encontrada);

  const cancelPendentes = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item.baixaVinculada && item.encontrada && !item.jaEstornada && !item._cancelamentoAprovado);
  const cancelAprovados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item._cancelamentoAprovado);
  const cancelJaAplicados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item.baixaVinculada && item.jaEstornada && !item._cancelamentoAprovado);
  const cancelSemBaixa = itens.filter((item) => item.tipo === 'CANCELAMENTO' && !item.baixaVinculada);
  const cancelNaoAchados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item.baixaVinculada && !item.encontrada);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Vendas Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Revise baixas e cancelamentos antes de refletir no estoque</div>
        </div>
        {buscou && (
          <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span>{itens.length} itens</span>
            {pendentes.length > 0 && <span style={{ color: 'var(--amber)' }}>{pendentes.length} vendas pendentes</span>}
            {cancelPendentes.length > 0 && <span style={{ color: 'var(--red)' }}>{cancelPendentes.length} cancelamentos pendentes</span>}
            {confirmados.length > 0 && <span style={{ color: 'var(--green)' }}>{confirmados.length} vendas confirmadas</span>}
          </div>
        )}
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>Buscar pedidos do Bling</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>Data inicio</label>
              <input style={{ ...s.input, width: 160 }} type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data fim</label>
              <input style={{ ...s.input, width: 160 }} type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <button style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: buscando ? 0.7 : 1 }} onClick={buscarVendas} disabled={buscando}>
              {buscando ? 'Buscando...' : 'Buscar vendas'}
            </button>
            <button
              type="button"
              style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: carregandoSeparacao ? 0.7 : 1 }}
              onClick={buscarRelatorioSeparacao}
              disabled={carregandoSeparacao}
            >
              {carregandoSeparacao ? 'Carregando relatorio...' : 'Relatorio de Separacao'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
            A busca agora traz pedidos concluidos e cancelados. Frete padrao atual: {fmtMoney(defaults.fretePadrao)} · Taxa padrao: {fmtPercent(defaults.taxaPadraoPct)}
          </div>
        </div>

        {relatorioSeparacao && (
          <div style={{ ...s.card, borderColor: '#bfdbfe', background: '#f8fbff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Relatorio de Separacao</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  Previa dos pedidos <strong>{relatorioSeparacao.filtros.status}</strong> entre {fmtDate(relatorioSeparacao.filtros.dataInicio)} e {fmtDate(relatorioSeparacao.filtros.dataFim)}.
                </div>
              </div>
              <button
                type="button"
                onClick={gerarPdfSeparacao}
                disabled={relatorioSeparacao.pedidos.length === 0}
                style={{ ...s.btn, background: '#0f172a', color: '#fff', opacity: relatorioSeparacao.pedidos.length === 0 ? 0.5 : 1 }}
              >
                Gerar PDF
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Pedidos', value: relatorioSeparacao.totaisGerais.totalPedidos, color: 'var(--gray-800)' },
                { label: 'Itens', value: relatorioSeparacao.totaisGerais.totalItens, color: 'var(--gray-800)' },
                { label: 'Linhas', value: relatorioSeparacao.totaisGerais.totalLinhas, color: 'var(--blue-500)' },
                { label: 'Etiquetas Detran', value: relatorioSeparacao.totaisGerais.totalEtiquetasDetran, color: 'var(--amber)' },
                { label: 'Locais Divergentes', value: relatorioSeparacao.totaisGerais.totalLocalizacoesDivergentes, color: 'var(--red)' },
              ].map((card) => (
                <div key={card.label} style={{ background: 'var(--white)', border: '1px solid #dbeafe', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>

            {relatorioSeparacao.pedidos.length === 0 ? (
              <div style={{ background: 'var(--white)', border: '1px dashed #bfdbfe', borderRadius: 10, padding: '18px 16px', fontSize: 13, color: 'var(--gray-500)' }}>
                Nenhum pedido com status Em Aberto foi encontrado nesse periodo.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {relatorioSeparacao.pedidos.map((pedido) => (
                  <div key={pedido.pedidoNum} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Pedido #{pedido.pedidoNum}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                          Data da venda: {fmtDate(pedido.dataVenda)} - Status: {pedido.statusLabel || 'Em Aberto'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>
                          Transportador: {pedido.transportador || 'Nao informado'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, background: '#eff6ff', color: 'var(--blue-500)', padding: '6px 10px', borderRadius: 999, fontWeight: 700 }}>
                        {pedido.quantidadeItens} item(ns)
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ background: 'var(--gray-50)' }}>
                          <tr>
                            {['SKU Base', 'SKUs ANB', 'Descricao', 'Qtd', 'Loc. Bling', 'Loc. ANB', 'Status loc.', 'Etiqueta Detran'].map((header) => (
                              <th key={header} style={{ padding: '9px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pedido.itens.map((item) => (
                            <tr key={item.lineKey} style={{ borderTop: '1px solid var(--gray-100)', background: item.localizacaoConfere ? 'var(--white)' : '#fff7ed' }}>
                              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)', fontWeight: 700 }}>{item.skuBase || '-'}</td>
                              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{item.idsPecaAnb.join(' / ') || '-'}</td>
                              <td style={{ padding: '10px 12px', color: 'var(--gray-800)', lineHeight: 1.45 }}>{item.descricao || '-'}</td>
                              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{item.quantidade}</td>
                              <td style={{ padding: '10px 12px', color: 'var(--gray-700)' }}>{item.localizacaoBling || '-'}</td>
                              <td style={{ padding: '10px 12px', color: 'var(--gray-700)' }}>{item.localizacaoAnb || '-'}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: item.localizacaoConfere ? '#dcfce7' : '#fee2e2', color: item.localizacaoConfere ? '#166534' : '#b91c1c' }}>
                                  {item.localizacaoConfere ? 'Confere' : 'Divergente'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: item.detranRelatorio === 'ENVIAR FOTO DA ETIQUETA DETRAN' ? 'var(--amber)' : 'var(--gray-800)', fontWeight: item.detranRelatorio ? 700 : 500 }}>
                                {item.detranRelatorio || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {buscouSeparacao && !relatorioSeparacao && (
          <div style={{ ...s.card, borderColor: '#fecaca', background: '#fff7f7', color: '#b91c1c' }}>
            Nao foi possivel carregar o Relatorio de Separacao agora.
          </div>
        )}

        {cancelPendentes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Cancelamentos pendentes - {cancelPendentes.length}</div>
            {cancelPendentes.map((item) => {
              const realIdx = itens.indexOf(item);
              const precoBase = Number(item.precoMLAtual ?? item.precoVenda ?? 0);
              const previsao = calcularLiq(precoBase, defaults.fretePadrao, defaults.taxaPadraoPct);

              return (
                <div key={item.entryKey} style={{ ...s.card, borderLeft: '3px solid #ef4444' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Pedido #{item.pedidoNum}</span>
                    <span style={{ background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{item.idPeca}</span>
                    {item.quantidade > 1 && <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>{item.quantidade}x</span>}
                    <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 5 }}>{item.statusLabel}</span>
                    {item.moto && <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>{item.moto}</span>}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 10 }}>{item.descricao}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 12 }}>
                    Ao aprovar o cancelamento, a peca volta para o estoque, a data da venda e removida e os valores
                    financeiros voltam para os padroes configurados em Config. Produtos.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>Preco base</div>
                      <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{fmtMoney(precoBase)}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>Frete padrao</div>
                      <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{fmtMoney(defaults.fretePadrao)}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>Taxa padrao</div>
                      <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{fmtPercent(defaults.taxaPadraoPct)} ({fmtMoney(previsao.taxaValor)})</div>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 4 }}>Novo valor liquido</div>
                      <div style={{ fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(previsao.valorLiq)}</div>
                    </div>
                  </div>

                  {item._erro && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{item._erro}</div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => aprovarCancelamento(realIdx)}
                      disabled={item._aprovandoCancelamento}
                      style={{ ...s.btn, background: '#b91c1c', color: '#fff', opacity: item._aprovandoCancelamento ? 0.6 : 1 }}
                    >
                      {item._aprovandoCancelamento ? 'Aplicando...' : 'Aprovar cancelamento'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendentes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--amber)', marginBottom: 12 }}>Vendas pendentes de baixa - {pendentes.length}</div>
            {pendentes.map((item) => {
              const realIdx = itens.indexOf(item);
              return (
                <div key={item.entryKey} style={{ ...s.card, borderLeft: '3px solid var(--amber)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Pedido #{item.pedidoNum}</span>
                    <span style={{ background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{item.idPeca}</span>
                    {item.quantidade > 1 && <span style={{ fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>{item.quantidade}x</span>}
                    <span style={{ fontSize: 11, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>{item.statusLabel}</span>
                    {item.moto && <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>{item.moto}</span>}
                  </div>

                  {item.quantidadeJaBaixada ? (
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
                      Ja baixadas neste pedido: {item.quantidadeJaBaixada} de {item.quantidadePedido || item.quantidade}
                    </div>
                  ) : null}

                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 16 }}>{item.descricao}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={s.label}>Data da venda</label>
                      <input style={s.input} type="date" value={item._dataVenda || ''} onChange={(e) => updateItem(realIdx, '_dataVenda', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Preco ML (R$)</label>
                      <input style={s.input} type="number" step="0.01" value={item._precoML || ''} onChange={(e) => updateFinanceiro(realIdx, '_precoML', e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <label style={s.label}>Frete (R$)</label>
                      <input style={s.input} type="number" step="0.01" value={item._frete || ''} onChange={(e) => updateFinanceiro(realIdx, '_frete', e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (%)</label>
                      <input style={s.input} type="number" step="0.01" value={item._taxaPct || ''} onChange={(e) => updateFinanceiro(realIdx, '_taxaPct', e.target.value)} placeholder="17" />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (R$)</label>
                      <input style={{ ...s.input, background: 'var(--gray-50)', color: 'var(--gray-500)' }} readOnly value={item._taxaValor || ''} />
                    </div>
                    <div>
                      <label style={{ ...s.label, color: 'var(--green)', fontWeight: 600 }}>Valor liquido (R$)</label>
                      <input style={{ ...s.input, background: '#f0fdf4', borderColor: '#86efac', fontWeight: 600, color: 'var(--green)' }} readOnly value={item._valorLiq || ''} />
                    </div>
                  </div>

                  {item._erro && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{item._erro}</div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => baixarItem(realIdx)}
                      disabled={item._baixando || !item._dataVenda}
                      style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: (item._baixando || !item._dataVenda) ? 0.6 : 1 }}
                    >
                      {item._baixando ? 'Salvando...' : 'Confirmar baixa'}
                    </button>
                    <button onClick={() => updateItem(realIdx, 'jaVendida', true)} style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}>
                      Ignorar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {confirmados.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)', marginBottom: 12 }}>Vendas confirmadas - {confirmados.length}</div>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)' }}>
                  <tr>
                    {['Pedido', 'SKU', 'Descricao', 'Data venda', 'Preco ML', 'Frete', 'Taxas', 'Vl. liq.'].map((header) => (
                      <th key={header} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmados.map((item) => (
                    <tr key={item.entryKey} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{item.idPeca}{item.quantidade > 1 ? ` (${item.quantidade}x)` : ''}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--gray-700)' }}>{item.descricao}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{item._dataVenda}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{fmtMoney(item._precoML)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{fmtMoney(item._frete)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--red)' }}>{fmtMoney(item._taxaValor)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{fmtMoney(item._valorLiq)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {cancelAprovados.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)', marginBottom: 12 }}>Cancelamentos aprovados - {cancelAprovados.length}</div>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)' }}>
                  <tr>
                    {['Pedido', 'SKU', 'Descricao', 'Preco base', 'Frete padrao', 'Taxa padrao', 'Vl. liq.'].map((header) => (
                      <th key={header} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cancelAprovados.map((item) => (
                    <tr key={item.entryKey} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{item.idPeca}{item.quantidade > 1 ? ` (${item.quantidade}x)` : ''}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--gray-700)' }}>{item.descricao}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{fmtMoney(item.precoMLAtual || item.precoVenda)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{fmtMoney(defaults.fretePadrao)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{fmtPercent(defaults.taxaPadraoPct)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{fmtMoney(item.valorLiqPadrao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {cancelSemBaixa.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-500)', marginBottom: 8 }}>Cancelamentos sem baixa vinculada ({cancelSemBaixa.length})</div>
            <div style={{ fontSize: 12, color: 'var(--blue-500)', marginBottom: 10 }}>
              O pedido veio cancelado no Bling, mas nao existe baixa confirmada desse mesmo pedido no ANB. Nenhuma acao no estoque e necessaria.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cancelSemBaixa.slice(0, 8).map((item) => (
                <div key={item.entryKey} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>
                  #{item.pedidoNum} - {item.idPeca} - {item.descricao}
                </div>
              ))}
              {cancelSemBaixa.length > 8 && <div style={{ fontSize: 12, color: 'var(--blue-500)' }}>+{cancelSemBaixa.length - 8} mais...</div>}
            </div>
          </div>
        )}

        {cancelJaAplicados.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-500)', marginBottom: 8 }}>Cancelamentos sem acao necessaria ({cancelJaAplicados.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cancelJaAplicados.slice(0, 8).map((item) => (
                <div key={item.entryKey} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>
                  #{item.pedidoNum} - {item.idPeca} - {item.descricao}
                </div>
              ))}
              {cancelJaAplicados.length > 8 && <div style={{ fontSize: 12, color: 'var(--blue-500)' }}>+{cancelJaAplicados.length - 8} mais...</div>}
            </div>
          </div>
        )}

        {naoAchados.length > 0 && (
          <div style={{ background: 'var(--red-light)', border: '1px solid #fca5a5', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>Vendas nao encontradas no ANB ({naoAchados.length})</div>
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>Esses produtos estao no Bling mas nao foram localizados no estoque do ANB.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {naoAchados.slice(0, 5).map((item) => (
                <div key={item.entryKey} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--red)' }}>
                  {item.idPeca} - {item.descricao.slice(0, 40)}...
                </div>
              ))}
              {naoAchados.length > 5 && <div style={{ fontSize: 12, color: 'var(--red)' }}>+{naoAchados.length - 5} mais...</div>}
            </div>
          </div>
        )}

        {cancelNaoAchados.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c', marginBottom: 8 }}>Cancelamentos sem peca localizada ({cancelNaoAchados.length})</div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10 }}>O pedido veio como cancelado no Bling, mas a peca correspondente nao foi localizada no ANB para estorno automatico.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cancelNaoAchados.slice(0, 5).map((item) => (
                <div key={item.entryKey} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#b91c1c' }}>
                  {item.idPeca} - {item.descricao.slice(0, 40)}...
                </div>
              ))}
              {cancelNaoAchados.length > 5 && <div style={{ fontSize: 12, color: '#b91c1c' }}>+{cancelNaoAchados.length - 5} mais...</div>}
            </div>
          </div>
        )}

        {buscou && pendentes.length === 0 && confirmados.length === 0 && naoAchados.length === 0 && cancelPendentes.length === 0 && cancelAprovados.length === 0 && cancelSemBaixa.length === 0 && cancelJaAplicados.length === 0 && cancelNaoAchados.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)', fontSize: 14 }}>Nenhuma venda ou cancelamento encontrado no periodo.</div>
        )}
      </div>
    </>
  );
}
