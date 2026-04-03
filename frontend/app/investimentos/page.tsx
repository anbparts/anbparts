'use client';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt  = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];
const SOCIOS = ['Bruno', 'Nelson', 'Alex'];

export default function InvestimentosPage() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroS, setFiltroS] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ data: today(), socio: 'Bruno', moto: '', valor: '' });
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/financeiro/investimentos`).then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtradas  = filtroS ? rows.filter(r => r.socio === filtroS) : rows;
  const totalGeral = rows.reduce((s, r) => s + r.valor, 0);

  // Total por sócio
  const porSocio: Record<string, number> = {};
  rows.forEach(r => { porSocio[r.socio] = (porSocio[r.socio] || 0) + r.valor; });

  async function salvar() {
    if (!form.valor) return;
    setSaving(true);
    await fetch(`${BASE}/financeiro/investimentos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: form.data, socio: form.socio, moto: form.moto || null, valor: Number(form.valor) }) });
    setForm({ data: today(), socio: 'Bruno', moto: '', valor: '' });
    setShowForm(false); setSaving(false); load();
  }

  async function excluir(id: number) {
    if (!confirm('Excluir investimento?')) return;
    await fetch(`${BASE}/financeiro/investimentos/${id}`, { method: 'DELETE' });
    load();
  }

  const inp = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' };
  const CORES_SOCIO: Record<string, string> = { Bruno: 'var(--blue-500)', Nelson: 'var(--green)', Alex: 'var(--amber)' };

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Investimentos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Aportes por sócio</div>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {showForm ? '✕ Fechar' : '+ Novo investimento'}
        </button>
      </div>

      <div style={{ padding: 28 }}>
        {/* Cards por sócio */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total geral</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue-500)', letterSpacing: '-0.4px' }}>{fmt(totalGeral)}</div>
          </div>
          {SOCIOS.map(s => (
            <div key={s} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{s}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: CORES_SOCIO[s], letterSpacing: '-0.4px' }}>{fmt(porSocio[s] || 0)}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                {totalGeral ? ((porSocio[s] || 0) / totalGeral * 100).toFixed(1) : '0'}%
              </div>
            </div>
          ))}
        </div>

        {/* Formulário */}
        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo investimento</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Data</div><input style={inp} type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Sócio</div>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.socio} onChange={e => setForm(f => ({ ...f, socio: e.target.value }))}>
                  {SOCIOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Moto / Item</div><input style={inp} placeholder="Ex: ID 3, Pallet..." value={form.moto} onChange={e => setForm(f => ({ ...f, moto: e.target.value }))} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Valor (R$) *</div><input style={inp} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} /></div>
              <button onClick={salvar} disabled={saving || !form.valor} style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {saving ? '...' : '✓ Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Aportes <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— {filtradas.length}</span></div>
            <select style={{ ...inp, width: 'auto', cursor: 'pointer' }} value={filtroS} onChange={e => setFiltroS(e.target.value)}>
              <option value="">Todos os sócios</option>
              {SOCIOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {loading ? <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'Sócio', 'Moto / Item', 'Valor', ''].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: h === 'Valor' ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{new Date(r.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 16px' }}>
                        <span style={{ fontWeight: 600, color: CORES_SOCIO[r.socio] || 'var(--gray-800)' }}>{r.socio}</span>
                      </td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-500)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{r.moto || '—'}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--blue-500)', fontWeight: 600 }}>{fmt(r.valor)}</td>
                      <td style={{ padding: '9px 10px', width: 40 }}>
                        <button onClick={() => excluir(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">🗑</button>
                      </td>
                    </tr>
                  ))}
                  {!filtradas.length && <tr><td colSpan={5} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Nenhum investimento registrado</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
