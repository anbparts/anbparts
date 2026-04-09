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
  balanceRows: { display: 'grid', gap: 10 },
  balanceRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  balanceName: { fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', letterSpacing: '0.5px', textTransform: 'uppercase' as const },
  balanceValue: { fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 500, letterSpacing: '-0.35px' },
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ao carregar ${label}`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskStyle(hidden: boolean) {
  return hidden
    ? {
        filter: 'blur(6px)',
        userSelect: 'none' as const,
      }
    : {};
}

function DashboardVisibilityButton({
  hidden,
  onToggle,
}: {
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--white)',
        color: 'var(--ink)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
      }}
      title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10.6 10.7C10.2 11.1 10 11.5 10 12a2 2 0 0 0 2 2c.5 0 .9-.2 1.3-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9.4 5.5A10.9 10.9 0 0 1 12 5.2c5.5 0 9.4 4.8 10 5.6.2.3.2.8 0 1.1-.4.6-2.4 3.1-5.4 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6.7 6.8C4.2 8.3 2.5 10.5 2 11.2c-.2.3-.2.8 0 1.1.6.8 4.5 5.6 10 5.6 1 0 2-.2 2.8-.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M2 12s3.8-6.8 10-6.8S22 12 22 12s-3.8 6.8-10 6.8S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          </>
        )}
      </svg>
      {hidden ? 'Mostrar' : 'Ocultar'}
    </button>
  );
}

function renderMercadoLivreSaldoCard(saldo: any, hidden: boolean) {
  const fmtMaybe = (value: any) => (typeof value === 'number' && Number.isFinite(value) ? fmt(value) : '-');

  if (!saldo?.connected) {
    return (
      <>
        <div style={{ ...s.val, color: 'var(--ink)' }}>Nao conectado</div>
        <div style={s.sub2}>Conecte o Mercado Pago em Config. ML para carregar os saldos.</div>
      </>
    );
  }

  if (saldo?.error) {
    return (
      <>
        <div style={{ ...s.val, color: 'var(--ink)' }}>Indisponivel</div>
        <div style={s.sub2}>{saldo.error}</div>
      </>
    );
  }

  const rows = [
    { label: 'Saldo', value: fmtMaybe(saldo?.saldoDisponivel), color: 'var(--sage)' },
  ];

  return (
    <>
      <div style={s.balanceRows}>
        {rows.map((row) => (
          <div key={row.label} style={s.balanceRow}>
            <span style={s.balanceName}>{row.label}</span>
            <span style={{ ...s.balanceValue, color: row.color, ...maskStyle(hidden) }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={s.sub2}>
        {false
          ? saldo?.observacao || 'Nem todos os relatórios do Mercado Pago estao disponiveis ainda.'
          : false
          ? 'Saldo antecipavel estimado a partir do dinheiro ainda no prazo de liberacao.'
          : 'Saldos consultados na conta Mercado Pago conectada.'}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const [dash, setDash] = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [skuPorMoto, setSkuPorMoto] = useState<Record<number, string[]>>({});
  const [filtroMarcaMoto, setFiltroMarcaMoto] = useState('');
  const [ocultarValores, setOcultarValores] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingMotos, setLoadingMotos] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOcultarValores(window.localStorage.getItem('dashboard-hide-values') === '1');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('dashboard-hide-values', ocultarValores ? '1' : '0');
  }, [ocultarValores]);

  useEffect(() => {
    let cancelled = false;
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoadingDashboard(false);
    }, 20000);

    const loadDashboard = async () => {
      try {
        const [dashboardResult, configProdutosResult] = await Promise.allSettled([
          withTimeout(api.faturamento.dashboard(), 10000, 'indicadores'),
          withTimeout(
            fetch(`${API}/bling/config-produtos`).then((response) => (response.ok ? response.json() : { prefixos: [] })),
            10000,
            'configuracao de produtos',
          ),
        ]);

        if (cancelled) return;

        const grouped: Record<number, string[]> = {};
        const configProdutos = configProdutosResult.status === 'fulfilled' ? configProdutosResult.value : { prefixos: [] };

        for (const item of configProdutos?.prefixos || []) {
          const motoId = Number(item?.motoId);
          const prefixo = String(item?.prefixo || '').trim();
          if (!motoId || !prefixo) continue;
          if (!grouped[motoId]) grouped[motoId] = [];
          if (!grouped[motoId].includes(prefixo)) grouped[motoId].push(prefixo);
        }

        setDash(dashboardResult.status === 'fulfilled' ? dashboardResult.value : null);
        setSkuPorMoto(grouped);
      } catch {
        if (cancelled) return;
        setDash(null);
        setSkuPorMoto({});
      } finally {
        clearTimeout(failsafe);
        if (!cancelled) setLoadingDashboard(false);
      }
    };

    const loadMotos = async () => {
      try {
        const listaMotos = await withTimeout(api.motos.list(), 15000, 'motos');
        if (cancelled) return;
        setMotos(Array.isArray(listaMotos) ? listaMotos : []);
      } catch {
        if (cancelled) return;
        setMotos([]);
      } finally {
        if (!cancelled) setLoadingMotos(false);
      }
    };

    loadDashboard();
    loadMotos();

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
    };
  }, []);

  if (loadingDashboard) {
    return (
      <>
        <div style={s.topbar}>
          <div>
            <div style={s.title}>Dashboard</div>
            <div style={s.sub}>Visao geral dos indicadores</div>
          </div>
          <DashboardVisibilityButton hidden={ocultarValores} onToggle={() => setOcultarValores((current) => !current)} />
        </div>
        <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  const cards: any[] = [
    {
      label: 'Mercado Pago',
      kind: 'mercado-livre-saldo',
      saldo: dash?.mercadoLivreSaldo || null,
    },
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

  const marcasMotos = Array.from(new Set(
    motos
      .map((moto) => String(moto?.marca || '').trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const motosFiltradas = filtroMarcaMoto
    ? motos.filter((moto) => String(moto?.marca || '').trim() === filtroMarcaMoto)
    : motos;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={s.title}>Dashboard</div>
          <div style={s.sub}>Visao geral dos indicadores</div>
        </div>
        <DashboardVisibilityButton hidden={ocultarValores} onToggle={() => setOcultarValores((current) => !current)} />
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.grid}>
          {cards.map((card) => (
            <div key={card.label} style={s.card}>
              <div style={s.label}>{card.label}</div>
              {card.kind === 'mercado-livre-saldo' ? (
                renderMercadoLivreSaldoCard((card as any).saldo, ocultarValores)
              ) : (
                <>
                  <div style={{ ...s.val, color: (card as any).color, ...maskStyle(ocultarValores) }}>{(card as any).val}</div>
                  <div style={{ ...s.sub2, ...(card.label === 'Total de pecas' || card.label === 'Pecas em estoque' ? maskStyle(ocultarValores) : {}) }}>{(card as any).sub}</div>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: 16,
              fontWeight: 600,
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
              <span style={maskStyle(ocultarValores)}>
                - {loadingMotos ? '...' : motosFiltradas.length}{!loadingMotos && filtroMarcaMoto ? ` de ${motos.length}` : ''}
              </span>
            </span>
          </div>

          {!loadingMotos && (
            <select
              value={filtroMarcaMoto}
              onChange={(event) => setFiltroMarcaMoto(event.target.value)}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                color: 'var(--ink)',
                cursor: 'pointer',
                minWidth: 180,
              }}
            >
              <option value="">Todas as marcas</option>
              {marcasMotos.map((marca) => (
                <option key={marca} value={marca}>{marca}</option>
              ))}
            </select>
          )}
        </div>

        {loadingMotos ? (
          <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Carregando motos...</div>
        ) : (
          <div style={s.mGrid}>
            {motosFiltradas.map((moto) => {
            const totalPecasMoto = (moto.qtdDisp || 0) + (moto.qtdVendidas || 0);
            const pctVendida = totalPecasMoto > 0 ? Math.round(((moto.qtdVendidas || 0) / totalPecasMoto) * 100) : 0;
            const pctRecuperada = moto.pctRecuperada || 0;
            const pctLucroPrev = (moto.precoCompra || 0) > 0 ? ((moto.lucro || 0) / moto.precoCompra) * 100 : 0;
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
                      <span style={maskStyle(ocultarValores)}>ID {moto.id} - {moto.ano}</span>
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
                        <span style={maskStyle(ocultarValores)}>
                          {skus.length === 1 ? `SKU ${skus[0]}` : `SKUs ${skus.join(' - ')}`}
                        </span>
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
                    <span style={maskStyle(ocultarValores)}>{pctVendida}% vendido</span>
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
                    {
                      label: '% lucro prev.',
                      value: `${pctLucroPrev.toFixed(1).replace('.', ',')}%`,
                      color: pctLucroPrev >= 0 ? 'var(--sage)' : 'var(--red)',
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
                          ...maskStyle(ocultarValores),
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
                        ...maskStyle(ocultarValores),
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
                  <span style={maskStyle(ocultarValores)}>{moto.qtdVendidas} de {totalPecasMoto}</span> pecas vendidas
                </div>
              </div>
            );
            })}
            {!motosFiltradas.length && (
              <div style={{ ...s.card, color: 'var(--ink-muted)', fontSize: 13 }}>
                Nenhuma moto encontrada para a marca selecionada.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
