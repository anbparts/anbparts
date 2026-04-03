'use client';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt  = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];

const CATEGS = ['Insumo', 'Serviços', 'Taxas', 'Aluguel', 'Sistemas', 'Contador', 'Moto', 'Outros'];
const CATEG_COLORS: Record<string, string> = {
  Insumo: '#dbeafe:#1e56a0', Serviços: '#fef3c7:#d97706', Taxas: '#fee2e2:#dc2626',
  Aluguel: '#f1f5f9:#64748b', Sistemas: '#dbeafe:#2563eb', Contador: '#f1f5f9:#475569',
  Moto: '#dcfce7:#16a34a', Outros: '#f1f5f9:#64748b',
};

function CategBadge({ cat }: { cat: string }) {
  const [bg, color] = (CATEG_COLORS[cat] || '#f1f5f9:#64748b').split(':');
  return <span style={{ background: bg, color, padding: '2px 10px', borderRadius: 99, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{cat}</span>;
}

export default function DespesasPage() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroC, setFiltroC] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ data: today(), detalhes: '', categoria: 'Insumo', valor: '' });
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/financeiro/despesas`).then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtradas = filtroC ? rows.filter(r => r.categoria === filtroC) : rows;
  const total     = filtradas.reduce((s, r) => s + r.valor, 0);

  async function salvar() {
    if (!form.detalhes || !form.valor) return;
    setSaving(true);
    await fetch(`${BASE}/financeiro/despesas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, valor: Number(form.valor) }) });
    setForm({ data: today(), detalhes: '', categoria: 'Insumo', valor: '' });
    setShowForm(false); setSaving(false); load();
  }

  async function excluir(id: number) {
    if (!confirm('Excluir despesa?')) return;
    await fetch(`${BASE}/financeiro/despesas/${id}`, { method: 'DELETE' });
    load();
  }

  const inp = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' };

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Despesas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Despesas operacionais</div>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {showForm ? '✕ Fechar' : '+ Nova despesa'}
        </button>
      </div>

      <div style={{ padding: 28 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total despesas</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.4px' }}>{fmt(total)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Lançamentos</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gray-800)', letterSpacing: '-0.4px' }}>{filtradas.length}</div>
          </div>
        </div>

        {/* Formulário */}
        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gray-800)' }}>Nova despesa</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Data</div>
                <input style={{ ...inp, width: '100%' }} type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Detalhes *</div>
                <input style={{ ...inp, width: '100%' }} placeholder="Ex: Bobina plástico bolha" value={form.detalhes} onChange={e => setForm(f => ({ ...f, detalhes: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Categoria</div>
                <select style={{ ...inp, width: '100%', cursor: 'pointer' }} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 5 }}>Valor (R$) *</div>
                <input style={{ ...inp, width: '100%' }} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              <button onClick={salvar} disabled={saving || !form.detalhes || !form.valor} style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {saving ? '...' : '✓ Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Lançamentos <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— {filtradas.length}</span></div>
            <select style={{ ...inp, cursor: 'pointer' }} value={filtroC} onChange={e => setFiltroC(e.target.value)}>
              <option value="">Todas categorias</option>
              {CATEGS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {loading ? <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'Detalhes', 'Categoria', 'Valor', ''].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: h === 'Valor' ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)' }}>{new Date(r.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)' }}>{r.detalhes}</td>
                      <td style={{ padding: '9px 16px' }}><CategBadge cat={r.categoria} /></td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>{fmt(r.valor)}</td>
                      <td style={{ padding: '9px 10px', width: 40 }}>
                        <button onClick={() => excluir(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">🗑</button>
                      </td>
                    </tr>
                  ))}
                  {!filtradas.length && <tr><td colSpan={5} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Nenhuma despesa encontrada</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
