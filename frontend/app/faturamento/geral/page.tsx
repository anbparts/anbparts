'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtS(v: number) { return v >= 1000 ? 'R$' + (v/1000).toFixed(1).replace('.',',')+'k' : 'R$'+v.toFixed(0); }

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th:     { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)' },
  td:     { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  sel:    { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
};

export default function FaturamentoGeralPage() {
  const [data, setData] = useState<any[]>([]);
  const [filtAno, setFiltAno] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.faturamento.geral().then(d => { setData(d); setLoading(false); });
  }, []);

  const anos = [...new Set(data.map(d => d.ano))].sort();
  const filtered = data.filter(d => !filtAno || d.ano === Number(filtAno));
  const totalR = filtered.reduce((s, d) => s + (d.receitaLiq || d.receita), 0);
  const totalQ = filtered.reduce((s, d) => s + d.qtd, 0);
  const melhor = filtered.reduce((b: any, d) => (d.receitaLiq || d.receita) > ((b?.receitaLiq || b?.receita) || 0) ? d : b, null);

  // month grid
  const monthTotals: Record<number, { receita: number; qtd: number }> = {};
  filtered.forEach(d => {
    if (!monthTotals[d.mes]) monthTotals[d.mes] = { receita: 0, qtd: 0 };
    monthTotals[d.mes].receita += (d.receitaLiq || d.receita);
    monthTotals[d.mes].qtd    += d.qtd;
  });

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Faturamento Geral</div><div style={cs.sub}>Receita total consolidada</div></div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Receita total', v: fmt(totalR), c: 'var(--sage)' },
            { l: 'Peças vendidas', v: totalQ.toLocaleString('pt-BR'), c: 'var(--ink)' },
            { l: 'Melhor mês', v: melhor ? `${MESES[melhor.mes-1]}/${melhor.ano}` : '—', c: 'var(--amber)', sub: melhor ? fmt(melhor.receita) : '' },
          ].map(c => (
            <div key={c.l} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{c.l}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: c.c }}>{c.v}</div>
              {c.sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8, marginBottom: 22 }}>
          {MESES.map((m, i) => {
            const d = monthTotals[i + 1];
            return (
              <div key={m} style={{ background: d ? 'var(--sage-light)' : 'var(--white)', border: `1px solid ${d ? 'var(--sage-mid)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>{m}</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 11, fontWeight: 600, color: d ? 'var(--sage)' : 'var(--gray-300)' }}>{d ? fmtS(d.receita) : '—'}</div>
                {d && <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', marginTop: 2 }}>{d.qtd} pç</div>}
              </div>
            );
          })}
        </div>

        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Detalhamento mensal</div>
            <select style={cs.sel} value={filtAno} onChange={e => setFiltAno(e.target.value)}>
              <option value="">Todos os anos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>{['Mês','Ano','Receita líquida','Qtd. peças'].map(h => <th key={h} style={cs.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Sem dados</td></tr>
                : filtered.map((d, i) => (
                  <tr key={i}>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{MESES_FULL[d.mes - 1]}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{d.ano}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', color: 'var(--sage)' }}>{fmt(d.receitaLiq || d.receita)}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{d.qtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
