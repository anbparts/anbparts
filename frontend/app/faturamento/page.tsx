'use client';

import { useEffect, useState } from 'react';
import { ChartPanel, ColumnChart, DonutChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
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
    height: 'var(--topbar-h)',
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

  const motos = Array.from(new Set(data.map((item: any) => item.moto))).sort();
  const anos = Array.from(new Set(data.map((item: any) => item.ano))).sort((a, b) => b - a);

  const filtered = data.filter((item) => (
    (!filtMoto || item.moto === filtMoto) &&
    (!filtAno || item.ano === Number(filtAno))
  ));

  const totalReceita = filtered.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
  const totalQtd = filtered.reduce((sum, item) => sum + Number(item.qtd || 0), 0);
  const melhor = filtered.reduce((best: any, item) => {
    const receitaAtual = Number(item.receitaLiq || item.receita || 0);
    const receitaBest = Number(best?.receitaLiq || best?.receita || 0);
    return receitaAtual > receitaBest ? item : best;
  }, null);

  const porMotoMap = new Map<number, { nome: string; sku: string; receita: number; qtd: number }>();
  const porPeriodoMap = new Map<string, { label: string; receita: number; qtd: number }>();

  filtered.forEach((item) => {
    const motoKey = Number(item.motoId);
    const period = periodKey(item.ano, item.mes);
    const receita = Number(item.receitaLiq || item.receita || 0);
    const qtd = Number(item.qtd || 0);
    const sku = (skuPorMoto[motoKey] || []).join(' · ');

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
    };
    acumuladoPeriodo.receita += receita;
    acumuladoPeriodo.qtd += qtd;
    porPeriodoMap.set(period, acumuladoPeriodo);
  });

  const rankingMotos = Array.from(porMotoMap.entries())
    .map(([, value]) => ({
      label: value.sku ? `${value.sku} · ${value.nome}` : value.nome,
      value: value.receita,
      note: `${value.qtd} pecas`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const participacaoMotos = Array.from(porMotoMap.entries())
    .map(([, value]) => ({
      label: value.sku || value.nome,
      value: value.receita,
      note: `${value.qtd} pecas`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const linhaTempo = Array.from(porPeriodoMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => ({ label: value.label, value: value.receita, note: `${value.qtd} pecas` }))
    .slice(-10);

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Faturamento por Moto</div>
          <div style={cs.sub}>Receita mensal por moto</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} />
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Receita no filtro', value: fmt(totalReceita), color: 'var(--sage)' },
            { label: 'Pecas vendidas', value: totalQtd.toLocaleString('pt-BR'), color: 'var(--ink)' },
            {
              label: 'Melhor periodo',
              value: melhor ? `${MESES[melhor.mes - 1]}/${melhor.ano}` : '--',
              color: 'var(--amber)',
              sub: melhor ? fmt(Number(melhor.receitaLiq || melhor.receita || 0)) : '',
            },
          ].map((card) => (
            <div key={card.label} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ ...cs.card, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={cs.sel} value={filtMoto} onChange={(e) => setFiltMoto(e.target.value)}>
                <option value="">Todas as motos</option>
                {motos.map((moto) => <option key={moto} value={moto}>{moto}</option>)}
              </select>
              <select style={cs.sel} value={filtAno} onChange={(e) => setFiltAno(e.target.value)}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 18 }}>
                <ChartPanel
                  title={filtMoto ? `Performance de ${filtMoto}` : 'Ranking de motos'}
                  subtitle="As motos com maior receita liquida dentro do filtro atual."
                  accent="#16a34a"
                >
                  <HorizontalBarChart items={rankingMotos} valueFormatter={fmt} emptyText="Sem motos para exibir." />
                </ChartPanel>
                <ChartPanel
                  title="Participacao na receita"
                  subtitle="Como a receita se distribui entre as motos filtradas."
                  accent="#2563eb"
                >
                  <DonutChart items={participacaoMotos} totalLabel="Receita" totalDisplay={fmt(totalReceita)} valueFormatter={fmt} emptyText="Sem participacao para mostrar." />
                </ChartPanel>
              </div>

              <ChartPanel
                title="Linha do tempo das vendas"
                subtitle="Evolucao da receita liquida por periodo. O filtro atual altera a serie."
                accent="#f59e0b"
              >
                <ColumnChart items={linhaTempo} valueFormatter={fmt} emptyText="Sem periodos para exibir." />
              </ChartPanel>
            </div>
          )
        ) : (
          <div style={cs.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Relatorio por moto</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{filtered.length} linhas no filtro</div>
            </div>
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
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', color: 'var(--sage)' }}>{fmt(Number(item.receitaLiq || item.receita || 0))}</td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{item.qtd}</td>
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
