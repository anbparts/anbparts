'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  label:  { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
};

const FRETE_PADRAO = 29.90;
const TAXA_PADRAO  = 17;

type Item = {
  id: number; sku: string; nome: string; preco: number; qtdEstoque: number;
  motoId: number | null; moto: string | null;
  jaExiste: boolean; semPrefixo: boolean;
  _motoId?: string; _preco?: string; _frete?: string; _taxaPct?: string;
  _taxaVal?: string; _valorLiq?: string; _qtd?: string;
  _importando?: boolean; _importado?: boolean; _ignorado?: boolean; _erro?: string;
};

function calcLiq(preco: number, frete: number, taxaPct: number) {
  const taxaVal = parseFloat((preco * taxaPct / 100).toFixed(2));
  const valorLiq = parseFloat((preco - frete - taxaVal).toFixed(2));
  return { taxaVal, valorLiq };
}

export default function BlingProdutosPage() {
  const [motos, setMotos]           = useState<any[]>([]);
  const [connected, setConnected]   = useState<boolean | null>(null);
  const [buscando, setBuscando]     = useState(false);
  const [itens, setItens]           = useState<Item[]>([]);
  const [buscou, setBuscou]         = useState(false);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [motoFallback, setMotoFallback] = useState('');

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/bling/config`).then(r => r.json()).then(d => setConnected(d.hasTokens)).catch(() => setConnected(false));
  }, []);

  function initItem(item: Item): Item {
    const preco  = item.preco || 0;
    const frete  = FRETE_PADRAO;
    const taxaPct = TAXA_PADRAO;
    const { taxaVal, valorLiq } = calcLiq(preco, frete, taxaPct);
    return {
      ...item,
      _motoId:   item.motoId ? String(item.motoId) : '',
      _preco:    String(preco),
      _frete:    String(frete),
      _taxaPct:  String(taxaPct),
      _taxaVal:  String(taxaVal),
      _valorLiq: String(valorLiq),
      _qtd:      String(item.qtdEstoque || 1),
      _importado: item.jaExiste,
    };
  }

  async function buscar() {
    setBuscando(true); setBuscou(false); setItens([]);
    try {
      const r = await fetch(`${API}/bling/sync/produtos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataInicio, dataFim, motoIdFallback: motoFallback || null }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || 'Erro ao buscar'); return; }
      setItens(d.itens.map(initItem));
      setBuscou(true);
    } catch (e: any) { alert('Erro: ' + e.message); }
    setBuscando(false);
  }

  function updateItem(idx: number, field: string, val: any) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  function updateFinanceiro(idx: number, field: string, val: string) {
    setItens(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const upd = { ...item, [field]: val };
      const preco   = Number(upd._preco)  || 0;
      const frete   = Number(upd._frete)  || 0;
      const taxaPct = Number(upd._taxaPct)|| 0;
      const { taxaVal, valorLiq } = calcLiq(preco, frete, taxaPct);
      return { ...upd, _taxaVal: String(taxaVal), _valorLiq: String(valorLiq) };
    }));
  }

  async function importarItem(idx: number) {
    const item = itens[idx];
    if (!item._motoId) { updateItem(idx, '_erro', 'Selecione a moto'); return; }
    updateItem(idx, '_importando', true);
    try {
      const r = await fetch(`${API}/bling/importar-produto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id, sku: item.sku, nome: item.nome,
          preco:   Number(item._preco)   || item.preco,
          frete:   Number(item._frete)   || FRETE_PADRAO,
          taxaPct: Number(item._taxaPct) || TAXA_PADRAO,
          motoId:  item._motoId,
          qtd:     Number(item._qtd)     || 1,
        }),
      });
      const d = await r.json();
      if (d.ok) updateItem(idx, '_importado', true);
      else updateItem(idx, '_erro', d.error || 'Erro');
    } catch (e: any) { updateItem(idx, '_erro', e.message); }
    updateItem(idx, '_importando', false);
  }

  async function importarTodos() {
    const pendentes = itens.map((item, idx) => ({ item, idx })).filter(({ item }) => !item._importado && !item._ignorado && item._motoId);
    for (const { idx } of pendentes) await importarItem(idx);
  }

  const novos      = itens.filter(i => !i.jaExiste && !i._ignorado);
  const existentes = itens.filter(i => i.jaExiste);
  const importados = itens.filter(i => i._importado && !i.jaExiste);
  const pendentes  = novos.filter(i => i._motoId && !i._importado);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Produtos Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Revise e confirme a importação de novos produtos</div>
        </div>
        {buscou && pendentes.length > 0 && (
          <button onClick={importarTodos} style={{ ...s.btn, background: 'var(--green)', color: '#fff' }}>
            ✓ Importar todos com moto ({pendentes.length})
          </button>
        )}
      </div>

      <div style={{ padding: 28 }}>
        {/* Filtros */}
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>🔍 Buscar produtos ativos no Bling</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div><label style={s.label}>Data inclusão — início</label><input style={{ ...s.input, width: '100%' }} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
            <div><label style={s.label}>Data inclusão — fim</label><input style={{ ...s.input, width: '100%' }} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
            <div>
              <label style={s.label}>Moto padrão (sem prefixo)</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={motoFallback} onChange={e => setMotoFallback(e.target.value)}>
                <option value="">Ignorar sem prefixo</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
              </select>
            </div>
          </div>
          <button style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: (buscando || !connected) ? 0.6 : 1 }} onClick={buscar} disabled={buscando || !connected}>
            {buscando ? '⏳ Buscando...' : '🔍 Buscar produtos'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 12 }}>Frete padrão: R$ 29,90 · Taxa padrão: 17%</span>
        </div>

        {/* Resumo */}
        {buscou && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { l: 'Total',       v: itens.length,      c: 'var(--gray-700)' },
              { l: 'Novos',       v: novos.length,       c: 'var(--blue-500)' },
              { l: 'Já existiam', v: existentes.length,  c: 'var(--gray-400)' },
              { l: 'Importados',  v: importados.length,  c: 'var(--green)'    },
              { l: 'Pendentes',   v: pendentes.length,   c: 'var(--amber)'    },
            ].map(c => (
              <div key={c.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{c.l}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.c }}>{c.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Lista de novos produtos */}
        {novos.length > 0 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--blue-500)', marginBottom: 12 }}>📦 Novos produtos — {novos.length}</div>
            {novos.map((item) => {
              const realIdx = itens.indexOf(item);

              if (item._importado) return (
                <div key={item.id} style={{ ...s.card, borderLeft: '3px solid var(--green)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-400)', marginRight: 8 }}>{item.sku}</span>
                    <span style={{ fontSize: 13 }}>{item.nome}</span>
                    {Number(item._qtd) > 1 && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--blue-500)' }}>{item._qtd}x</span>}
                  </div>
                  <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>✓ Importado</span>
                </div>
              );

              return (
                <div key={item.id} style={{ ...s.card, borderLeft: `3px solid ${item.semPrefixo ? 'var(--amber)' : 'var(--blue-200)'}` }}>
                  {/* Header */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>{item.sku || 'sem SKU'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', flex: 1 }}>{item.nome}</span>
                    {item.qtdEstoque > 0 && <span style={{ fontSize: 12, background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 8px', borderRadius: 5 }}>📦 {item.qtdEstoque} em estoque</span>}
                    {item.semPrefixo && <span style={{ fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 5 }}>⚠ sem prefixo</span>}
                  </div>

                  {/* Campos financeiros */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={s.label}>Qtd a importar</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" min="1" value={item._qtd || '1'} onChange={e => updateItem(realIdx, '_qtd', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Preço ML (R$)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._preco || ''} onChange={e => updateFinanceiro(realIdx, '_preco', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Frete (R$)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._frete || ''} onChange={e => updateFinanceiro(realIdx, '_frete', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (%)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._taxaPct || ''} onChange={e => updateFinanceiro(realIdx, '_taxaPct', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (R$)</label>
                      <input style={{ ...s.input, width: '100%', background: 'var(--gray-50)', color: 'var(--gray-500)' }} readOnly value={item._taxaVal || ''} />
                    </div>
                    <div>
                      <label style={{ ...s.label, color: 'var(--green)', fontWeight: 600 }}>Valor Líquido</label>
                      <input style={{ ...s.input, width: '100%', background: '#f0fdf4', borderColor: '#86efac', fontWeight: 600, color: 'var(--green)' }} readOnly value={item._valorLiq || ''} />
                    </div>
                  </div>

                  {/* Moto + ações */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={{ ...s.input, minWidth: 220, cursor: 'pointer' }} value={item._motoId || ''} onChange={e => updateItem(realIdx, '_motoId', e.target.value)}>
                      <option value="">Selecione a moto...</option>
                      {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
                    </select>
                    <button onClick={() => importarItem(realIdx)} disabled={item._importando || !item._motoId} style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: (item._importando || !item._motoId) ? 0.5 : 1 }}>
                      {item._importando ? '⏳' : `✓ Importar${Number(item._qtd) > 1 ? ` (${item._qtd}x)` : ''}`}
                    </button>
                    <button onClick={() => updateItem(realIdx, '_ignorado', true)} style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}>Ignorar</button>
                    {item._erro && <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ {item._erro}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Já existiam */}
        {existentes.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-400)', marginBottom: 8 }}>⏭ Já existem no ANB — {existentes.length}</div>
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {existentes.slice(0, 15).map(i => <span key={i.id}>{i.sku || `BL${i.id}`}</span>)}
              {existentes.length > 15 && <span>+{existentes.length - 15} mais</span>}
            </div>
          </div>
        )}

        {buscou && novos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)', fontSize: 14 }}>Nenhum produto novo encontrado no período.</div>
        )}
      </div>
    </>
  );
}
