'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  grid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  label:  { fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase' as const, marginBottom: 10 },
  val:    { fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, letterSpacing: '-0.5px' },
  sub2:   { fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 },
  mGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  mCard:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, cursor: 'pointer', transition: 'all 150ms' },
};

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DashboardPage() {
  const [dash, setDash]   = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.faturamento.dashboard(), api.motos.list()])
      .then(([d, m]) => { setDash(d); setMotos(m); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <>
      <div style={s.topbar}><div><div style={s.title}>Dashboard</div><div style={s.sub}>Visão geral dos indicadores</div></div></div>
      <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
    </>
  );

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={s.title}>Dashboard</div>
          <div style={s.sub}>Visão geral dos indicadores</div>
        </div>
      </div>
      <div style={{ padding: 28 }}>
        {/* Stats */}
        <div style={s.grid}>
          {[
            { label: '🏍 Motos',          val: dash?.totalMotos,                                    color: 'var(--blue-500)', sub: 'cadastradas' },
            { label: '📦 Total peças',    val: dash?.totalPecas?.toLocaleString('pt-BR'),           color: 'var(--ink)',      sub: `${dash?.totalDisponivel} disp · ${dash?.totalVendidas} vendidas` },
            { label: '💰 Receita bruta',  val: fmt(dash?.receitaBruta||0),                          color: 'var(--amber)',    sub: `líq. ${fmt(dash?.receitaLiq||0)}` },
            { label: '🏷 Em estoque',     val: fmt(dash?.valorEst||0),                              color: 'var(--blue-400)', sub: 'valor Preço ML' },
            { label: '📈 Investido',      val: fmt(dash?.investido||0),                             color: 'var(--ink)',      sub: 'compra das motos' },
            { label: '📊 Lucro operac.',  val: fmt(dash?.lucroOp||0),                               color: (dash?.lucroOp||0) >= 0 ? 'var(--green)' : 'var(--red)', sub: 'receita líq. − CMV − despesas' },
          ].map(c => (
            <div key={c.label} style={s.card}>
              <div style={s.label}>{c.label}</div>
              <div style={{ ...s.val, color: c.color }}>{c.val}</div>
              <div style={s.sub2}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Motos */}
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, marginBottom: 16, letterSpacing: '-0.3px' }}>
          Motos <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', fontWeight: 400 }}>— {motos.length}</span>
        </div>
        <div style={s.mGrid}>
          {motos.map(m => {
            const tot = (m.qtdDisp || 0) + (m.qtdVendidas || 0);
            const pct = tot > 0 ? Math.round((m.qtdVendidas || 0) / tot * 100) : 0;
            const pctRec = m.pctRecuperada || 0;
            return (
              <div key={m.id} style={s.mCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, background: 'var(--gray-100)', color: 'var(--ink-muted)', padding: '2px 7px', borderRadius: 4 }}>
                    ID {m.id} · {m.ano}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', background: pct >= 80 ? 'var(--red-light)' : pct >= 50 ? 'var(--amber-light)' : 'var(--sage-light)', color: pct >= 80 ? 'var(--red)' : pct >= 50 ? 'var(--amber)' : 'var(--sage)', padding: '2px 8px', borderRadius: 99, border: '1px solid', borderColor: pct >= 80 ? '#f5c6c6' : pct >= 50 ? 'var(--amber-mid)' : 'var(--sage-mid)' }}>
                    {pct}% vendido
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'Geist Mono, monospace', marginBottom: 2 }}>{m.marca}</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 12 }}>{m.modelo}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[
                    { l: 'Em estoque', v: m.qtdDisp,              c: 'var(--sage)'  },
                    { l: 'Vendidas',   v: m.qtdVendidas,           c: 'var(--ink)'   },
                    { l: 'Receita',    v: fmt(m.receitaTotal||0),  c: 'var(--amber)', sm: true },
                    { l: 'Lucro prev.',v: fmt(m.lucro||0),         c: (m.lucro||0) >= 0 ? 'var(--sage)' : 'var(--red)', sm: true },
                  ].map(st => (
                    <div key={st.l}>
                      <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', marginBottom: 3 }}>{st.l}</div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: st.sm ? 13 : 16, fontWeight: 500, color: st.c }}>{st.v}</div>
                    </div>
                  ))}
                </div>
                {/* Barra de recuperação do investimento */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Investimento recuperado</span>
                    <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: pctRec >= 100 ? 'var(--sage)' : pctRec >= 50 ? 'var(--amber)' : 'var(--ink-muted)', fontWeight: 600 }}>{pctRec}%</span>
                  </div>
                  <div style={{ width: '100%', height: 4, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pctRec, 100)}%`, height: '100%', background: pctRec >= 100 ? 'var(--sage)' : pctRec >= 50 ? 'var(--amber)' : 'var(--blue-300)', borderRadius: 99, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>{m.qtdVendidas} de {tot} peças vendidas</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
