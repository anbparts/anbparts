'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th:     { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const },
  td:     { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  sel:    { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
};

export default function FaturamentoMotoPage() {
  const [data, setData]   = useState<any[]>([]);
  const [filtMoto, setFiltMoto] = useState('');
  const [filtAno,  setFiltAno]  = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.faturamento.porMoto().then(d => { setData(d); setLoading(false); });
  }, []);

  const motos = Array.from(new Set(data.map((d: any) => d.moto))).sort();
  const anos  = Array.from(new Set(data.map((d: any) => d.ano))).sort();
  const filtered = data.filter(d =>
    (!filtMoto || d.moto === filtMoto) && (!filtAno || d.ano === Number(filtAno))
  );
  const totalR = filtered.reduce((s, d) => s + (d.receitaLiq || d.receita), 0);
  const totalQ = filtered.reduce((s, d) => s + d.qtd, 0);
  const melhor = filtered.reduce((b: any, d) => (d.receitaLiq || d.receita) > ((b?.receitaLiq || b?.receita) || 0) ? d : b, null);

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Faturamento por Moto</div><div style={cs.sub}>Receita mensal por moto</div></div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Receita (filtro)', v: fmt(totalR), c: 'var(--sage)' },
            { l: 'Peças vendidas',   v: totalQ.toLocaleString('pt-BR'), c: 'var(--ink)' },
            { l: 'Melhor mês',       v: melhor ? `${MESES[melhor.mes-1]}/${melhor.ano}` : '—', c: 'var(--amber)', sub: melhor ? fmt(melhor.receita) : '' },
          ].map(c => (
            <div key={c.l} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{c.l}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: c.c }}>{c.v}</div>
              {c.sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Faturamento por moto</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={cs.sel} value={filtMoto} onChange={e => setFiltMoto(e.target.value)}>
                <option value="">Todas as motos</option>
                {motos.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select style={cs.sel} value={filtAno} onChange={e => setFiltAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>{['Moto','Mês','Ano','Receita','Qtd. peças'].map(h => <th key={h} style={cs.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={5} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Sem dados</td></tr>
                : filtered.map((d, i) => (
                  <tr key={i}>
                    <td style={cs.td}>{d.moto}</td>
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
