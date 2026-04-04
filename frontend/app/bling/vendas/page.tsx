'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

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
  tipo: 'VENDA' | 'CANCELAMENTO';
  statusLabel: string;
  pedidoId: number;
  pedidoNum: string;
  dataVenda: string;
  idPeca: string;
  descricao: string;
  skuBling: string;
  precoVenda: number;
  frete: number;
  taxaPct: number;
  taxaValor: number;
  valorLiq: number;
  encontrada: boolean;
  jaVendida: boolean;
  jaEstornada: boolean;
  pecaId: number | null;
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

export default function VendasBlingPage() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [buscou, setBuscou] = useState(false);
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
    if (!item.pecaId || !item._dataVenda) return;

    updateItem(idx, '_baixando', true);
    try {
      const response = await fetch(`${API}/bling/baixar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pecaId: item.pecaId,
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
    if (!item.pecaId) return;

    updateItem(idx, '_aprovandoCancelamento', true);
    try {
      const response = await fetch(`${API}/bling/aprovar-cancelamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaId: item.pecaId }),
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

  const cancelPendentes = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item.encontrada && !item.jaEstornada && !item._cancelamentoAprovado);
  const cancelAprovados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item._cancelamentoAprovado);
  const cancelJaAplicados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && item.jaEstornada && !item._cancelamentoAprovado);
  const cancelNaoAchados = itens.filter((item) => item.tipo === 'CANCELAMENTO' && !item.encontrada);

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
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
            A busca agora traz pedidos concluidos e cancelados. Frete padrao atual: {fmtMoney(defaults.fretePadrao)} · Taxa padrao: {fmtPercent(defaults.taxaPadraoPct)}
          </div>
        </div>

        {pendentes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--amber)', marginBottom: 12 }}>Vendas pendentes de baixa - {pendentes.length}</div>
            {pendentes.map((item) => {
              const realIdx = itens.indexOf(item);
              return (
                <div key={`${item.pedidoId}-${item.idPeca}-venda`} style={{ ...s.card, borderLeft: '3px solid var(--amber)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Pedido #{item.pedidoNum}</span>
                    <span style={{ background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{item.idPeca}</span>
                    <span style={{ fontSize: 11, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>{item.statusLabel}</span>
                    {item.moto && <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>{item.moto}</span>}
                  </div>

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

        {cancelPendentes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Cancelamentos pendentes - {cancelPendentes.length}</div>
            {cancelPendentes.map((item) => {
              const realIdx = itens.indexOf(item);
              const precoBase = Number(item.precoMLAtual ?? item.precoVenda ?? 0);
              const previsao = calcularLiq(precoBase, defaults.fretePadrao, defaults.taxaPadraoPct);

              return (
                <div key={`${item.pedidoId}-${item.idPeca}-cancelamento`} style={{ ...s.card, borderLeft: '3px solid #ef4444' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Pedido #{item.pedidoNum}</span>
                    <span style={{ background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{item.idPeca}</span>
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
                    <tr key={`${item.pedidoId}-${item.idPeca}-confirmado`} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{item.idPeca}</td>
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
                    <tr key={`${item.pedidoId}-${item.idPeca}-cancelado`} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{item.idPeca}</td>
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

        {cancelJaAplicados.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-500)', marginBottom: 8 }}>Cancelamentos ja aplicados ({cancelJaAplicados.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cancelJaAplicados.slice(0, 8).map((item) => (
                <div key={`${item.pedidoId}-${item.idPeca}-ja-aplicado`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>
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
                <div key={`${item.pedidoId}-${item.idPeca}-nao-achado`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--red)' }}>
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
                <div key={`${item.pedidoId}-${item.idPeca}-cancel-nao-achado`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#b91c1c' }}>
                  {item.idPeca} - {item.descricao.slice(0, 40)}...
                </div>
              ))}
              {cancelNaoAchados.length > 5 && <div style={{ fontSize: 12, color: '#b91c1c' }}>+{cancelNaoAchados.length - 5} mais...</div>}
            </div>
          </div>
        )}

        {buscou && pendentes.length === 0 && confirmados.length === 0 && naoAchados.length === 0 && cancelPendentes.length === 0 && cancelAprovados.length === 0 && cancelJaAplicados.length === 0 && cancelNaoAchados.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)', fontSize: 14 }}>Nenhuma venda ou cancelamento encontrado no periodo.</div>
        )}
      </div>
    </>
  );
}
