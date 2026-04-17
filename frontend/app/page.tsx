'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, useCompanyValueVisibility } from '@/lib/company-values';

const API = API_BASE;
const DASHBOARD_REQUEST_TIMEOUT_MS = 15000;
const DASHBOARD_CONFIG_TIMEOUT_MS = 10000;
const DASHBOARD_CACHE_KEY = 'anbparts.dashboard-cache.v1';

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
  meta: {
    fontSize: 11,
    color: 'var(--ink-soft)',
    marginTop: 6,
    fontFamily: 'Geist Mono, monospace',
    letterSpacing: '0.3px',
  },
  sub2: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 },
  statList: { display: 'grid', gap: 6, marginTop: 10 },
  statRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  statLabel: {
    fontSize: 11,
    color: 'var(--ink-muted)',
    fontFamily: 'Geist Mono, monospace',
    letterSpacing: '0.3px',
  },
  statValue: {
    fontSize: 12,
    color: 'var(--ink)',
    fontFamily: 'Geist Mono, monospace',
    fontWeight: 600,
    letterSpacing: '0.2px',
  },
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

function readDashboardCache() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DASHBOARD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDashboardCache(value: any) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtShareOfPriceML(value: number, totalPriceML: number) {
  if (!Number.isFinite(value) || !Number.isFinite(totalPriceML) || totalPriceML <= 0) {
    return '0,00%';
  }

  return `${((value / totalPriceML) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getCurrentMonthSalesRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    key: `${year}-${month + 1}`,
    dataDe: formatDateInput(firstDay),
    dataAte: formatDateInput(lastDay),
    label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
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

  if (!saldo) {
    return (
      <>
        <div style={{ ...s.val, color: 'var(--ink)' }}>Indisponivel</div>
        <div style={s.sub2}>Nao foi possivel carregar os indicadores do dashboard agora.</div>
      </>
    );
  }

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
            <span style={{ ...s.balanceValue, color: row.color, ...sensitiveMaskStyle(hidden) }}>{row.value}</span>
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

type DashboardViewportMode = 'default' | 'phone' | 'tablet-landscape';

export default function DashboardPage() {
  const [dash, setDash] = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [skuPorMoto, setSkuPorMoto] = useState<Record<number, string[]>>({});
  const [filtroMarcaMoto, setFiltroMarcaMoto] = useState('');
  const [resumoVendasMes, setResumoVendasMes] = useState<any>(null);
  const [loadingResumoVendasMes, setLoadingResumoVendasMes] = useState(true);
  const [periodoResumoVendasMes, setPeriodoResumoVendasMes] = useState(() => getCurrentMonthSalesRange());
  const [visitasML, setVisitasML] = useState<any>(null);
  const { hidden: ocultarValores, toggleRawHidden } = useCompanyValueVisibility();
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardNotice, setDashboardNotice] = useState('');
  const [loadingMotos, setLoadingMotos] = useState(true);
  const [viewportMode, setViewportMode] = useState<DashboardViewportMode>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncViewportMode = () => {
      if (phoneMedia.matches) {
        setViewportMode('phone');
        return;
      }

      if (tabletLandscapeMedia.matches) {
        setViewportMode('tablet-landscape');
        return;
      }

      setViewportMode('default');
    };

    syncViewportMode();
    phoneMedia.addEventListener('change', syncViewportMode);
    tabletLandscapeMedia.addEventListener('change', syncViewportMode);

    return () => {
      phoneMedia.removeEventListener('change', syncViewportMode);
      tabletLandscapeMedia.removeEventListener('change', syncViewportMode);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPeriodoResumoVendasMes((current: any) => {
        const next = getCurrentMonthSalesRange();
        return current.key === next.key ? current : next;
      });
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoadingDashboard(false);
    }, 20000);

    const loadDashboard = async () => {
      try {
        const [dashboardResult, configProdutosResult] = await Promise.allSettled([
          withTimeout(api.faturamento.dashboard(), DASHBOARD_REQUEST_TIMEOUT_MS, 'indicadores'),
          withTimeout(
            fetch(`${API}/bling/config-produtos`).then((response) => (response.ok ? response.json() : { prefixos: [] })),
            DASHBOARD_CONFIG_TIMEOUT_MS,
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

        if (dashboardResult.status === 'fulfilled') {
          setDash(dashboardResult.value);
          writeDashboardCache(dashboardResult.value);
          setDashboardNotice('');
        } else {
          const cachedDashboard = readDashboardCache();
          setDash(cachedDashboard);
          setDashboardNotice(
            cachedDashboard
              ? 'Exibindo a ultima leitura valida do dashboard por causa de uma instabilidade pontual.'
              : 'Os indicadores do dashboard estao indisponiveis no momento. Tente atualizar em alguns instantes.',
          );
        }
        setSkuPorMoto(grouped);

        // Busca visitas do ML hoje (silencioso — não bloqueia o dashboard)
        api.mercadoLivre.visitasHoje().then((v) => { if (!cancelled) setVisitasML(v); }).catch(() => {});
      } catch {
        if (cancelled) return;
        const cachedDashboard = readDashboardCache();
        setDash(cachedDashboard);
        setDashboardNotice(
          cachedDashboard
            ? 'Exibindo a ultima leitura valida do dashboard por causa de uma instabilidade pontual.'
            : 'Os indicadores do dashboard estao indisponiveis no momento. Tente atualizar em alguns instantes.',
        );
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

  useEffect(() => {
    let cancelled = false;

    const loadResumoVendasMes = async () => {
      setLoadingResumoVendasMes(true);
      try {
        const resumo = await withTimeout(
          api.bling.relatorioVendas({
            dataDe: periodoResumoVendasMes.dataDe,
            dataAte: periodoResumoVendasMes.dataAte,
          }),
          15000,
          'resumo de vendas do mes',
        );

        if (cancelled) return;
        if (!resumo?.ok) {
          setResumoVendasMes(null);
          return;
        }
        setResumoVendasMes(resumo);
      } catch {
        if (cancelled) return;
        setResumoVendasMes(null);
      } finally {
        if (!cancelled) setLoadingResumoVendasMes(false);
      }
    };

    loadResumoVendasMes();

    return () => {
      cancelled = true;
    };
  }, [periodoResumoVendasMes.key]);

  if (loadingDashboard) {
    return (
      <>
        <div style={s.topbar}>
          <div>
            <div style={s.title}>Dashboard</div>
            <div style={s.sub}>Visao geral dos indicadores</div>
          </div>
          <DashboardVisibilityButton hidden={ocultarValores} onToggle={() => toggleRawHidden()} />
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
      label: 'Visitas hoje (ML)',
      kind: 'ml-visitas',
      visitasUnicas: visitasML?.visitasUnicas ?? null,
      totalVisitas: visitasML?.totalVisitas ?? null,
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
      label: 'Pecas em estoque',
      val: (dash?.totalDisponivel || 0).toLocaleString('pt-BR'),
      color: 'var(--blue-500)',
      sub: `${dash?.totalIdsDisponiveis || 0} IDs/SKUs-base unicos`,
      details: [
        { label: 'Total de Pecas:', value: (dash?.totalPecas || 0).toLocaleString('pt-BR') },
        { label: 'Vendidas no sistema:', value: (dash?.totalVendidas || 0).toLocaleString('pt-BR') },
        { label: 'Qtd Pecas Prejuizo:', value: (dash?.totalPrejuizo || 0).toLocaleString('pt-BR') },
      ],
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

  const totaisVendasMes = resumoVendasMes?.totaisGerais || {
    totalPedidos: 0,
    totalItens: 0,
    precoML: 0,
    valorTaxas: 0,
    valorFrete: 0,
    valorLiq: 0,
  };

  const cardsVendasMes: Array<{ label: string; value: string; color: string; percentageText?: string | null }> = [
    { label: 'Pedidos', value: String(totaisVendasMes.totalPedidos), color: 'var(--ink)', percentageText: null },
    { label: 'Itens', value: String(totaisVendasMes.totalItens), color: 'var(--ink)', percentageText: null },
    { label: 'Preco ML', value: fmt(totaisVendasMes.precoML), color: 'var(--blue-500)', percentageText: null },
    {
      label: 'Taxas',
      value: fmt(totaisVendasMes.valorTaxas),
      color: 'var(--amber)',
      percentageText: `% Preco Venda: ${fmtShareOfPriceML(totaisVendasMes.valorTaxas, totaisVendasMes.precoML)}`,
    },
    {
      label: 'Frete',
      value: fmt(totaisVendasMes.valorFrete),
      color: 'var(--ink)',
      percentageText: `% Preco Venda: ${fmtShareOfPriceML(totaisVendasMes.valorFrete, totaisVendasMes.precoML)}`,
    },
    {
      label: 'Receita liquida',
      value: fmt(totaisVendasMes.valorLiq),
      color: 'var(--sage)',
      percentageText: `% Preco Venda: ${fmtShareOfPriceML(totaisVendasMes.valorLiq, totaisVendasMes.precoML)}`,
    },
  ];

  const isPhone = viewportMode === 'phone';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const sectionPadding = isPhone ? 14 : isTabletLandscape ? 18 : 28;
  const summaryGridStyle = isPhone
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 24 }
    : isTabletLandscape
    ? { display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 24 }
    : s.grid;
  const salesGridStyle = isPhone
    ? { ...s.grid, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 24 }
    : isTabletLandscape
    ? { ...s.grid, gridTemplateColumns: `repeat(${cardsVendasMes.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 24 }
    : { ...s.grid, marginBottom: 24 };

  const getCardStyle = (card: any) => ({
    ...s.card,
    minWidth: 0,
    padding: isPhone ? '14px 14px' : isTabletLandscape ? '14px 12px' : s.card.padding,
    gridColumn: isPhone && (card.kind === 'mercado-livre-saldo' || card.label === 'Pecas em estoque') ? 'span 2' : undefined,
  });

  const getLabelStyle = () => ({
    ...s.label,
    fontSize: isTabletLandscape ? 9.5 : s.label.fontSize,
    marginBottom: isPhone ? 8 : isTabletLandscape ? 8 : s.label.marginBottom,
  });

  const getValueStyle = (color: string) => ({
    ...s.val,
    color,
    fontSize: isPhone ? 17 : isTabletLandscape ? 16 : s.val.fontSize,
    lineHeight: isPhone || isTabletLandscape ? 1.1 : 1.15,
    letterSpacing: isTabletLandscape ? '-0.35px' : s.val.letterSpacing,
  });

  const getSubStyle = () => ({
    ...s.sub2,
    fontSize: isPhone ? 11 : isTabletLandscape ? 10.5 : s.sub2.fontSize,
    marginTop: isPhone ? 5 : isTabletLandscape ? 4 : s.sub2.marginTop,
    lineHeight: isTabletLandscape ? 1.35 : 1.45,
  });

  const statLabelStyle = {
    ...s.statLabel,
    fontSize: isTabletLandscape ? 10 : s.statLabel.fontSize,
  };

  const statValueStyle = {
    ...s.statValue,
    fontSize: isPhone ? 11.5 : isTabletLandscape ? 11 : s.statValue.fontSize,
  };

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={s.title}>Dashboard</div>
          <div style={s.sub}>Visao geral dos indicadores</div>
        </div>
        <DashboardVisibilityButton hidden={ocultarValores} onToggle={() => toggleRawHidden()} />
      </div>

      <div style={{ padding: sectionPadding }}>
        {dashboardNotice ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--white)',
              color: 'var(--ink-muted)',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {dashboardNotice}
          </div>
        ) : null}

        <div style={summaryGridStyle}>
          {cards.map((card) => (
            <div key={card.label} style={getCardStyle(card)}>
              <div style={getLabelStyle()}>{card.label}</div>
              {card.kind === 'mercado-livre-saldo' ? (
                renderMercadoLivreSaldoCard((card as any).saldo, ocultarValores)
              ) : card.kind === 'ml-visitas' ? (
                <>
                  <div style={{ ...getValueStyle('var(--blue-500)') }}>
                    {(card as any).visitasUnicas === null ? '...' : String((card as any).visitasUnicas)}
                  </div>
                  <div style={getSubStyle()}>visitas unicas hoje</div>
                  {(card as any).totalVisitas !== null && (card as any).totalVisitas !== (card as any).visitasUnicas ? (
                    <div style={{ ...s.statList }}>
                      <div style={s.statRow}>
                        <span style={statLabelStyle}>Total visitas:</span>
                        <span style={statValueStyle}>{(card as any).totalVisitas}</span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div style={{ ...getValueStyle((card as any).color), ...sensitiveMaskStyle(ocultarValores) }}>{(card as any).val}</div>
                  <div style={{ ...getSubStyle(), ...(card.label === 'Pecas em estoque' ? sensitiveMaskStyle(ocultarValores) : {}) }}>{(card as any).sub}</div>
                  {(card as any).details?.length ? (
                    <div style={{ ...s.statList, ...sensitiveMaskStyle(ocultarValores) }}>
                      {(card as any).details.map((detail: any) => (
                        <div key={detail.label} style={s.statRow}>
                          <span style={statLabelStyle}>{detail.label}</span>
                          <span style={statValueStyle}>{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '-0.3px',
              }}
            >
              Vendas do mes
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>
              Resumo automatico de {periodoResumoVendasMes.dataDe.split('-').reverse().join('/')} ate {periodoResumoVendasMes.dataAte.split('-').reverse().join('/')} ({periodoResumoVendasMes.label}).
            </div>
          </div>
        </div>

        {loadingResumoVendasMes ? (
          <div style={salesGridStyle}>
            {['Pedidos', 'Itens', 'Preco ML', 'Taxas', 'Frete', 'Receita liquida'].map((label) => (
              <div key={label} style={{ ...s.card, minWidth: 0, padding: isPhone ? '14px 14px' : isTabletLandscape ? '14px 12px' : s.card.padding }}>
                <div style={getLabelStyle()}>{label}</div>
                <div style={{ ...getValueStyle('var(--ink-muted)') }}>...</div>
                <div style={getSubStyle()}>Carregando resumo do mes atual.</div>
              </div>
            ))}
          </div>
        ) : resumoVendasMes ? (
          <div style={salesGridStyle}>
            {cardsVendasMes.map((card) => (
              <div key={card.label} style={{ ...s.card, minWidth: 0, padding: isPhone ? '14px 14px' : isTabletLandscape ? '14px 12px' : s.card.padding }}>
                <div style={getLabelStyle()}>{card.label}</div>
                <div style={{ ...getValueStyle(card.color), ...sensitiveMaskStyle(ocultarValores) }}>{card.value}</div>
                {card.percentageText ? (
                  <div style={{ ...s.meta, fontSize: isTabletLandscape ? 9.5 : s.meta.fontSize, marginTop: isTabletLandscape ? 4 : s.meta.marginTop, ...sensitiveMaskStyle(ocultarValores) }}>{card.percentageText}</div>
                ) : null}
                <div style={getSubStyle()}>Periodo automatico do mes corrente.</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...s.card, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Vendas do mes indisponiveis</div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              Nao foi possivel carregar o resumo de vendas do mes corrente agora.
            </div>
          </div>
        )}

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
              <span style={sensitiveMaskStyle(ocultarValores)}>
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
                      <span style={sensitiveMaskStyle(ocultarValores)}>ID {moto.id} - {moto.ano}</span>
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
                        <span style={sensitiveMaskStyle(ocultarValores)}>
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
                    <span style={sensitiveMaskStyle(ocultarValores)}>{pctVendida}% vendido</span>
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
                          ...sensitiveMaskStyle(ocultarValores),
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
                        ...sensitiveMaskStyle(ocultarValores),
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
                  <span style={sensitiveMaskStyle(ocultarValores)}>{moto.qtdVendidas} de {totalPecasMoto}</span> pecas vendidas
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
