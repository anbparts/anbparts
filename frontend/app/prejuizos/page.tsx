'use client';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt  = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];

export default function PrejuizosPage() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ data: today(), detalhe: '', valor: '', frete: '' });
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/financeiro/prejuizos`).then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totalValor = rows.reduce((s, r) => s + r.valor, 0);
  const totalFrete = rows.reduce((s, r) => s + r.frete, 0);
  const total      = totalValor + totalFrete;

  async function salvar() {
    if (!form.detalhe) return;
    setSaving(true);
    await fetch(`${BASE}/financeiro/prejuizos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: form.data, detalhe: form.detalhe, valor: Number(form.valor) || 0, frete: Number(form.frete) || 0 }) });
    setForm({ data: today(), detalhe: '', valor: '', frete: '' });
    setShowForm(false); setSaving(false); load();
  }

  async function excluir(id: number) {
    if (!confirm('Excluir prejuízo?')) return;
    await fetch(`${BASE}/financeiro/prejuizos/${id}`, { method: 'DELETE' });
    load();
  }

  const inp = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%' };

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Prejuízos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Registro de peças com problema, extravio, etc.</div>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {showForm ? '✕ Fechar' : '+ Novo prejuízo'}
        </button>
      </div>

      <div style={{ padding: 28 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Total prejuízos', v: total,      c: 'var(--red)' },
            { l: 'Valor peças',     v: totalValor, c: 'var(--amber)' },
            { l: 'Frete',           v: totalFrete, c: 'var(--gray-600)' },
            { l: 'Ocorrências',     v: rows.length, c: 'var(--gray-800)', isFmt: false },
          ].map(c => (
            <div key={c.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{c.l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.c, letterSpacing: '-0.4px' }}>{(c as any).isFmt === false ? c.v : fmt(c.v as number)}</div>
            </div>
          ))}
        </div>

        {/* Formulário */}
        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo prejuízo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Data</div><input style={inp} type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Detalhamento *</div><input style={inp} placeholder="Ex: Peça CR-001 com defeito" value={form.detalhe} onChange={e => setForm(f => ({ ...f, detalhe: e.target.value }))} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Valor (R$)</div><input style={inp} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Frete (R$)</div><input style={inp} type="number" step="0.01" placeholder="0,00" value={form.frete} onChange={e => setForm(f => ({ ...f, frete: e.target.value }))} /></div>
              <button onClick={salvar} disabled={saving || !form.detalhe} style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {saving ? '...' : '✓ Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
            Ocorrências <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— {rows.length}</span>
          </div>
          {loading ? <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'Detalhamento', 'Valor peça', 'Frete', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: ['Valor peça','Frete','Total'].includes(h) ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{new Date(r.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)' }}>{r.detalhe}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(r.valor)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(r.frete)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{fmt(r.valor + r.frete)}</td>
                      <td style={{ padding: '9px 10px', width: 40 }}>
                        <button onClick={() => excluir(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">🗑</button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Nenhum prejuízo registrado</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
