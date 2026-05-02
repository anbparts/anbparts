'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { ChartPanel, HeatmapChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const API = API_BASE;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentYear() {
  return String(new Date().getFullYear());
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
    whiteSpace: 'nowrap' as const,
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

export default function FaturamentoMotoPage() {
  const [data, setData] = useState<any[]>([]);
  const [skuPorMoto, setSkuPorMoto] = useState<Record<number, string[]>>({});
  const [filtMoto, setFiltMoto] = useState('');
  const [filtAno, setFiltAno] = useState(currentYear());
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [estoqueData, setEstoqueData] = useState<{ meses: string[]; porMoto: any[]; consolidado: any[] } | null>(null);
  const [estoqueLoading, setEstoqueLoading] = useState(false);
  const [estoqueMotoFilt, setEstoqueMotoFilt] = useState('todas');
  const [estoqueAnoFilt, setEstoqueAnoFilt] = useState(currentYear());
  const [estoqueMesFilt, setEstoqueMesFilt] = useState('');
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const isCompact = isPhone || isTabletPortrait;
  const shouldUseCompactMonthlyPanel = viewportMode !== 'desktop';

  useEffect(() => {
    Promise.all([
      api.faturamento.porMoto(),
      fetch(`${API}/bling/config-produtos`)
        .then((response) => response.ok ? response.json() : { prefixos: [] })
        .catch(() => ({ prefixos: [] })),
    ]).then(([response, configProdutos]) => {
      const grouped: Record<number, string[]> = {};
      for (const item of (configProdutos?.prefixos || [])) {
        const motoId = Number(item?.motoId);
        const prefixo = String(item?.prefixo || '').trim();
        if (!motoId || !prefixo) continue;
        if (!grouped[motoId]) grouped[motoId] = [];
        if (!grouped[motoId].includes(prefixo)) grouped[motoId].push(prefixo);
      }

      setSkuPorMoto(grouped);
      setData(response);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (modo !== 'estoque' || estoqueData) return;
    setEstoqueLoading(true);
    fetch(`${API}/faturamento/estoque-percentual`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setEstoqueData(d); setEstoqueLoading(false); })
      .catch(() => setEstoqueLoading(false));
  }, [modo]);

  const motos = Array.from(new Set(data.map((item: any) => item.moto))).sort();
  const anos = Array.from(new Set(data.map((item: any) => item.ano))).sort((a, b) => b - a);

  const filtered = data.filter((item) => (
    (!filtMoto || item.moto === filtMoto) &&
    (!filtAno || item.ano === Number(filtAno))
  ));

  const totalReceita = filtered.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
  const totalQtd = filtered.reduce((sum, item) => sum + Number(item.qtd || 0), 0);

  const porMotoMap = new Map<number, { nome: string; sku: string; receita: number; qtd: number }>();
  const porPeriodoMap = new Map<string, { label: string; receita: number; qtd: number; mes: number; ano: number }>();
  const heatmapMotoMap = new Map<number, {
    label: string;
    totalReceita: number;
    totalQtd: number;
    cells: Map<string, { receita: number; qtd: number }>;
  }>();

  filtered.forEach((item) => {
    const motoKey = Number(item.motoId);
    const period = periodKey(item.ano, item.mes);
    const receita = Number(item.receitaLiq || item.receita || 0);
    const qtd = Number(item.qtd || 0);
    const sku = (skuPorMoto[motoKey] || []).join(' - ');
    const motoLabel = sku ? `${sku} - ${item.moto}` : item.moto;

    const acumuladoMoto = porMotoMap.get(motoKey) || { nome: item.moto, sku, receita: 0, qtd: 0 };
    acumuladoMoto.receita += receita;
    acumuladoMoto.qtd += qtd;
    acumuladoMoto.nome = item.moto;
    acumuladoMoto.sku = sku;
    porMotoMap.set(motoKey, acumuladoMoto);

    const acumuladoPeriodo = porPeriodoMap.get(period) || {
      label: `${MESES[item.mes - 1]}/${String(item.ano).slice(-2)}`,
      receita: 0,
      qtd: 0,
      mes: item.mes,
      ano: item.ano,
    };
    acumuladoPeriodo.receita += receita;
    acumuladoPeriodo.qtd += qtd;
    porPeriodoMap.set(period, acumuladoPeriodo);

    const heatmapMoto = heatmapMotoMap.get(motoKey) || {
      label: motoLabel,
      totalReceita: 0,
      totalQtd: 0,
      cells: new Map<string, { receita: number; qtd: number }>(),
    };
    heatmapMoto.label = motoLabel;
    heatmapMoto.totalReceita += receita;
    heatmapMoto.totalQtd += qtd;
    const currentCell = heatmapMoto.cells.get(period) || { receita: 0, qtd: 0 };
    currentCell.receita += receita;
    currentCell.qtd += qtd;
    heatmapMoto.cells.set(period, currentCell);
    heatmapMotoMap.set(motoKey, heatmapMoto);
  });

  const melhorPeriodo = Array.from(porPeriodoMap.entries())
    .map(([key, value]) => ({
      key,
      ...value,
    }))
    .sort((a, b) => b.receita - a.receita)[0] || null;

  const rankingMotos = Array.from(porMotoMap.entries())
    .map(([, value]) => ({
      label: value.sku ? `${value.sku} - ${value.nome}` : value.nome,
      value: value.receita,
      note: `${value.qtd} pecas`,
      share: `${(((value.receita || 0) / (totalReceita || 1)) * 100).toFixed(1).replace('.', ',')}% da receita`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const heatmapPeriods = filtAno
    ? Array.from({ length: 12 }, (_, index) => ({
        key: periodKey(Number(filtAno), index + 1),
        label: MESES[index],
      }))
    : Array.from(porPeriodoMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => ({ key, label: value.label }))
        .slice(-12);

  const heatmapRows = Array.from(heatmapMotoMap.values())
    .sort((a, b) => b.totalReceita - a.totalReceita)
    .map((moto) => ({
      label: moto.label,
      note: `${moto.totalQtd} pecas · ${fmt(moto.totalReceita)}`,
      cells: heatmapPeriods.map((period) => {
        const current = moto.cells.get(period.key) || { receita: 0, qtd: 0 };
        return {
          label: period.label,
          value: current.receita,
          note: current.qtd > 0 ? `${current.qtd}p` : '',
        };
      }),
    }));

  const totalMensalRow = {
    label: 'Total do mes',
    note: `${totalQtd} pecas · ${fmt(totalReceita)}`,
    cells: heatmapPeriods.map((period) => {
      const current = porPeriodoMap.get(period.key) || { receita: 0, qtd: 0, label: period.label, mes: 0, ano: 0 };
      return {
        label: period.label,
        value: current.receita,
        displayValue: fmt(current.receita),
        note: current.qtd > 0 ? `${current.qtd}p` : '',
      };
    }),
  };

  const monthlySummaryCards = heatmapPeriods.map((period) => {
    const current = porPeriodoMap.get(period.key) || { receita: 0, qtd: 0, label: period.label, mes: 0, ano: 0 };
    return {
      label: period.label,
      receita: current.receita,
      qtd: current.qtd,
      active: current.receita > 0 || current.qtd > 0,
    };
  });

  const motoMonthlyCards = Array.from(heatmapMotoMap.values())
    .sort((a, b) => b.totalReceita - a.totalReceita)
    .slice(0, isPhone ? 4 : isTabletPortrait ? 6 : 8)
    .map((moto) => ({
      label: moto.label,
      totalReceita: moto.totalReceita,
      totalQtd: moto.totalQtd,
      activeMonths: heatmapPeriods
        .map((period) => {
          const current = moto.cells.get(period.key) || { receita: 0, qtd: 0 };
          return {
            label: period.label,
            receita: current.receita,
            qtd: current.qtd,
          };
        })
        .filter((item) => item.receita > 0 || item.qtd > 0),
    }));

  return (
    <>
      <div style={{ ...cs.topbar, alignItems: isCompact ? 'flex-start' : 'center', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : cs.topbar.padding }}>
        <div>
          <div style={cs.title}>Faturamento por Moto</div>
          <div style={cs.sub}>Receita mensal por moto</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} />
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Receita no filtro', value: fmt(totalReceita), color: 'var(--sage)' },
            { label: 'Pecas vendidas', value: totalQtd.toLocaleString('pt-BR'), color: 'var(--ink)' },
            {
              label: 'Melhor periodo',
              value: melhorPeriodo ? `${MESES[melhorPeriodo.mes - 1]}/${melhorPeriodo.ano}` : '--',
              color: 'var(--amber)',
              sub: melhorPeriodo ? fmt(melhorPeriodo.receita) : '',
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
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(160px, 1fr))', gap: 8, width: isCompact ? '100%' : 'auto' }}>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtMoto} onChange={(e) => setFiltMoto(e.target.value)}>
                <option value="">Todas as motos</option>
                {motos.map((moto) => <option key={moto} value={moto}>{moto}</option>)}
              </select>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtAno} onChange={(e) => setFiltAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <ChartPanel
                title="Painel mensal por moto"
                subtitle="Matriz compacta com todos os meses para comparar a receita liquida entre as motos."
                accent="#f59e0b"
              >
                {shouldUseCompactMonthlyPanel ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    {monthlySummaryCards.length ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isPhone
                            ? '1fr'
                            : isTabletPortrait
                            ? 'repeat(2, minmax(0, 1fr))'
                            : 'repeat(3, minmax(0, 1fr))',
                          gap: 12,
                        }}
                      >
                        {monthlySummaryCards.map((item) => (
                          <div
                            key={item.label}
                            style={{
                              border: `1px solid ${item.active ? 'var(--sage-mid)' : 'var(--border)'}`,
                              background: item.active ? 'var(--sage-light)' : 'var(--white)',
                              borderRadius: 12,
                              padding: isPhone ? 12 : 14,
                            }}
                          >
                            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                              {item.label}
                            </div>
                            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Receita do mes</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: item.active ? 'var(--sage)' : 'var(--gray-400)', ...sensitiveMaskStyle(hidden) }}>
                                  {item.active ? sensitiveText(fmt(item.receita), hidden) : '--'}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Pecas vendidas</div>
                                <div style={{ fontSize: 12, color: 'var(--ink)', ...sensitiveMaskStyle(hidden) }}>
                                  {item.active ? sensitiveText(item.qtd.toLocaleString('pt-BR'), hidden) : '--'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem periodos para exibir.</div>
                    )}

                    {motoMonthlyCards.length ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Motos com resultado no periodo</div>
                        {motoMonthlyCards.map((moto) => (
                          <div key={moto.label} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isPhone ? 12 : 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{moto.label}</div>
                                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>
                                  {sensitiveText(`${moto.totalQtd} pecas • ${fmt(moto.totalReceita)}`, hidden)}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                                gap: 8,
                                marginTop: 12,
                              }}
                            >
                              {moto.activeMonths.length ? moto.activeMonths.map((month) => (
                                <div key={`${moto.label}-${month.label}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--gray-50)' }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', textTransform: 'uppercase' }}>{month.label}</div>
                                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sage)', fontWeight: 700, ...sensitiveMaskStyle(hidden) }}>
                                    {sensitiveText(fmt(month.receita), hidden)}
                                  </div>
                                  <div style={{ marginTop: 3, fontSize: 11, color: 'var(--ink-muted)', ...sensitiveMaskStyle(hidden) }}>
                                    {sensitiveText(`${month.qtd} pecas`, hidden)}
                                  </div>
                                </div>
                              )) : (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>Sem meses ativos para esta moto.</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <HeatmapChart rows={[totalMensalRow, ...heatmapRows]} rowHeaderLabel="Moto" valueFormatter={fmt} emptyText="Sem periodos para exibir." />
                )}
              </ChartPanel>

              <ChartPanel
                title={filtMoto ? `Ranking e participacao de ${filtMoto}` : 'Ranking de motos e participacao na receita'}
                subtitle="Cada linha mostra a receita liquida da moto no filtro atual e sua participacao dentro do total."
                accent="#16a34a"
              >
                <HorizontalBarChart items={rankingMotos} valueFormatter={fmt} emptyText="Sem motos para exibir." />
              </ChartPanel>
            </div>
          )
        ) : (
          <div style={cs.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Relatorio por moto</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{filtered.length} linhas no filtro</div>
            </div>
            {isCompact ? (
              <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                {loading ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
                ) : !filtered.length ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem dados</div>
                ) : filtered.map((item, index) => (
                  <div key={`${item.moto}-${item.ano}-${item.mes}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.moto}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Mes</div>
                        <div style={{ fontSize: 12, color: 'var(--ink)' }}>{MESES_FULL[item.mes - 1]}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Ano</div>
                        <div style={{ fontSize: 12, color: 'var(--ink)' }}>{item.ano}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Receita</div>
                        <div style={{ fontSize: 13, color: 'var(--sage)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaLiq || item.receita || 0)), hidden)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Qtd. pecas</div>
                        <div style={{ fontSize: 12, color: 'var(--ink)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(String(item.qtd), hidden)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>{['Moto', 'Mes', 'Ano', 'Receita', 'Qtd. pecas'].map((header) => <th key={header} style={cs.th}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Sem dados</td></tr>
                    ) : filtered.map((item, index) => (
                      <tr key={`${item.moto}-${item.ano}-${item.mes}-${index}`}>
                        <td style={cs.td}>{item.moto}</td>
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

      {/* ── ABA % ESTOQUE VENDIDO ──────────────────────────────────── */}
      {modo === 'estoque' && (
        <div style={{ marginTop: 18 }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <select
              value={estoqueAnoFilt}
              onChange={e => { setEstoqueAnoFilt(e.target.value); setEstoqueMesFilt(''); }}
              style={cs.sel}
            >
              <option value="">Todos os anos</option>
              {Array.from(new Set((estoqueData?.consolidado || []).map((c: any) => String(c.ano)))).sort().reverse().map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={estoqueMesFilt}
              onChange={e => setEstoqueMesFilt(e.target.value)}
              style={cs.sel}
            >
              <option value="">Todos os meses</option>
              {MESES.map((m, i) => (
                <option key={i + 1} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={estoqueMotoFilt}
              onChange={e => setEstoqueMotoFilt(e.target.value)}
              style={cs.sel}
            >
              <option value="todas">Todas as motos</option>
              {Array.from(new Set((estoqueData?.porMoto || []).map((p: any) => p.moto))).sort().map(m => (
                <option key={String(m)} value={String(m)}>{String(m)}</option>
              ))}
            </select>
          </div>

          {estoqueLoading ? (
            <div style={{ ...cs.card, padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>Calculando percentuais de estoque...</div>
          ) : !estoqueData ? (
            <div style={{ ...cs.card, padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>Sem dados disponíveis</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>

              {/* Consolidado */}
              {estoqueMotoFilt === 'todas' && (
                <div style={cs.card}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Consolidado — Todas as Motos</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>% do valor de estoque vendido a cada mês</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                          {['Mês', 'Estoque início', 'Vendido', '% vendido', 'Qtd peças'].map(h => (
                            <th key={h} style={cs.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {estoqueData.consolidado
                          .filter((c: any) => (!estoqueAnoFilt || String(c.ano) === estoqueAnoFilt) && (!estoqueMesFilt || String(c.mes) === estoqueMesFilt))
                          .map((c: any) => {
                            const pct = c.percentual;
                            const pctColor = pct >= 15 ? '#16a34a' : pct >= 7 ? '#d97706' : '#6b7280';
                            return (
                              <tr key={c.key}>
                                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' as const }}>
                                  {MESES[c.mes - 1]}/{c.ano}
                                </td>
                                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>
                                  {sensitiveText(fmt(c.estoqueInicio), hidden)}
                                </td>
                                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--sage)', ...sensitiveMaskStyle(hidden) }}>
                                  {sensitiveText(fmt(c.vendido), hidden)}
                                </td>
                                <td style={{ ...cs.td }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, maxWidth: 80, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pctColor, borderRadius: 99 }} />
                                    </div>
                                    <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600, color: pctColor, minWidth: 42 }}>
                                      {sensitiveText(`${pct.toFixed(1)}%`, hidden)}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>
                                  {sensitiveText(String(c.qtdVendida), hidden)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalhe por moto */}
              <div style={cs.card}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>
                    {estoqueMotoFilt === 'todas' ? 'Detalhe por Moto' : estoqueMotoFilt}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>% do valor de estoque de cada moto vendido a cada mês</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                      <tr>
                        {(estoqueMotoFilt === 'todas'
                          ? ['Moto', 'Mês', 'Estoque início', 'Vendido', '% vendido', 'Qtd']
                          : ['Mês', 'Estoque início', 'Vendido', '% vendido', 'Qtd']
                        ).map(h => (
                          <th key={h} style={cs.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {estoqueData.porMoto
                        .filter((p: any) =>
                          (estoqueMotoFilt === 'todas' || p.moto === estoqueMotoFilt) &&
                          (!estoqueAnoFilt || String(p.ano) === estoqueAnoFilt) &&
                          (!estoqueMesFilt || String(p.mes) === estoqueMesFilt)
                        )
                        .sort((a: any, b: any) =>
                          a.ano !== b.ano ? a.ano - b.ano :
                          a.mes !== b.mes ? a.mes - b.mes :
                          a.moto.localeCompare(b.moto)
                        )
                        .map((p: any, i: number) => {
                          const pct = p.percentual;
                          const pctColor = pct >= 15 ? '#16a34a' : pct >= 7 ? '#d97706' : '#6b7280';
                          return (
                            <tr key={`${p.motoId}-${p.key}-${i}`}>
                              {estoqueMotoFilt === 'todas' && (
                                <td style={{ ...cs.td, fontSize: 12, maxWidth: 200 }}>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.moto}</div>
                                </td>
                              )}
                              <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' as const }}>
                                {MESES[p.mes - 1]}/{p.ano}
                              </td>
                              <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>
                                {sensitiveText(fmt(p.estoqueInicio), hidden)}
                              </td>
                              <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--sage)', ...sensitiveMaskStyle(hidden) }}>
                                {sensitiveText(fmt(p.vendido), hidden)}
                              </td>
                              <td style={{ ...cs.td }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, maxWidth: 60, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pctColor, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600, color: pctColor, minWidth: 42 }}>
                                    {sensitiveText(`${pct.toFixed(1)}%`, hidden)}
                                  </span>
                                </div>
                              </td>
                              <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>
                                {sensitiveText(String(p.qtdVendida), hidden)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </>
  );
}
