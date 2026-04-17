'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartPanel, HeatmapChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const currentYear = String(new Date().getFullYear());
const currentMonth = String(new Date().getMonth() + 1);

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const cs: any = {
  topbar: {
    minHeight: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th: {
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontFamily: 'Geist Mono, monospace',
    fontSize: 10.5,
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-muted)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '11px 14px',
    verticalAlign: 'middle' as const,
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
  },
  sel: {
    background: 'var(--gray-50)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '7px 11px',
    fontSize: 13,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    height: 32,
    cursor: 'pointer',
  },
};

export default function DespesasReceitaPage() {
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [filtroAno, setFiltroAno] = useState(currentYear);
  const [filtroMes, setFiltroMes] = useState(currentMonth);
  const [payload, setPayload] = useState<any>(null);
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isCompact = isPhone || isTabletPortrait;

  useEffect(() => {
    setLoading(true);
    api.financeiro.despesasReceita({
      ano: filtroAno,
      ...(filtroMes ? { mes: filtroMes } : {}),
    })
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [filtroAno, filtroMes]);

  const months = Array.isArray(payload?.months) ? payload.months : [];
  const categorias: string[] = Array.isArray(payload?.categorias) ? payload.categorias : [];
  const totals = payload?.totals || {
    receitaBruta: 0,
    taxasMl: 0,
    fretePago: 0,
    despesasGerais: 0,
    totalSaidas: 0,
    resultadoBruto: 0,
    porCategoria: {},
  };

  function pctReceita(value: number) {
    if (!totals.receitaBruta) return null;
    return ((value / totals.receitaBruta) * 100).toFixed(1) + '% da receita';
  }

  const heatmapRows = useMemo(() => {
    const buildRow = (label: string, field: string, note?: string) => ({
      label,
      note,
      cells: months.map((item: any) => ({
        label: MESES[(item.mes || 1) - 1] || item.label,
        value: Number(item[field] || 0),
        displayValue: fmt(Number(item[field] || 0)),
      })),
    });

    const categoriaRows = categorias.map((cat) => ({
      label: `↳ ${cat}`,
      note: `Despesas da categoria ${cat}`,
      cells: months.map((item: any) => ({
        label: MESES[(item.mes || 1) - 1] || item.label,
        value: Number(item.despesasPorCategoria?.[cat] || 0),
        displayValue: fmt(Number(item.despesasPorCategoria?.[cat] || 0)),
      })),
    }));

    return [
      buildRow('Receita bruta', 'receitaBruta', 'Base bruta das vendas por mes'),
      buildRow('Taxas ML', 'taxasMl', 'Taxas cobradas pelo Mercado Livre'),
      buildRow('Frete pago', 'fretePago', 'Frete vinculado as vendas do periodo'),
      buildRow('Despesas gerais', 'despesasGerais', 'Despesas cadastradas no periodo'),
      ...categoriaRows,
      buildRow('Saidas totais', 'totalSaidas', 'Taxas + frete + despesas gerais'),
      buildRow('Resultado bruto', 'resultadoBruto', 'Receita bruta menos as saidas do periodo'),
    ];
  }, [months, categorias]);

  const anosDisponiveis = useMemo(() => {
    const current = Number(filtroAno) || new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => current - index);
  }, [filtroAno]);

  return (
    <>
      <div
        style={{
          ...cs.topbar,
          alignItems: isCompact ? 'flex-start' : 'center',
          flexDirection: isCompact ? 'column' : 'row',
          gap: 10,
          padding: isCompact ? '14px 16px' : cs.topbar.padding,
        }}
      >
        <div>
          <div style={cs.title}>Despesas x Receita</div>
          <div style={cs.sub}>Comparativo mensal entre receita bruta, taxas, frete e despesas gerais</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} />
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          {[
            { label: 'Receita bruta', value: totals.receitaBruta, color: 'var(--blue-500)' },
            { label: 'Taxas + frete', value: totals.taxasMl + totals.fretePago, color: 'var(--amber)' },
            { label: 'Despesas gerais', value: totals.despesasGerais, color: 'var(--red)' },
            { label: 'Resultado bruto', value: totals.resultadoBruto, color: totals.resultadoBruto >= 0 ? 'var(--green)' : 'var(--red)' },
          ].map((card) => (
            <div key={card.label} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color, ...sensitiveMaskStyle(hidden) }}>
                {sensitiveText(fmt(card.value), hidden)}
              </div>
              {pctReceita(card.value) && card.label !== 'Receita bruta' && (
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                  {pctReceita(card.value)}
                </div>
              )}
            </div>
          ))}
          {/* Cards por categoria de despesa */}
          {categorias.map((cat) => {
            const val = totals.porCategoria?.[cat] || 0;
            return (
              <div key={cat} style={cs.sCard}>
                <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>
                  {cat}
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: 'var(--red)', ...sensitiveMaskStyle(hidden) }}>
                  {sensitiveText(fmt(val), hidden)}
                </div>
                {pctReceita(val) && (
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                    {pctReceita(val)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ ...cs.card, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(150px, 1fr))', gap: 8, width: isCompact ? '100%' : 'auto' }}>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtroAno} onChange={(event) => setFiltroAno(event.target.value)}>
                {anosDisponiveis.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
              </select>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtroMes} onChange={(event) => setFiltroMes(event.target.value)}>
                <option value="">Todos os meses</option>
                {MESES.map((mes, index) => <option key={mes} value={String(index + 1)}>{mes}</option>)}
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ ...cs.card, padding: 24, color: 'var(--ink-muted)' }}>Carregando comparativo...</div>
          ) : (
            <ChartPanel
              title="Painel mensal de despesas x receita"
              subtitle="Os valores de receita consideram o bruto; taxas do ML e frete ficam destacados na composicao das saidas."
              accent="#2563eb"
            >
              <HeatmapChart rows={heatmapRows} rowHeaderLabel="Indicador" valueFormatter={fmt} emptyText="Sem dados para o periodo selecionado." />
            </ChartPanel>
          )
        ) : (
          <div style={cs.card}>
            <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Relatorio mensal
            </div>

            {isCompact ? (
              <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                {loading ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
                ) : !months.length ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem dados para o periodo selecionado.</div>
                ) : months.map((item: any) => (
                  <div key={`${item.ano}-${item.mes}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{MESES[(item.mes || 1) - 1]}/{item.ano}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      {[
                        ['Receita bruta', Number(item.receitaBruta || 0), 'var(--blue-500)'],
                        ['Taxas ML', Number(item.taxasMl || 0), 'var(--amber)'],
                        ['Frete pago', Number(item.fretePago || 0), 'var(--amber)'],
                        ['Despesas gerais', Number(item.despesasGerais || 0), 'var(--red)'],
                        ['Saidas totais', Number(item.totalSaidas || 0), 'var(--ink)'],
                        ['Resultado bruto', Number(item.resultadoBruto || 0), Number(item.resultadoBruto || 0) >= 0 ? 'var(--green)' : 'var(--red)'],
                      ].map(([label, value, color]) => (
                        <div key={String(label)}>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>{label}</div>
                          <div style={{ fontSize: 12, color: String(color), fontFamily: 'Geist Mono, monospace', marginTop: 4, ...sensitiveMaskStyle(hidden) }}>
                            {sensitiveText(fmt(Number(value)), hidden)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      {['Mes', 'Receita bruta', 'Taxas ML', 'Frete pago', 'Despesas gerais', 'Saidas totais', 'Resultado bruto'].map((header) => (
                        <th key={header} style={cs.th}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)' }}>Carregando...</td></tr>
                    ) : !months.length ? (
                      <tr><td colSpan={7} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)' }}>Sem dados para o periodo selecionado.</td></tr>
                    ) : months.map((item: any) => (
                      <tr key={`${item.ano}-${item.mes}`}>
                        <td style={{ ...cs.td, fontWeight: 600 }}>{MESES[(item.mes || 1) - 1]}/{item.ano}</td>
                        <td style={{ ...cs.td, color: 'var(--blue-500)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaBruta || 0)), hidden)}</td>
                        <td style={{ ...cs.td, color: 'var(--amber)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.taxasMl || 0)), hidden)}</td>
                        <td style={{ ...cs.td, color: 'var(--amber)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.fretePago || 0)), hidden)}</td>
                        <td style={{ ...cs.td, color: 'var(--red)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.despesasGerais || 0)), hidden)}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.totalSaidas || 0)), hidden)}</td>
                        <td style={{ ...cs.td, color: Number(item.resultadoBruto || 0) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'Geist Mono, monospace', fontWeight: 700, ...sensitiveMaskStyle(hidden) }}>
                          {sensitiveText(fmt(Number(item.resultadoBruto || 0)), hidden)}
                        </td>
                      </tr>
                    ))}
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
