'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartPanel, HeatmapChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const currentYear = String(new Date().getFullYear());

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DespesasReceitaPage() {
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [filtroAno, setFiltroAno] = useState(currentYear);
  const [filtroMes, setFiltroMes] = useState('');
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    api.financeiro.despesasReceita({
      ano: filtroAno,
      ...(filtroMes ? { mes: filtroMes } : {}),
    }).then(setPayload).finally(() => setLoading(false));
  }, [filtroAno, filtroMes]);

  const months = Array.isArray(payload?.months) ? payload.months : [];
  const totals = payload?.totals || {
    receitaBruta: 0,
    taxasMl: 0,
    fretePago: 0,
    despesasGerais: 0,
    totalSaidas: 0,
    resultadoBruto: 0,
  };

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

    return [
      buildRow('Receita bruta', 'receitaBruta', 'Base bruta das vendas por mes'),
      buildRow('Taxas ML', 'taxasMl', 'Destaque das taxas cobradas pelo Mercado Livre'),
      buildRow('Frete pago', 'fretePago', 'Frete vinculado as vendas do periodo'),
      buildRow('Despesas gerais', 'despesasGerais', 'Despesas cadastradas no periodo'),
      buildRow('Saidas totais', 'totalSaidas', 'Taxas + frete + despesas gerais'),
      buildRow('Resultado bruto', 'resultadoBruto', 'Receita bruta menos as saidas do periodo'),
    ];
  }, [months]);

  const anosDisponiveis = useMemo(() => {
    const current = Number(filtroAno) || new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => current - index);
  }, [filtroAno]);

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Despesas x Receita</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Comparativo mensal entre receita bruta, taxas, frete e despesas gerais</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} />
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Receita bruta', value: totals.receitaBruta, color: 'var(--blue-500)' },
            { label: 'Taxas + frete', value: totals.taxasMl + totals.fretePago, color: 'var(--amber)' },
            { label: 'Despesas gerais', value: totals.despesasGerais, color: 'var(--red)' },
            { label: 'Resultado bruto', value: totals.resultadoBruto, color: totals.resultadoBruto >= 0 ? 'var(--green)' : 'var(--red)' },
          ].map((card) => (
            <div key={card.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{fmt(card.value)}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', cursor: 'pointer' }} value={filtroAno} onChange={(event) => setFiltroAno(event.target.value)}>
                {anosDisponiveis.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
              </select>
              <select style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', cursor: 'pointer' }} value={filtroMes} onChange={(event) => setFiltroMes(event.target.value)}>
                <option value="">Todos os meses</option>
                {MESES.map((mes, index) => <option key={mes} value={String(index + 1)}>{mes}</option>)}
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, color: 'var(--ink-muted)' }}>Carregando comparativo...</div>
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
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
              Relatorio mensal
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Mes', 'Receita bruta', 'Taxas ML', 'Frete pago', 'Despesas gerais', 'Saidas totais', 'Resultado bruto'].map((header) => (
                      <th key={header} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--ink-muted)' }}>Carregando...</td></tr>
                  ) : !months.length ? (
                    <tr><td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--ink-muted)' }}>Sem dados para o periodo selecionado.</td></tr>
                  ) : months.map((item: any) => (
                    <tr key={`${item.ano}-${item.mes}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{MESES[(item.mes || 1) - 1]}/{item.ano}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--blue-500)', fontFamily: 'Geist Mono, monospace' }}>{fmt(Number(item.receitaBruta || 0))}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--amber)', fontFamily: 'Geist Mono, monospace' }}>{fmt(Number(item.taxasMl || 0))}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--amber)', fontFamily: 'Geist Mono, monospace' }}>{fmt(Number(item.fretePago || 0))}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--red)', fontFamily: 'Geist Mono, monospace' }}>{fmt(Number(item.despesasGerais || 0))}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'Geist Mono, monospace' }}>{fmt(Number(item.totalSaidas || 0))}</td>
                      <td style={{ padding: '10px 14px', color: Number(item.resultadoBruto || 0) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'Geist Mono, monospace', fontWeight: 700 }}>{fmt(Number(item.resultadoBruto || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
