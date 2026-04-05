'use client';

import { useEffect, useState } from 'react';
import { ChartPanel, ColumnChart, DonutChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const CATEGORIAS = ['Insumo', 'Servicos', 'Taxas', 'Aluguel', 'Sistemas', 'Contador', 'Moto', 'Outros'];

const CATEG_COLORS: Record<string, string> = {
  Insumo: '#2563eb',
  Servicos: '#f59e0b',
  Taxas: '#ef4444',
  Aluguel: '#64748b',
  Sistemas: '#0ea5e9',
  Contador: '#475569',
  Moto: '#16a34a',
  Outros: '#8b5cf6',
};

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function currentYear() {
  return String(new Date().getFullYear());
}

function monthKey(dateValue: string) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(dateValue: string) {
  const date = new Date(dateValue);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function CategBadge({ categoria }: { categoria: string }) {
  const color = CATEG_COLORS[categoria] || '#64748b';
  return (
    <span
      style={{
        background: `${color}18`,
        color,
        padding: '2px 10px',
        borderRadius: 99,
        fontSize: 11,
        fontFamily: 'Geist Mono, monospace',
        fontWeight: 500,
      }}
    >
      {categoria}
    </span>
  );
}

export default function DespesasPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroAno, setFiltroAno] = useState(currentYear());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [form, setForm] = useState({ data: today(), detalhes: '', categoria: 'Insumo', valor: '' });

  const inputStyle: any = {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    color: 'var(--ink)',
  };

  function load() {
    setLoading(true);
    fetch(`${BASE}/financeiro/despesas`)
      .then((response) => response.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const anos = Array.from(new Set(
    rows.map((item) => new Date(item.data).getFullYear()).filter((ano) => Number.isFinite(ano)),
  )).sort((a, b) => b - a);

  const filtradas = rows.filter((item) => {
    const ano = new Date(item.data).getFullYear();
    return (!filtroCategoria || item.categoria === filtroCategoria)
      && (!filtroAno || ano === Number(filtroAno));
  });
  const total = filtradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  const porCategoriaMap = new Map<string, number>();
  const porMesMap = new Map<string, { label: string; value: number }>();

  filtradas.forEach((item) => {
    const categoria = item.categoria || 'Outros';
    const valor = Number(item.valor || 0);
    porCategoriaMap.set(categoria, (porCategoriaMap.get(categoria) || 0) + valor);

    const key = monthKey(item.data);
    const current = porMesMap.get(key) || { label: monthLabel(item.data), value: 0 };
    current.value += valor;
    porMesMap.set(key, current);
  });

  const categoriasOrdenadas = Array.from(porCategoriaMap.entries())
    .map(([label, value]) => ({ label, value, color: CATEG_COLORS[label], note: `${((value / Math.max(total, 1)) * 100).toFixed(1).replace('.', ',')}%` }))
    .sort((a, b) => b.value - a.value);

  const linhaTempo = Array.from(porMesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value)
    .slice(-8);

  async function salvar() {
    if (!form.detalhes || !form.valor) return;
    setSaving(true);
    await fetch(`${BASE}/financeiro/despesas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, valor: Number(form.valor) }),
    });
    setForm({ data: today(), detalhes: '', categoria: 'Insumo', valor: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function excluir(id: number) {
    if (!confirm('Excluir despesa?')) return;
    await fetch(`${BASE}/financeiro/despesas/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Despesas</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Despesas operacionais</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ViewModeSwitch value={modo} onChange={setModo} />
          <button
            onClick={() => setShowForm((value) => !value)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            {showForm ? 'Fechar' : '+ Nova despesa'}
          </button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total despesas</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.4px' }}>{fmt(total)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Lancamentos</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.4px' }}>{filtradas.length}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Maior categoria</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue-500)', letterSpacing: '-0.4px' }}>
              {categoriasOrdenadas[0]?.label || '--'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 6 }}>{categoriasOrdenadas[0] ? fmt(categoriasOrdenadas[0].value) : 'Sem dados'}</div>
          </div>
        </div>

        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--ink)' }}>Nova despesa</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Data</div>
                <input style={{ ...inputStyle, width: '100%' }} type="date" value={form.data} onChange={(e) => setForm((value) => ({ ...value, data: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Detalhes *</div>
                <input style={{ ...inputStyle, width: '100%' }} placeholder="Ex: Bobina plastico bolha" value={form.detalhes} onChange={(e) => setForm((value) => ({ ...value, detalhes: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Categoria</div>
                <select style={{ ...inputStyle, width: '100%', cursor: 'pointer' }} value={form.categoria} onChange={(e) => setForm((value) => ({ ...value, categoria: e.target.value }))}>
                  {CATEGORIAS.map((categoria) => <option key={categoria}>{categoria}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Valor (R$) *</div>
                <input style={{ ...inputStyle, width: '100%' }} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={(e) => setForm((value) => ({ ...value, valor: e.target.value }))} />
              </div>
              <button
                onClick={salvar}
                disabled={saving || !form.detalhes || !form.valor}
                style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Visualizacao <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 400 }}>- {filtradas.length} registros</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas categorias</option>
                {CATEGORIAS.map((categoria) => <option key={categoria}>{categoria}</option>)}
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 18 }}>
                <ChartPanel title="Distribuicao por categoria" subtitle="Entenda onde o caixa esta sendo consumido." accent="#ef4444">
                  <DonutChart items={categoriasOrdenadas} totalLabel="Despesas" totalDisplay={fmt(total)} valueFormatter={fmt} emptyText="Sem despesas para distribuir." />
                </ChartPanel>
                <ChartPanel title="Ranking de categorias" subtitle="As categorias mais pesadas dentro do filtro atual." accent="#2563eb">
                  <HorizontalBarChart items={categoriasOrdenadas} valueFormatter={fmt} emptyText="Sem categorias para comparar." />
                </ChartPanel>
              </div>
              <ChartPanel title="Evolucao por mes" subtitle="Barras mensais para comparar concentracao e ritmo das despesas." accent="#f59e0b">
                <ColumnChart items={linhaTempo} valueFormatter={fmt} emptyText="Sem linha do tempo para mostrar." />
              </ChartPanel>
            </div>
          )
        ) : (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      {['Data', 'Detalhes', 'Categoria', 'Valor', ''].map((header) => (
                        <th key={header} style={{ padding: '9px 16px', textAlign: header === 'Valor' ? 'right' : 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 500 }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '9px 16px', fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--ink)' }}>{item.detalhes}</td>
                        <td style={{ padding: '9px 16px' }}><CategBadge categoria={item.categoria} /></td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>{fmt(Number(item.valor || 0))}</td>
                        <td style={{ padding: '9px 10px', width: 40 }}>
                          <button onClick={() => excluir(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">
                            x
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!filtradas.length && (
                      <tr><td colSpan={5} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Nenhuma despesa encontrada</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
