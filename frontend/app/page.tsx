'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const s: any = {
  topbar: {
    height: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
  },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  label: {
    fontSize: 11,
    fontFamily: 'Geist Mono, monospace',
    color: 'var(--ink-muted)',
    letterSpacing: '0.6px',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  val: { fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, letterSpacing: '-0.5px' },
  sub2: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 },
  mGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  mCard: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 18,
    cursor: 'pointer',
    transition: 'all 150ms',
  },
};

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DashboardPage() {
  const [dash, setDash] = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [skuPorMoto, setSkuPorMoto] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.faturamento.dashboard(),
      api.motos.list(),
      fetch(`${API}/bling/config-produtos`)
        .then((response) => (response.ok ? response.json() : { prefixos: [] }))
        .catch(() => ({ prefixos: [] })),
    ])
      .then(([dashboard, listaMotos, configProdutos]) => {
        const grouped: Record<number, string[]> = {};

        for (const item of configProdutos?.prefixos || []) {
          const motoId = Number(item?.motoId);
          const prefixo = String(item?.prefixo || '').trim();
          if (!motoId || !prefixo) continue;
          if (!grouped[motoId]) grouped[motoId] = [];
          if (!grouped[motoId].includes(prefixo)) grouped[motoId].push(prefixo);
        }

        setDash(dashboard);
        setMotos(listaMotos);
        setSkuPorMoto(grouped);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div>
            <div style={s.title}>Dashboard</div>
            <div style={s.sub}>Visao geral dos indicadores</div>
          </div>
        </div>
        <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  const cards = [
    {
      label: 'Receita bruta',
      val: fmt(dash?.receitaBruta || 0),
      color: 'var(--amber)',
      sub: 'total vendido no preco ML',
    },
    {
      label: 'Receita liquida',
      val: fmt(dash?.receitaLiq || 0),
      color: 'var(--sage)',
      sub: 'valor vendido apos taxas e frete',
    },
    {
      label: 'Em estoque bruto',
      val: fmt(dash?.valorEst || 0),
      color: 'var(--blue-400)',
      sub: 'soma do preco ML das pecas em estoque',
    },
    {
      label: 'Em estoque liquido',
      val: fmt(dash?.valorEstLiq || 0),
      color: 'var(--sage)',
      sub: 'soma do valor liquido das pecas em estoque',
    },
    {
      label: 'Total de pecas',
      val: (dash?.totalPecas || 0).toLocaleString('pt-BR'),
      color: 'var(--ink)',
      sub: `${dash?.totalVendidas || 0} vendidas no sistema`,
    },
    {
      label: 'Pecas em estoque',
      val: (dash?.totalDisponivel || 0).toLocaleString('pt-BR'),
      color: 'var(--blue-500)',
      sub: `${dash?.totalIdsDisponiveis || 0} IDs/SKUs-base unicos`,
    },
  ];

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={s.title}>Dashboard</div>
          <div style={s.sub}>Visao geral dos indicadores</div>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.grid}>
          {cards.map((card) => (
            <div key={card.label} style={s.card}>
              <div style={s.label}>{card.label}</div>
              <div style={{ ...s.val, color: card.color }}>{card.val}</div>
              <div style={s.sub2}>{card.sub}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            fontFamily: 'Fraunces, serif',
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 16,
            letterSpacing: '-0.3px',
          }}
        >
          Motos{' '}
          <span
            style={{
              fontSize: 13,
              color: 'var(--ink-muted)',
              fontFamily: 'Geist, sans-serif',
              fontWeight: 400,
            }}
          >
            - {motos.length}
          </span>
        </div>

        <div style={s.mGrid}>
          {motos.map((moto) => {
            const totalPecasMoto = (moto.qtdDisp || 0) + (moto.qtdVendidas || 0);
            const pctVendida = totalPecasMoto > 0 ? Math.round(((moto.qtdVendidas || 0) / totalPecasMoto) * 100) : 0;
            const pctRecuperada = moto.pctRecuperada || 0;
            const skus = skuPorMoto[moto.id] || [];

            return (
              <div key={moto.id} style={s.mCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'Geist Mono, monospace',
                        fontSize: 10,
                        background: 'var(--gray-100)',
                        color: 'var(--ink-muted)',
                        padding: '2px 7px',
                        borderRadius: 4,
                      }}
                    >
                      ID {moto.id} - {moto.ano}
                    </span>
                    {skus.length > 0 && (
                      <span
                        style={{
                          fontFamily: 'Geist Mono, monospace',
                          fontSize: 10,
                          background: 'var(--blue-100)',
                          color: 'var(--blue-500)',
                          padding: '2px 7px',
                          borderRadius: 4,
                        }}
                      >
                        {skus.length === 1 ? `SKU ${skus[0]}` : `SKUs ${skus.join(' - ')}`}
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'Geist Mono, monospace',
                      background:
                        pctVendida >= 80 ? 'var(--red-light)' : pctVendida >= 50 ? 'var(--amber-light)' : 'var(--sage-light)',
                      color: pctVendida >= 80 ? 'var(--red)' : pctVendida >= 50 ? 'var(--amber)' : 'var(--sage)',
                      padding: '2px 8px',
                      borderRadius: 99,
                      border: '1px solid',
                      borderColor: pctVendida >= 80 ? '#f5c6c6' : pctVendida >= 50 ? 'var(--amber-mid)' : 'var(--sage-mid)',
                    }}
                  >
                    {pctVendida}% vendido
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    fontFamily: 'Geist Mono, monospace',
                    marginBottom: 2,
                  }}
                >
                  {moto.marca}
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 12 }}>
                  {moto.modelo}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[
                    { label: 'Em estoque', value: moto.qtdDisp, color: 'var(--sage)' },
                    { label: 'Vendidas', value: moto.qtdVendidas, color: 'var(--ink)' },
                    { label: 'Preco compra', value: fmt(moto.precoCompra || 0), color: 'var(--blue-500)', sm: true },
                    { label: 'Receita liq.', value: fmt(moto.vlVendidas || 0), color: 'var(--amber)', sm: true },
                    {
                      label: 'Lucro prev.',
                      value: fmt(moto.lucro || 0),
                      color: (moto.lucro || 0) >= 0 ? 'var(--sage)' : 'var(--red)',
                      sm: true,
                    },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', marginBottom: 3 }}>
                        {stat.label}
                      </div>
                      <div
                        style={{
                          fontFamily: 'Fraunces, serif',
                          fontSize: stat.sm ? 13 : 16,
                          fontWeight: 500,
                          color: stat.color,
                        }}
                      >
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
                      Investimento recuperado
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'Geist Mono, monospace',
                        color: pctRecuperada >= 100 ? 'var(--sage)' : pctRecuperada >= 50 ? 'var(--amber)' : 'var(--ink-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {pctRecuperada}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 4, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(pctRecuperada, 100)}%`,
                        height: '100%',
                        background: pctRecuperada >= 100 ? 'var(--sage)' : pctRecuperada >= 50 ? 'var(--amber)' : 'var(--blue-300)',
                        borderRadius: 99,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
                  {moto.qtdVendidas} de {totalPecasMoto} pecas vendidas
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
