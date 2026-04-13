'use client';

import { useEffect, useState } from 'react';
import { ChartPanel, DonutChart, HeatmapChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentYear() {
  return String(new Date().getFullYear());
}

function currentMonth() {
  return new Date().getMonth() + 1;
}

function quarterLabel(mes: number) {
  if (mes <= 3) return '1T';
  if (mes <= 6) return '2T';
  if (mes <= 9) return '3T';
  return '4T';
}

function periodKey(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
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
  },
  td: { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
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

export default function FaturamentoGeralPage() {
  const [data, setData] = useState<any[]>([]);
  const [filtAno, setFiltAno] = useState(currentYear());
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isCompact = isPhone || isTabletPortrait;

  useEffect(() => {
    api.faturamento.geral().then((response) => {
      setData(response);
      setLoading(false);
    });
  }, []);

  const anos = Array.from(new Set(data.map((item: any) => item.ano))).sort((a, b) => b - a);
  const filtered = data.filter((item) => !filtAno || item.ano === Number(filtAno));
  const mesAtual = currentMonth();
  const anoCardAtual = filtAno ? Number(filtAno) : new Date().getFullYear();

  const totalReceita = filtered.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
  const totalQtd = filtered.reduce((sum, item) => sum + Number(item.qtd || 0), 0);
  const mesCorrente = filtered.find((item) => item.ano === anoCardAtual && item.mes === mesAtual) || null;

  const periodItems = filtAno
    ? Array.from({ length: 12 }, (_, index) => ({
        key: periodKey(Number(filtAno), index + 1),
        label: MESES[index],
      }))
    : Array.from(
        new Set(
          filtered
            .slice()
            .sort((a, b) => periodKey(a.ano, a.mes).localeCompare(periodKey(b.ano, b.mes)))
            .map((item) => periodKey(item.ano, item.mes)),
        ),
      )
        .slice(-12)
        .map((key) => {
          const [ano, mes] = key.split('-');
          return {
            key,
            label: `${MESES[Number(mes) - 1]}/${String(ano).slice(-2)}`,
          };
        });

  const monthlyMap = new Map<string, { receita: number; qtd: number }>();
  filtered.forEach((item) => {
    const key = periodKey(item.ano, item.mes);
    const current = monthlyMap.get(key) || { receita: 0, qtd: 0 };
    current.receita += Number(item.receitaLiq || item.receita || 0);
    current.qtd += Number(item.qtd || 0);
    monthlyMap.set(key, current);
  });

  const painelMensalRows = [
    {
      label: 'Receita liquida',
      note: fmt(totalReceita),
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        return {
          label: period.label,
          value: current.receita,
          displayValue: current.receita > 0 ? fmt(current.receita) : '--',
          note: current.qtd > 0 ? `${current.qtd} p` : '',
        };
      }),
    },
    {
      label: 'Pecas vendidas',
      note: `${totalQtd} pecas`,
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        return {
          label: period.label,
          value: current.qtd,
          displayValue: current.qtd > 0 ? current.qtd.toLocaleString('pt-BR') : '--',
          note: '',
        };
      }),
    },
    {
      label: 'Ticket medio',
      note: totalQtd > 0 ? fmt(totalReceita / totalQtd) : '--',
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        const ticket = current.qtd > 0 ? current.receita / current.qtd : 0;
        return {
          label: period.label,
          value: ticket,
          displayValue: current.qtd > 0 ? fmt(ticket) : '--',
          note: current.qtd > 0 ? `${current.qtd} p` : '',
        };
      }),
    },
  ];

  const quarterMap = new Map<string, { receita: number; qtd: number }>();
  filtered.forEach((item) => {
    const key = filtAno ? quarterLabel(item.mes) : `${quarterLabel(item.mes)}/${String(item.ano).slice(-2)}`;
    const current = quarterMap.get(key) || { receita: 0, qtd: 0 };
    current.receita += Number(item.receitaLiq || item.receita || 0);
    current.qtd += Number(item.qtd || 0);
    quarterMap.set(key, current);
  });

  const quarterItems = Array.from(quarterMap.entries())
    .map(([label, value]) => ({ label, value: value.receita, note: `${value.qtd} pecas` }))
    .sort((a, b) => b.value - a.value);

  const topPeriods = filtered
    .map((item) => ({
      label: `${MESES[item.mes - 1]}/${item.ano}`,
      value: Number(item.receitaLiq || item.receita || 0),
      note: `${item.qtd} pecas`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <>
      <div style={{ ...cs.topbar, alignItems: isCompact ? 'flex-start' : 'center', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : cs.topbar.padding }}>
        <div>
          <div style={cs.title}>Faturamento Geral</div>
          <div style={cs.sub}>Receita total consolidada</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} />
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Receita total', value: fmt(totalReceita), color: 'var(--sage)' },
            { label: 'Pecas vendidas', value: totalQtd.toLocaleString('pt-BR'), color: 'var(--ink)' },
            {
              label: 'Mes corrente',
              value: `${MESES[mesAtual - 1]}/${anoCardAtual}`,
              color: 'var(--amber)',
              sub: fmt(Number(mesCorrente?.receitaLiq || mesCorrente?.receita || 0)),
            },
          ].map((card) => (
            <div key={card.label} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.value, hidden)}</div>
              {card.sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.sub, hidden)}</div>}
            </div>
          ))}
        </div>

        <div style={{ ...cs.card, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
            <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtAno} onChange={(e) => setFiltAno(e.target.value)}>
              <option value="">Todos os anos</option>
              {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <ChartPanel
                title="Painel mensal consolidado"
                subtitle="Matriz compacta com receita, volume e ticket medio ao longo do periodo."
                accent="#16a34a"
              >
                <HeatmapChart rows={painelMensalRows} rowHeaderLabel="Indicador" normalizeByRow emptyText="Sem periodos para exibir." />
              </ChartPanel>

              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 18 }}>
                <ChartPanel
                  title="Distribuicao por trimestre"
                  subtitle={filtAno ? 'Resumo trimestral do ano selecionado.' : 'Resumo trimestral considerando o filtro atual.'}
                  accent="#2563eb"
                >
                  <DonutChart items={quarterItems} totalLabel="Receita" totalDisplay={fmt(totalReceita)} valueFormatter={fmt} emptyText="Sem distribuicao trimestral." />
                </ChartPanel>
                <ChartPanel
                  title="Top periodos"
                  subtitle="Os meses com melhor resultado liquido dentro do filtro."
                  accent="#f59e0b"
                >
                  <HorizontalBarChart items={topPeriods} valueFormatter={fmt} emptyText="Sem periodos para ranquear." />
                </ChartPanel>
              </div>
            </div>
          )
        ) : (
          <div style={cs.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Relatorio mensal</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{filtered.length} linhas no filtro</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'repeat(3, minmax(0, 1fr))' : 'repeat(12, minmax(0, 1fr))', gap: 8, padding: isCompact ? 14 : 18, borderBottom: '1px solid var(--border)' }}>
              {MESES.map((mes, index) => {
                const monthRows = filtered.filter((item) => item.mes === index + 1);
                const receita = monthRows.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
                const qtd = monthRows.reduce((sum, item) => sum + Number(item.qtd || 0), 0);
                const active = monthRows.length > 0;
                return (
                  <div
                    key={mes}
                    style={{
                      background: active ? 'var(--sage-light)' : 'var(--white)',
                      border: `1px solid ${active ? 'var(--sage-mid)' : 'var(--border)'}`,
                      borderRadius: 8,
                      padding: '10px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 9, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>{mes}</div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 12, fontWeight: 600, color: active ? 'var(--sage)' : 'var(--gray-300)', ...sensitiveMaskStyle(hidden) }}>
                      {active ? sensitiveText(fmt(receita), hidden) : '--'}
                    </div>
                    {active && <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', marginTop: 2, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(`${qtd} pecas`, hidden)}</div>}
                  </div>
                );
              })}
            </div>

            {isCompact ? (
              <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                {loading ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
                ) : !filtered.length ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem dados</div>
                ) : filtered.map((item, index) => (
                  <div key={`${item.ano}-${item.mes}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Mes</div>
                        <div style={{ fontSize: 12 }}>{MESES_FULL[item.mes - 1]}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Ano</div>
                        <div style={{ fontSize: 12 }}>{item.ano}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Receita liquida</div>
                        <div style={{ fontSize: 13, color: 'var(--sage)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaLiq || item.receita || 0)), hidden)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Qtd. pecas</div>
                        <div style={{ fontSize: 12, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(String(item.qtd), hidden)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>{['Mes', 'Ano', 'Receita liquida', 'Qtd. pecas'].map((header) => <th key={header} style={cs.th}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Sem dados</td></tr>
                    ) : filtered.map((item, index) => (
                      <tr key={`${item.ano}-${item.mes}-${index}`}>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{MESES_FULL[item.mes - 1]}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{item.ano}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', color: 'var(--sage)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaLiq || item.receita || 0)), hidden)}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(String(item.qtd), hidden)}</td>
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
