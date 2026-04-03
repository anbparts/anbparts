'use client';
import { useState } from 'react';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 14 },
  label:  { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  input:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '—';
const fmtN = (v: any) => isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Item = {
  pedidoId: number; pedidoNum: string; dataVenda: string;
  idPeca: string; descricao: string; skuBling: string;
  precoVenda: number; frete: number; taxaPct: number; taxaValor: number; valorLiq: number;
  encontrada: boolean; jaVendida: boolean;
  pecaId: number | null; moto: string | null; precoMLAtual: number | null;
  // estado local editável
  _confirmado?: boolean; _baixando?: boolean; _erro?: string;
  _dataVenda?: string; _precoML?: string; _frete?: string; _taxaPct?: string; _taxaValor?: string; _valorLiq?: string;
};

function calcularLiq(precoML: number, frete: number, taxaPct: number): { taxaValor: number; valorLiq: number } {
  const taxaValor = parseFloat((precoML * taxaPct / 100).toFixed(2));
  const valorLiq  = parseFloat((precoML - frete - taxaValor).toFixed(2));
  return { taxaValor, valorLiq };
}

export default function VendasBlingPage() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [buscando, setBuscando]     = useState(false);
  const [itens, setItens]           = useState<Item[]>([]);
  const [buscou, setBuscou]         = useState(false);

  async function buscarVendas() {
    setBuscando(true); setBuscou(false); setItens([]);
    try {
      const r = await fetch(`${API}/bling/sync/vendas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataInicio, dataFim }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || 'Erro ao buscar vendas'); return; }
      setItens(d.itens.map((item: Item) => ({
        ...item,
        _dataVenda: item.dataVenda,
        _precoML:   String(item.precoVenda || item.precoMLAtual || ''),
        _frete:     String(item.frete || 0),
        _taxaPct:   String(item.taxaPct || 0),
        _taxaValor: String(item.taxaValor || 0),
        _valorLiq:  String(item.valorLiq || 0),
        _confirmado: false,
      })));
      setBuscou(true);
    } catch (e: any) { alert('Erro: ' + e.message); }
    setBuscando(false);
  }

  function updateItem(idx: number, field: string, val: any) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  // Recalcula valorLiq quando preço, frete ou taxa muda
  function updateFinanceiro(idx: number, field: string, val: string) {
    setItens(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      const precoML = Number(updated._precoML) || 0;
      const frete   = Number(updated._frete)   || 0;
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
      const precoML  = Number(item._precoML)  || item.precoVenda;
      const frete    = Number(item._frete)    || 0;
      const taxaPct  = Number(item._taxaPct)  || 0;
      const taxaValor = Number(item._taxaValor) || 0;
      const valorLiq = Number(item._valorLiq) || 0;
      const r = await fetch(`${API}/bling/baixar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaId: item.pecaId, dataVenda: item._dataVenda, precoVenda: precoML, frete, taxaValor, valorLiq }),
      });
      const d = await r.json();
      if (d.ok) updateItem(idx, '_confirmado', true);
      else updateItem(idx, '_erro', d.error || 'Erro ao baixar');
    } catch (e: any) { updateItem(idx, '_erro', e.message); }
    updateItem(idx, '_baixando', false);
  }

  const pendentes   = itens.filter(i => i.encontrada && !i.jaVendida && !i._confirmado);
  const confirmados = itens.filter(i => i._confirmado);
  const jaVendidos  = itens.filter(i => i.jaVendida);
  const naoAchados  = itens.filter(i => !i.encontrada);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Vendas Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Revise e confirme cada venda do Bling para dar baixa no estoque</div>
        </div>
        {buscou && (
          <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
            <span>📦 {itens.length} itens</span>
            {pendentes.length > 0 && <span style={{ color: 'var(--amber)' }}>⏳ {pendentes.length} pendentes</span>}
            {confirmados.length > 0 && <span style={{ color: 'var(--green)' }}>✓ {confirmados.length} confirmados</span>}
          </div>
        )}
      </div>

      <div style={{ padding: 28 }}>
        {/* Filtro de data */}
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>🔍 Buscar pedidos concluídos no Bling</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>Data início</label>
              <input style={{ ...s.input, width: 160 }} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data fim</label>
              <input style={{ ...s.input, width: 160 }} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <button style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: buscando ? 0.7 : 1 }} onClick={buscarVendas} disabled={buscando}>
              {buscando ? '⏳ Buscando...' : '🔍 Buscar vendas'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>Deixe as datas em branco para buscar todas as vendas concluídas.</div>
        </div>

        {/* Pendentes de baixa */}
        {pendentes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--amber)', marginBottom: 12 }}>
              ⏳ Pendentes de baixa — {pendentes.length} {pendentes.length === 1 ? 'item' : 'itens'}
            </div>
            {pendentes.map((item, idx) => {
              const realIdx = itens.indexOf(item);
              return (
                <div key={`${item.pedidoId}-${item.idPeca}`} style={{ ...s.card, borderLeft: '3px solid var(--amber)' }}>
                  {/* Cabeçalho */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Pedido #{item.pedidoNum}</span>
                    <span style={{ background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{item.idPeca}</span>
                    {item.moto && <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>🏍 {item.moto}</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 16 }}>{item.descricao}</div>

                  {/* Campos financeiros */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={s.label}>Data da venda</label>
                      <input style={s.input} type="date" value={item._dataVenda || ''} onChange={e => updateItem(realIdx, '_dataVenda', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Preço ML (R$)</label>
                      <input style={s.input} type="number" step="0.01" value={item._precoML || ''} onChange={e => updateFinanceiro(realIdx, '_precoML', e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <label style={s.label}>Frete (R$)</label>
                      <input style={s.input} type="number" step="0.01" value={item._frete || ''} onChange={e => updateFinanceiro(realIdx, '_frete', e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (%)</label>
                      <input style={s.input} type="number" step="0.01" value={item._taxaPct || ''} onChange={e => updateFinanceiro(realIdx, '_taxaPct', e.target.value)} placeholder="17" />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (R$) — calculada</label>
                      <input style={{ ...s.input, background: 'var(--gray-50)', color: 'var(--gray-500)' }} readOnly value={item._taxaValor || ''} />
                    </div>
                    <div>
                      <label style={{ ...s.label, color: 'var(--green)', fontWeight: 600 }}>Valor Líquido (R$)</label>
                      <input style={{ ...s.input, background: '#f0fdf4', borderColor: '#86efac', fontWeight: 600, color: 'var(--green)' }} readOnly value={item._valorLiq || ''} />
                    </div>
                  </div>

                  {item._erro && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>✗ {item._erro}</div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => baixarItem(realIdx)}
                      disabled={item._baixando || !item._dataVenda}
                      style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: (item._baixando || !item._dataVenda) ? 0.6 : 1 }}
                    >
                      {item._baixando ? '⏳' : '✓ Confirmar baixa'}
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

        {/* Confirmados */}
        {confirmados.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)', marginBottom: 12 }}>✓ Confirmados — {confirmados.length}</div>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)' }}>
                  <tr>
                    {['Pedido','SKU','Descrição','Data venda','Preço ML','Frete','Taxas','Vl. Líq.'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmados.map(item => (
                    <tr key={`${item.pedidoId}-${item.idPeca}`} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{item.idPeca}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--gray-700)' }}>{item.descricao}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{item._dataVenda}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{fmtN(item._precoML)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{fmtN(item._frete)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--red)' }}>{fmtN(item._taxaValor)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{fmtN(item._valorLiq)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Não encontradas */}
        {naoAchados.length > 0 && (
          <div style={{ background: 'var(--red-light)', border: '1px solid #fca5a5', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>✗ Não encontradas no ANB ({naoAchados.length})</div>
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>Esses produtos estão no Bling mas não foram importados para o ANB. Rode a importação de produtos primeiro.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {naoAchados.slice(0, 5).map(item => (
                <div key={`${item.pedidoId}-${item.idPeca}`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--red)' }}>
                  {item.idPeca} — {item.descricao.slice(0, 40)}...
                </div>
              ))}
              {naoAchados.length > 5 && <div style={{ fontSize: 12, color: 'var(--red)' }}>+{naoAchados.length - 5} mais...</div>}
            </div>
          </div>
        )}

        {buscou && pendentes.length === 0 && confirmados.length === 0 && naoAchados.length === 0 && jaVendidos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)', fontSize: 14 }}>Nenhuma venda encontrada no período.</div>
        )}
      </div>
    </>
  );
}
