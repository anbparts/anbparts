'use client';
import { useState } from 'react';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 18 },
  label:  { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 },
  input:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 12px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', color: 'var(--ink)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

function fmt(v: number) { return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '—'; }

type Item = {
  pedidoId: number; pedidoNum: string; dataVenda: string;
  idPeca: string; descricao: string; skuBling: string;
  precoVenda: number; encontrada: boolean; jaVendida: boolean;
  pecaId: number | null; moto: string | null; precoMLAtual: number | null;
  // estado local
  _confirmado?: boolean; _dataVenda?: string; _precoVenda?: string; _baixando?: boolean; _erro?: string;
};

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
      // Inicializa estado local de cada item
      setItens(d.itens.map((item: Item) => ({
        ...item,
        _dataVenda:  item.dataVenda,
        _precoVenda: String(item.precoVenda || item.precoMLAtual || ''),
        _confirmado: false,
      })));
      setBuscou(true);
    } catch (e: any) { alert('Erro: ' + e.message); }
    setBuscando(false);
  }

  function updateItem(idx: number, field: string, val: any) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  async function baixarItem(idx: number) {
    const item = itens[idx];
    if (!item.pecaId || !item._dataVenda) return;
    updateItem(idx, '_baixando', true);
    try {
      const r = await fetch(`${API}/bling/baixar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaId: item.pecaId, dataVenda: item._dataVenda, precoVenda: Number(item._precoVenda) || item.precoVenda }),
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
          <div style={s.title}>Vendas Bling</div>
          <div style={s.sub}>Revise e confirme cada venda do Bling para dar baixa no estoque</div>
        </div>
        {buscou && itens.length > 0 && (
          <div style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: 'Geist Mono, monospace' }}>
            <span style={{ color: 'var(--ink-muted)' }}>📋 {itens.length} itens</span>
            <span style={{ color: 'var(--amber)' }}>⏳ {pendentes.length} pendentes</span>
            <span style={{ color: 'var(--green)' }}>✓ {confirmados.length} confirmados</span>
          </div>
        )}
      </div>

      <div style={{ padding: 26 }}>

        {/* FILTRO DE PERÍODO */}
        <div style={s.card}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, marginBottom: 14, letterSpacing: '-0.3px' }}>
            🔍 Buscar pedidos concluídos no Bling
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>Data início</label>
              <input style={s.input} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data fim</label>
              <input style={s.input} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <button style={{ ...s.btn, background: '#FF6900', color: '#fff' }} onClick={buscarVendas} disabled={buscando}>
              {buscando ? '⏳ Buscando...' : '🔍 Buscar vendas'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 10 }}>
            Deixe as datas em branco para buscar todas as vendas concluídas.
          </div>
        </div>

        {/* LISTA PENDENTES */}
        {pendentes.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--amber)', letterSpacing: '-0.3px' }}>
              ⏳ Pendentes de baixa — {pendentes.length} {pendentes.length === 1 ? 'item' : 'itens'}
            </div>

            {itens.map((item, idx) => {
              if (!item.encontrada || item.jaVendida || item._confirmado) return null;
              return (
                <div key={idx} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                  {/* Info da peça */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, background: '#FF690015', color: '#FF6900', padding: '2px 8px', borderRadius: 4, border: '1px solid #FF690030' }}>
                        Pedido #{item.pedidoNum}
                      </span>
                      <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 8px', borderRadius: 4 }}>
                        {item.idPeca}
                      </span>
                      {item.moto && (
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>🏍 {item.moto}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{item.descricao}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
                      SKU Bling: {item.skuBling || '—'} · Preço ML atual: {fmt(item.precoMLAtual || 0)}
                    </div>

                    {/* Campos editáveis */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ ...s.label, marginBottom: 4 }}>Data da venda</label>
                        <input
                          style={{ ...s.input, width: 150 }}
                          type="date"
                          value={item._dataVenda || ''}
                          onChange={e => updateItem(idx, '_dataVenda', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ ...s.label, marginBottom: 4 }}>Preço vendido (R$)</label>
                        <input
                          style={{ ...s.input, width: 140 }}
                          type="number"
                          step="0.01"
                          value={item._precoVenda || ''}
                          onChange={e => updateItem(idx, '_precoVenda', e.target.value)}
                          placeholder={String(item.precoVenda || '')}
                        />
                      </div>
                    </div>

                    {item._erro && (
                      <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>✗ {item._erro}</div>
                    )}
                  </div>

                  {/* Botão confirmar */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, paddingTop: 4 }}>
                    <button
                      style={{ ...s.btn, background: 'var(--green)', color: '#fff', whiteSpace: 'nowrap' }}
                      onClick={() => baixarItem(idx)}
                      disabled={item._baixando || !item._dataVenda}
                    >
                      {item._baixando ? '⏳' : '✓ Confirmar baixa'}
                    </button>
                    <button
                      style={{ ...s.btn, background: 'transparent', color: 'var(--ink-muted)', border: '1px solid var(--border)', fontSize: 12, padding: '5px 12px' }}
                      onClick={() => updateItem(idx, 'jaVendida', true)}
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CONFIRMADOS */}
        {confirmados.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--green)', letterSpacing: '-0.3px' }}>
              ✓ Baixas confirmadas — {confirmados.length} {confirmados.length === 1 ? 'item' : 'itens'}
            </div>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Pedido</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Peça</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Descrição</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Data venda</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Preço</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => !item._confirmado ? null : (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>#{item.pedidoNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--blue-500)' }}>{item.idPeca}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--ink-soft)' }}>{item.descricao}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{item._dataVenda}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'Geist Mono, monospace', fontSize: 12, textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmt(Number(item._precoVenda) || item.precoVenda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* JÁ VENDIDOS / NÃO ACHADOS */}
        {buscou && (jaVendidos.length > 0 || naoAchados.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: jaVendidos.length && naoAchados.length ? '1fr 1fr' : '1fr', gap: 14 }}>
            {jaVendidos.length > 0 && (
              <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 8 }}>⏭ Já vendidas no ANB ({jaVendidos.length})</div>
                {jaVendidos.map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--ink-muted)', padding: '3px 0', borderBottom: '1px solid var(--border)', fontFamily: 'Geist Mono, monospace' }}>
                    {item.idPeca} — {item.descricao.slice(0, 35)}{item.descricao.length > 35 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
            {naoAchados.length > 0 && (
              <div style={{ background: 'var(--red-light)', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>✗ Não encontradas no ANB ({naoAchados.length})</div>
                <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8, lineHeight: 1.5 }}>
                  Esses produtos estão no Bling mas não foram importados para o ANB. Rode a importação de produtos primeiro.
                </div>
                {naoAchados.slice(0, 5).map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--red)', padding: '3px 0', borderBottom: '1px solid #fca5a5', fontFamily: 'Geist Mono, monospace' }}>
                    {item.skuBling || item.idPeca} — {item.descricao.slice(0, 35)}{item.descricao.length > 35 ? '…' : ''}
                  </div>
                ))}
                {naoAchados.length > 5 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>+{naoAchados.length - 5} mais...</div>}
              </div>
            )}
          </div>
        )}

        {/* EMPTY */}
        {buscou && itens.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhuma venda encontrada</div>
            <div style={{ fontSize: 13 }}>Não há pedidos concluídos no Bling para o período informado.</div>
          </div>
        )}

      </div>
    </>
  );
}
