'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const s: any = {
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
  card: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 18px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Inter, sans-serif',
  },
  input: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '8px 11px',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    color: 'var(--gray-800)',
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--gray-500)',
    display: 'block',
    marginBottom: 4,
  },
};

type InventarioResumo = {
  id: number;
  status: string;
  statusLabel: string;
  startedAt: string;
  finishedAt?: string | null;
  totalCaixas: number;
  totalPendentes: number;
  totalConfirmados: number;
  totalDiferencas: number;
  caixasPendentes: number;
  podeFinalizarInventario: boolean;
};

type CaixaResumo = {
  id: number;
  caixa: string;
  status: string;
  statusLabel: string;
  finishedAt?: string | null;
  totalItens: number;
  pendentes: number;
  confirmados: number;
  diferencas: number;
};

type ItemInventario = {
  id: number;
  caixa: string;
  skuBase: string;
  motoId: number | null;
  idPecaReferencia: string | null;
  descricao: string;
  quantidadeEstoque: number;
  status: string;
  tipoDiferenca?: string | null;
  tipoDiferencaLabel?: string | null;
  decidedAt?: string | null;
};

type CaixaDetalhe = {
  caixa: {
    id: number;
    caixa: string;
    status: string;
    statusLabel: string;
    finishedAt?: string | null;
    totalItens: number;
    pendentes: number;
    diferencas: number;
    confirmados: number;
  };
  itensPendentes: ItemInventario[];
  itensConfirmados: ItemInventario[];
  diferencasRegistradas: ItemInventario[];
};

type InventarioLog = {
  id: number;
  status: string;
  statusLabel: string;
  startedAt: string;
  finishedAt?: string | null;
  totalCaixas: number;
  caixasFinalizadas: number;
  totalDiferencas: number;
  diferencas: ItemInventario[];
};

type CaixaLogFilter = 'todos' | 'sucesso' | 'diferenca';

type CaixaHistoricoItem = {
  tipo: 'sucesso' | 'diferenca';
  item: ItemInventario;
};

type InventarioCaixaOpcao = {
  caixa: string;
  totalSkus: number;
  totalPecas: number;
};

type InventarioViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

function inputDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    dataInicio: inputDateString(start),
    dataFim: inputDateString(end),
  };
}

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesCaixaItemSearch(item: ItemInventario, query: string) {
  if (!query) return true;

  const haystack = normalizeSearchText([
    item.skuBase,
    item.idPecaReferencia,
    item.descricao,
  ].join(' '));

  return haystack.includes(query);
}

function compareItemDecisionDesc(a: ItemInventario, b: ItemInventario) {
  const aTime = a.decidedAt ? new Date(a.decidedAt).getTime() : 0;
  const bTime = b.decidedAt ? new Date(b.decidedAt).getTime() : 0;

  if (aTime !== bTime) {
    return bTime - aTime;
  }

  return String(a.skuBase || '').localeCompare(String(b.skuBase || ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function pickPreferredCaixa(caixas: CaixaResumo[], preferredCaixa?: string | null) {
  if (preferredCaixa && caixas.some((caixa) => caixa.caixa === preferredCaixa)) {
    return preferredCaixa;
  }

  return caixas.find((caixa) => caixa.status === 'pendente')?.caixa || caixas[0]?.caixa || '';
}

function DiferencaModal({
  open,
  item,
  loading,
  viewportMode,
  onClose,
  onSelect,
}: {
  open: boolean;
  item: ItemInventario | null;
  loading: boolean;
  viewportMode: InventarioViewportMode;
  onClose: () => void;
  onSelect: (tipo: 'nao_localizado' | 'diferenca_estoque') => void;
}) {
  if (!open || !item) return null;

  const isPhone = viewportMode === 'phone';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: 420, minHeight: isPhone ? '100dvh' : undefined, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: isPhone ? '16px 14px 12px' : '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Registrar diferenca</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{item.skuBase} - {item.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: isPhone ? '18px 14px calc(18px + env(safe-area-inset-bottom))' : '20px 22px' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>
            Escolha o tipo da divergencia encontrada para esse SKU durante a conferencia da caixa.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              onClick={() => onSelect('nao_localizado')}
              disabled={loading}
              style={{ ...s.btn, justifyContent: 'center', background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }}
            >
              Nao Localizado
            </button>
            <button
              onClick={() => onSelect('diferenca_estoque')}
              disabled={loading}
              style={{ ...s.btn, justifyContent: 'center', background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' }}
            >
              Diferenca de Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventarioCaixasSelector({
  caixas,
  caixasSelecionadas,
  loading,
  buscaCaixa,
  viewportMode,
  onBuscaCaixaChange,
  onToggleCaixa,
  onSelectAll,
  onClearSelection,
}: {
  caixas: InventarioCaixaOpcao[];
  caixasSelecionadas: string[];
  loading: boolean;
  buscaCaixa: string;
  viewportMode: InventarioViewportMode;
  onBuscaCaixaChange: (value: string) => void;
  onToggleCaixa: (caixa: string) => void;
  onSelectAll: (caixas: string[]) => void;
  onClearSelection: () => void;
}) {
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const buscaNormalizada = normalizeSearchText(buscaCaixa);
  const caixasFiltradas = caixas.filter((caixa) => (
    !buscaNormalizada || normalizeSearchText(caixa.caixa).includes(buscaNormalizada)
  ));
  const listColumns = isTabletLandscape ? 'repeat(2, minmax(0, 1fr))' : '1fr';
  const listMaxHeight = isPhone ? 'min(38svh, 320px)' : isTabletPortrait ? 320 : 380;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--white)' }}>
      <div style={{ padding: isPhone ? '12px' : '14px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>Selecionar localizacoes</div>
            <div style={{ fontSize: isPhone ? 11.5 : 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.45 }}>
              A caixa <strong>Sem Localizacao</strong> entra automaticamente quando houver pecas sem preenchimento.
            </div>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 999, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 700, color: 'var(--blue-500)' }}>
            {caixasSelecionadas.length} caixa(s) selecionada(s)
          </div>
        </div>

        <input
          style={{ ...s.input, width: '100%' }}
          value={buscaCaixa}
          onChange={(e) => onBuscaCaixaChange(e.target.value)}
          placeholder="Buscar caixa pelo nome"
        />

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, max-content)', gap: 8 }}>
          <button
            onClick={() => onSelectAll(caixasFiltradas.map((caixa) => caixa.caixa))}
            type="button"
            style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', justifyContent: 'center', width: isPhone ? '100%' : undefined }}
          >
            Selecionar visiveis
          </button>
          <button
            onClick={onClearSelection}
            type="button"
            style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', justifyContent: 'center', width: isPhone ? '100%' : undefined }}
          >
            Limpar
          </button>
        </div>
      </div>

      <div
        style={{
          minHeight: isPhone ? 220 : 260,
          maxHeight: listMaxHeight,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: 12,
          display: 'grid',
          gridTemplateColumns: listColumns,
          gap: 10,
          alignContent: 'start',
        }}
      >
        {loading ? (
          <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Carregando localizacoes...</div>
        ) : caixas.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma localizacao disponivel encontrada.</div>
        ) : caixasFiltradas.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma caixa encontrada com esse filtro.</div>
        ) : (
          caixasFiltradas.map((caixa) => {
            const checked = caixasSelecionadas.includes(caixa.caixa);
            return (
              <label
                key={caixa.caixa}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  border: checked ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                  background: checked ? '#eff6ff' : 'var(--white)',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleCaixa(caixa.caixa)}
                  style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer' }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', overflowWrap: 'anywhere' }}>{caixa.caixa}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                    {caixa.totalSkus} SKU(s) · {caixa.totalPecas} peca(s)
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function NovoInventarioModal({
  open,
  loading,
  creating,
  modo,
  caixas,
  caixasSelecionadas,
  viewportMode,
  buscaCaixa,
  onClose,
  onModoChange,
  onBuscaCaixaChange,
  onToggleCaixa,
  onSelectAll,
  onClearSelection,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  creating: boolean;
  modo: 'completo' | 'parcial';
  caixas: InventarioCaixaOpcao[];
  caixasSelecionadas: string[];
  viewportMode: InventarioViewportMode;
  buscaCaixa: string;
  onClose: () => void;
  onModoChange: (modo: 'completo' | 'parcial') => void;
  onBuscaCaixaChange: (value: string) => void;
  onToggleCaixa: (caixa: string) => void;
  onSelectAll: (caixas: string[]) => void;
  onClearSelection: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const totalPecas = caixas.reduce((sum, caixa) => sum + Number(caixa.totalPecas || 0), 0);
  const caixasFiltradas = caixas.filter((caixa) => (
    !normalizeSearchText(buscaCaixa)
      || normalizeSearchText(caixa.caixa).includes(normalizeSearchText(buscaCaixa))
  ));
  const totalSelecionadas = caixasSelecionadas.length;
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const selectionGridColumns = isTabletLandscape ? 'repeat(2, minmax(0, 1fr))' : '1fr';
  const statsGridColumns = isPhone
    ? 'repeat(2, minmax(0, 1fr))'
    : isTabletPortrait
    ? 'repeat(2, minmax(0, 1fr))'
    : 'repeat(4, minmax(0, 1fr))';
  const compactPartialLayout = modo === 'parcial' && (isPhone || isTabletLandscape);
  const useCompactModeSwitcher = modo === 'parcial' && (isPhone || isTabletLandscape);
  const useInnerScrollableList = !isPhone;
  const listMaxHeight = isTabletPortrait ? 360 : 420;
  const listMinHeight = isPhone ? 0 : isTabletPortrait ? 280 : 320;
  const canConfirm = !creating && modo === 'completo'
    ? true
    : caixasSelecionadas.length > 0;
  const partialSectionRef = useRef<HTMLDivElement | null>(null);
  const totalSkus = caixas.reduce((sum, caixa) => sum + Number(caixa.totalSkus || 0), 0);

  useEffect(() => {
    if (!open || modo !== 'parcial' || !partialSectionRef.current) return;
    requestAnimationFrame(() => {
      partialSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }, [modo, open]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : isTabletLandscape ? 16 : 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: isTabletLandscape ? 920 : isTabletPortrait ? 780 : 720, boxShadow: '0 12px 32px rgba(0,0,0,.10)', maxHeight: isPhone ? '100svh' : 'min(88vh, 880px)', minHeight: isPhone ? '100svh' : undefined, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: isPhone ? '16px 14px 12px' : '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>Novo inventario</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              Escolha se vamos contar o estoque completo ou somente localizacoes especificas.
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: isPhone ? '12px 12px 14px' : isTabletPortrait ? '14px 16px' : compactPartialLayout ? '14px 18px' : '18px 22px', overflow: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', display: 'grid', gap: compactPartialLayout ? 12 : 16 }}>
          {useCompactModeSwitcher ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => onModoChange('completo')}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    borderRadius: 12,
                    padding: isPhone ? '10px 12px' : '12px 14px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontSize: isPhone ? 12 : 13,
                    fontWeight: 700,
                    color: 'var(--gray-800)',
                  }}
                >
                  Inventario Completo
                </button>
                <button
                  onClick={() => onModoChange('parcial')}
                  style={{
                    border: modo === 'parcial' ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                    background: modo === 'parcial' ? '#eff6ff' : 'var(--white)',
                    borderRadius: 12,
                    padding: isPhone ? '10px 12px' : '12px 14px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontSize: isPhone ? 12 : 13,
                    fontWeight: 700,
                    color: 'var(--gray-800)',
                  }}
                >
                  Inventario Parcial
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <div style={{ padding: '9px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Caixas</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 5 }}>{caixas.length}</div>
                </div>
                <div style={{ padding: '9px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>SKUs</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 5 }}>{totalSkus}</div>
                </div>
                <div style={{ padding: '9px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Pecas</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 5 }}>{totalPecas}</div>
                </div>
                <div style={{ padding: '9px 10px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Selecionadas</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue-500)', marginTop: 5 }}>{totalSelecionadas}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <button
                  onClick={() => onModoChange('completo')}
                  style={{
                    border: modo === 'completo' ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                    background: modo === 'completo' ? '#eff6ff' : 'var(--white)',
                    borderRadius: 12,
                    padding: compactPartialLayout ? 12 : 16,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Inventario Completo</div>
                  <div style={{ fontSize: compactPartialLayout ? 11.5 : 12, color: 'var(--gray-500)', lineHeight: 1.45 }}>
                    Segue o fluxo atual e monta a contagem com todas as localizacoes disponiveis em estoque.
                  </div>
                </button>

                <button
                  onClick={() => onModoChange('parcial')}
                  style={{
                    border: modo === 'parcial' ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                    background: modo === 'parcial' ? '#eff6ff' : 'var(--white)',
                    borderRadius: 12,
                    padding: compactPartialLayout ? 12 : 16,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Inventario Parcial</div>
                  <div style={{ fontSize: compactPartialLayout ? 11.5 : 12, color: 'var(--gray-500)', lineHeight: 1.45 }}>
                    Permite selecionar uma ou varias localizacoes para contar somente as caixas escolhidas.
                  </div>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: statsGridColumns, gap: 10 }}>
                <div style={{ padding: compactPartialLayout ? 10 : 14, borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Localizacoes</div>
                  <div style={{ fontSize: compactPartialLayout ? 16 : 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{caixas.length}</div>
                </div>
                <div style={{ padding: compactPartialLayout ? 10 : 14, borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>SKUs</div>
                  <div style={{ fontSize: compactPartialLayout ? 16 : 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{totalSkus}</div>
                </div>
                <div style={{ padding: compactPartialLayout ? 10 : 14, borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Pecas</div>
                  <div style={{ fontSize: compactPartialLayout ? 16 : 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{totalPecas}</div>
                </div>
                <div style={{ padding: compactPartialLayout ? 10 : 14, borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Selecionadas</div>
                  <div style={{ fontSize: compactPartialLayout ? 16 : 18, fontWeight: 700, color: 'var(--blue-500)', marginTop: 6 }}>{totalSelecionadas}</div>
                </div>
              </div>
            </>
          )}

          {modo === 'parcial' && (
            <div ref={partialSectionRef}>
              <InventarioCaixasSelector
                caixas={caixas}
                caixasSelecionadas={caixasSelecionadas}
                loading={loading}
                buscaCaixa={buscaCaixa}
                viewportMode={viewportMode}
                onBuscaCaixaChange={onBuscaCaixaChange}
                onToggleCaixa={onToggleCaixa}
                onSelectAll={onSelectAll}
                onClearSelection={onClearSelection}
              />
              <div style={{ display: 'none', padding: isPhone ? '12px' : '14px 16px', borderBottom: '1px solid var(--border)', gap: compactPartialLayout ? 10 : 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>Selecionar localizacoes</div>
                    <div style={{ fontSize: compactPartialLayout ? 11.5 : 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.45 }}>
                      {compactPartialLayout
                        ? <>A caixa <strong>Sem Localizacao</strong> entra automaticamente quando houver pecas sem preenchimento.</>
                        : <>A localizacao <strong>Sem Localizacao</strong> entra como uma caixa propria quando houver pecas disponiveis sem preenchimento.</>}
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', borderRadius: 999, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 700, color: 'var(--blue-500)' }}>
                    {totalSelecionadas} caixa(s) selecionada(s)
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : isTabletLandscape ? 'minmax(0, 1fr) auto auto' : 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={s.label}>Buscar caixa</label>
                    <input
                      style={{ ...s.input, width: '100%' }}
                      value={buscaCaixa}
                      onChange={(e) => onBuscaCaixaChange(e.target.value)}
                      placeholder="Digite o nome da caixa"
                    />
                  </div>
                  <button onClick={() => onSelectAll(caixasFiltradas.map((caixa) => caixa.caixa))} type="button" style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', justifyContent: 'center', width: isPhone ? '100%' : undefined }}>
                    Selecionar visiveis
                  </button>
                  <button onClick={onClearSelection} type="button" style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', justifyContent: 'center', width: isPhone ? '100%' : undefined }}>
                    Limpar
                  </button>
                </div>
              </div>

              <div style={{ display: 'none', minHeight: 0, maxHeight: undefined, overflow: 'visible', WebkitOverflowScrolling: 'touch', padding: 12, gridTemplateColumns: '1fr', gap: 10 }}>
                {loading ? (
                  <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Carregando localizacoes...</div>
                ) : caixas.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma localizacao disponivel encontrada.</div>
                ) : caixasFiltradas.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma caixa encontrada com esse filtro.</div>
                ) : (
                  caixasFiltradas.map((caixa) => {
                    const checked = caixasSelecionadas.includes(caixa.caixa);
                    return (
                      <label
                        key={caixa.caixa}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'flex-start',
                          border: checked ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                          background: checked ? '#eff6ff' : 'var(--white)',
                          borderRadius: 10,
                          padding: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleCaixa(caixa.caixa)}
                          style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', overflowWrap: 'anywhere' }}>{caixa.caixa}</div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                            {caixa.totalSkus} SKU(s) · {caixa.totalPecas} peca(s)
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: isPhone ? '14px 14px calc(14px + env(safe-area-inset-bottom))' : '14px 22px 20px', display: 'flex', flexDirection: isPhone ? 'column-reverse' : 'row', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }}>Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: canConfirm ? 1 : 0.65 }}
          >
            {creating ? 'Criando...' : modo === 'completo' ? 'Iniciar inventario completo' : 'Iniciar inventario parcial'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InventarioPage() {
  const [viewportMode, setViewportMode] = useState<InventarioViewportMode>('desktop');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [novoInventarioOpen, setNovoInventarioOpen] = useState(false);
  const [novoInventarioModo, setNovoInventarioModo] = useState<'completo' | 'parcial'>('completo');
  const [caixasDisponiveis, setCaixasDisponiveis] = useState<InventarioCaixaOpcao[]>([]);
  const [carregandoOpcoesInventario, setCarregandoOpcoesInventario] = useState(false);
  const [caixasSelecionadasInventario, setCaixasSelecionadasInventario] = useState<string[]>([]);
  const [buscaCaixaInventario, setBuscaCaixaInventario] = useState('');
  const [reloading, setReloading] = useState(false);
  const [cancelandoInventario, setCancelandoInventario] = useState(false);
  const [excluindoLogId, setExcluindoLogId] = useState<number | null>(null);
  const [finalizandoCaixa, setFinalizandoCaixa] = useState(false);
  const [finalizandoInventario, setFinalizandoInventario] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [inventario, setInventario] = useState<InventarioResumo | null>(null);
  const [caixas, setCaixas] = useState<CaixaResumo[]>([]);
  const [selectedCaixa, setSelectedCaixa] = useState('');
  const [caixaDetalhe, setCaixaDetalhe] = useState<CaixaDetalhe | null>(null);
  const [buscaCaixa, setBuscaCaixa] = useState('');
  const [buscaItemCaixa, setBuscaItemCaixa] = useState('');
  const [filtroLogCaixa, setFiltroLogCaixa] = useState<CaixaLogFilter>('todos');
  const [logs, setLogs] = useState<InventarioLog[]>([]);
  const [logSelecionado, setLogSelecionado] = useState<InventarioLog | null>(null);
  const [filtroDataInicio, setFiltroDataInicio] = useState(() => defaultDateRange().dataInicio);
  const [filtroDataFim, setFiltroDataFim] = useState(() => defaultDateRange().dataFim);
  const [diferencaItem, setDiferencaItem] = useState<ItemInventario | null>(null);

  function applyInventarioState(payload: any, preferredCaixa?: string | null) {
    const nextInventario = payload?.inventario || null;
    const nextCaixas = Array.isArray(payload?.caixas) ? payload.caixas : [];

    setInventario(nextInventario);
    setCaixas(nextCaixas);

    const nextSelectedCaixa = nextInventario ? pickPreferredCaixa(nextCaixas, preferredCaixa) : '';
    setSelectedCaixa(nextSelectedCaixa);
    if (!nextSelectedCaixa) {
      setCaixaDetalhe(null);
    }
  }

  async function loadAtual(preferredCaixa?: string | null) {
    const data = await api.inventario.atual();
    applyInventarioState(data, preferredCaixa);
  }

  async function loadCaixa(caixa: string, inventarioId: number) {
    const data = await api.inventario.caixa(caixa, inventarioId);
    setCaixaDetalhe({
      caixa: data.caixa,
      itensPendentes: Array.isArray(data.itensPendentes) ? data.itensPendentes : [],
      itensConfirmados: Array.isArray(data.itensConfirmados) ? data.itensConfirmados : [],
      diferencasRegistradas: Array.isArray(data.diferencasRegistradas) ? data.diferencasRegistradas : [],
    });
  }

  async function loadLogs(selectId?: number) {
    const data = await api.inventario.logs({
      dataInicio: filtroDataInicio,
      dataFim: filtroDataFim,
      limit: 50,
    });

    const rows = Array.isArray(data.logs) ? data.logs : [];
    setLogs(rows);

    const targetId = selectId || logSelecionado?.id || rows[0]?.id;
    if (targetId) {
      const detalhe = await api.inventario.log(targetId);
      setLogSelecionado(detalhe.log || null);
    } else {
      setLogSelecionado(null);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([
        loadAtual(selectedCaixa || null),
        loadLogs(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch((e: any) => {
      alert(e.message || 'Erro ao carregar inventario');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!inventario?.id || !selectedCaixa) {
      setCaixaDetalhe(null);
      return;
    }

    loadCaixa(selectedCaixa, inventario.id).catch((e: any) => {
      alert(e.message || 'Erro ao carregar a caixa');
    });
  }, [inventario?.id, selectedCaixa]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncViewportMode = () => {
      if (phoneMedia.matches) {
        setViewportMode('phone');
        return;
      }

      if (tabletPortraitMedia.matches) {
        setViewportMode('tablet-portrait');
        return;
      }

      if (tabletLandscapeMedia.matches) {
        setViewportMode('tablet-landscape');
        return;
      }

      setViewportMode('desktop');
    };

    syncViewportMode();
    phoneMedia.addEventListener('change', syncViewportMode);
    tabletPortraitMedia.addEventListener('change', syncViewportMode);
    tabletLandscapeMedia.addEventListener('change', syncViewportMode);

    return () => {
      phoneMedia.removeEventListener('change', syncViewportMode);
      tabletPortraitMedia.removeEventListener('change', syncViewportMode);
      tabletLandscapeMedia.removeEventListener('change', syncViewportMode);
    };
  }, []);

  async function handleNovoInventario() {
    setCarregandoOpcoesInventario(true);
    setNovoInventarioModo('completo');
    setCaixasSelecionadasInventario([]);
    setBuscaCaixaInventario('');
    setNovoInventarioOpen(true);
    try {
      const data = await api.inventario.opcoes();
      setCaixasDisponiveis(Array.isArray(data.caixas) ? data.caixas : []);
    } catch (e: any) {
      setNovoInventarioOpen(false);
      alert(e.message || 'Erro ao carregar opcoes do inventario');
    }
    setCarregandoOpcoesInventario(false);
  }

  async function handleCriarInventario() {
    setCreating(true);
    try {
      const data = await api.inventario.novo({
        modo: novoInventarioModo,
        caixasSelecionadas: novoInventarioModo === 'parcial' ? caixasSelecionadasInventario : [],
      });
      applyInventarioState(data);
      setNovoInventarioOpen(false);
      setCaixasSelecionadasInventario([]);
      setCaixasDisponiveis([]);
    } catch (e: any) {
      alert(e.message || 'Erro ao iniciar inventario');
    }
    setCreating(false);
  }

  function handleToggleCaixaInventario(caixa: string) {
    setCaixasSelecionadasInventario((current) => (
      current.includes(caixa)
        ? current.filter((item) => item !== caixa)
        : [...current, caixa]
    ));
  }

  async function handleConfirmarItem(itemId: number) {
    setBusyItemId(itemId);
    try {
      await api.inventario.confirmarItem(itemId);
      if (inventario?.id && selectedCaixa) {
        await Promise.all([
          loadAtual(selectedCaixa),
          loadCaixa(selectedCaixa, inventario.id),
        ]);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao confirmar item');
    }
    setBusyItemId(null);
  }

  async function handleRegistrarDiferenca(tipo: 'nao_localizado' | 'diferenca_estoque') {
    if (!diferencaItem) return;

    setBusyItemId(diferencaItem.id);
    try {
      await api.inventario.registrarDiferenca(diferencaItem.id, tipo);
      setDiferencaItem(null);
      if (inventario?.id && selectedCaixa) {
        await Promise.all([
          loadAtual(selectedCaixa),
          loadCaixa(selectedCaixa, inventario.id),
        ]);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao registrar diferenca');
    }
    setBusyItemId(null);
  }

  async function handleFinalizarCaixa() {
    if (!inventario?.id || !selectedCaixa) return;

    setFinalizandoCaixa(true);
    try {
      const data = await api.inventario.finalizarCaixa(selectedCaixa, inventario.id);
      const proximaCaixa = pickPreferredCaixa(Array.isArray(data.caixas) ? data.caixas : [], null);
      applyInventarioState(data, proximaCaixa);
    } catch (e: any) {
      alert(e.message || 'Erro ao finalizar caixa');
    }
    setFinalizandoCaixa(false);
  }

  async function handleFinalizarInventario() {
    if (!inventario?.id) return;

    setFinalizandoInventario(true);
    try {
      await api.inventario.finalizar(inventario.id);
      await loadAtual();
      await loadLogs();
      alert('Inventario finalizado com sucesso.');
    } catch (e: any) {
      alert(e.message || 'Erro ao finalizar inventario');
    }
    setFinalizandoInventario(false);
  }

  async function handleConsultarLogs() {
    setReloading(true);
    try {
      await loadLogs();
    } catch (e: any) {
      alert(e.message || 'Erro ao consultar logs');
    }
    setReloading(false);
  }

  async function handleCancelarInventario() {
    if (!inventario?.id) return;
    if (!confirm(`Cancelar o inventario #${inventario.id}? Isso vai apagar a conferencia atual sem registrar log.`)) return;

    setCancelandoInventario(true);
    try {
      await api.inventario.cancelarAtual();
      setCaixaDetalhe(null);
      setSelectedCaixa('');
      await loadAtual();
      alert('Inventario cancelado com sucesso.');
    } catch (e: any) {
      alert(e.message || 'Erro ao cancelar inventario');
    }
    setCancelandoInventario(false);
  }

  async function handleExcluirLog(logId: number) {
    if (!confirm(`Excluir o log do inventario #${logId}? Essa acao nao pode ser desfeita.`)) return;

    setExcluindoLogId(logId);
    try {
      await api.inventario.excluirLog(logId);
      const nextSelectedId = logSelecionado?.id === logId ? undefined : logSelecionado?.id;
      await loadLogs(nextSelectedId);
    } catch (e: any) {
      alert(e.message || 'Erro ao excluir log do inventario');
    }
    setExcluindoLogId(null);
  }

  const buscaCaixaNormalizada = normalizeSearchText(buscaCaixa);
  const buscaItemCaixaNormalizada = normalizeSearchText(buscaItemCaixa);

  const caixasFiltradas = caixas.filter((caixa) => {
    if (!buscaCaixaNormalizada) return true;
    return normalizeSearchText(caixa.caixa).includes(buscaCaixaNormalizada);
  });

  const itensPendentesFiltrados = (caixaDetalhe?.itensPendentes || []).filter((item) =>
    matchesCaixaItemSearch(item, buscaItemCaixaNormalizada),
  );

  const itensConfirmadosFiltrados = [...(caixaDetalhe?.itensConfirmados || [])]
    .sort(compareItemDecisionDesc)
    .filter((item) => matchesCaixaItemSearch(item, buscaItemCaixaNormalizada));

  const itensDiferencaFiltrados = [...(caixaDetalhe?.diferencasRegistradas || [])]
    .sort(compareItemDecisionDesc)
    .filter((item) => matchesCaixaItemSearch(item, buscaItemCaixaNormalizada));

  const historicoCaixaFiltrado: CaixaHistoricoItem[] = [
    ...itensConfirmadosFiltrados.map((item) => ({ tipo: 'sucesso' as const, item })),
    ...itensDiferencaFiltrados.map((item) => ({ tipo: 'diferenca' as const, item })),
  ]
    .filter((entry) => {
      if (filtroLogCaixa === 'todos') return true;
      return entry.tipo === filtroLogCaixa;
    })
    .sort((a, b) => compareItemDecisionDesc(a.item, b.item));

  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const useStackedSections = isPhone || isTabletPortrait;
  const pagePadding = isPhone ? 14 : isTabletPortrait || isTabletLandscape ? 18 : 28;
  const topbarPadding = isPhone ? '0 14px' : isTabletPortrait || isTabletLandscape ? '0 18px' : '0 28px';
  const summaryColumns = isPhone ? 'repeat(2, minmax(0, 1fr))' : isTabletPortrait ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))';
  const mainColumns = useStackedSections ? '1fr' : isTabletLandscape ? '280px minmax(0, 1fr)' : '320px minmax(0, 1fr)';
  const detailFilterColumns = isPhone ? '1fr' : isTabletPortrait ? '1fr' : isTabletLandscape ? 'minmax(0, 1.3fr) 220px' : 'minmax(0, 1fr) 220px';
  const logsColumns = useStackedSections ? '1fr' : isTabletLandscape ? '300px minmax(0, 1fr)' : '320px minmax(0, 1fr)';
  const itemMetricColumns = isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))';
  const actionLayout = isPhone ? { display: 'grid', gridTemplateColumns: '1fr', gap: 8 } : { display: 'flex', gap: 8, flexWrap: 'wrap' as const };

  if (loading) {
    return (
      <div style={{ padding: pagePadding }}>
        <div style={s.card}>Carregando inventario...</div>
      </div>
    );
  }

  return (
    <>
        <div style={{ ...s.topbar, padding: topbarPadding, minHeight: isPhone ? 72 : s.topbar.height, height: 'auto', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Inventario</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
              Confira caixa por caixa e registre somente as diferencas encontradas
            </div>
          </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!inventario && (
            <button
              onClick={handleNovoInventario}
              disabled={creating}
              style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? 'Criando...' : 'Novo Inventario'}
            </button>
          )}
          {inventario && (
            <button
              onClick={handleCancelarInventario}
              disabled={cancelandoInventario}
              style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', opacity: cancelandoInventario ? 0.7 : 1 }}
            >
              {cancelandoInventario ? 'Cancelando...' : 'Cancelar Inventario'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: pagePadding }}>
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>Conferencia de estoque por caixa</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                O inventario usa a localizacao sincronizada do Bling para separar as pecas por caixa, incluindo <strong>Sem Localizacao</strong> quando houver pecas disponiveis sem preenchimento.
              </div>
            </div>
            {!inventario && (
              <button
                onClick={handleNovoInventario}
                disabled={creating}
                style={{ ...s.btn, background: 'var(--ink)', color: '#fff', opacity: creating ? 0.7 : 1 }}
              >
                {creating ? 'Criando...' : 'Novo Inventario'}
              </button>
            )}
            {inventario?.podeFinalizarInventario && (
              <button
                onClick={handleFinalizarInventario}
                disabled={finalizandoInventario}
                style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: finalizandoInventario ? 0.7 : 1 }}
              >
                {finalizandoInventario ? 'Finalizando...' : 'Finalizar Inventario'}
              </button>
            )}
            {inventario && !inventario.podeFinalizarInventario && (
              <button
                onClick={handleCancelarInventario}
                disabled={cancelandoInventario}
                style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', opacity: cancelandoInventario ? 0.7 : 1 }}
              >
                {cancelandoInventario ? 'Cancelando...' : 'Cancelar Inventario'}
              </button>
            )}
          </div>
        </div>

        {inventario ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: summaryColumns, gap: 12, marginBottom: 12 }}>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Status</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginTop: 6 }}>{inventario.statusLabel}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Iniciado em</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{fmtDateTime(inventario.startedAt)}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Caixas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{inventario.totalCaixas}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>SKUs pendentes</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: inventario.totalPendentes > 0 ? '#c2410c' : 'var(--green)', marginTop: 6 }}>{inventario.totalPendentes}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Confirmados</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{inventario.totalConfirmados}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Diferencas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: inventario.totalDiferencas > 0 ? 'var(--red)' : 'var(--green)', marginTop: 6 }}>{inventario.totalDiferencas}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: mainColumns, gap: 12 }}>
              <div style={s.card}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 12 }}>Caixas para conferencia</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>Buscar caixa</label>
                  <input
                    style={{ ...s.input, width: '100%' }}
                    value={buscaCaixa}
                    onChange={(e) => setBuscaCaixa(e.target.value)}
                    placeholder="Digite o nome da caixa"
                  />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {caixasFiltradas.length === 0 ? (
                    <div style={{ padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                      Nenhuma caixa encontrada com esse filtro.
                    </div>
                  ) : caixasFiltradas.map((caixa) => {
                    const active = caixa.caixa === selectedCaixa;
                    return (
                      <button
                        key={caixa.id}
                        onClick={() => setSelectedCaixa(caixa.caixa)}
                        style={{
                          textAlign: 'left',
                          border: active ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                          background: active ? '#eff6ff' : 'var(--white)',
                          borderRadius: 10,
                          padding: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>{caixa.caixa}</div>
                          <div style={{ fontSize: 11, color: caixa.status === 'pendente' ? '#c2410c' : 'var(--green)', fontWeight: 700 }}>{caixa.statusLabel}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'grid', gap: 4 }}>
                          <div>Total de SKUs: {caixa.totalItens}</div>
                          <div>Pendentes: {caixa.pendentes}</div>
                          <div>Confirmados: {caixa.confirmados}</div>
                          <div>Diferencas: {caixa.diferencas}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={s.card}>
                {!caixaDetalhe ? (
                  <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                    Selecione uma caixa para conferir os produtos do inventario em andamento.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Caixa {caixaDetalhe.caixa.caixa}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                          {caixaDetalhe.caixa.pendentes} SKU(s) pendente(s) de conferencia nesta caixa.
                        </div>
                      </div>
                      <button
                        onClick={handleFinalizarCaixa}
                        disabled={finalizandoCaixa || caixaDetalhe.caixa.pendentes > 0 || caixaDetalhe.caixa.status !== 'pendente'}
                        style={{
                          ...s.btn,
                          background: '#111827',
                          color: '#fff',
                          opacity: finalizandoCaixa || caixaDetalhe.caixa.pendentes > 0 || caixaDetalhe.caixa.status !== 'pendente' ? 0.6 : 1,
                        }}
                      >
                        {finalizandoCaixa ? 'Finalizando...' : 'Finalizar Caixa'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: detailFilterColumns, gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={s.label}>Buscar por descricao, SKU ou ID da peca</label>
                        <input
                          style={{ ...s.input, width: '100%' }}
                          value={buscaItemCaixa}
                          onChange={(e) => setBuscaItemCaixa(e.target.value)}
                          placeholder="Ex: HD01_0121 ou Mangueira"
                        />
                      </div>
                      <div>
                        <label style={s.label}>Filtro do log</label>
                        <select
                          style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                          value={filtroLogCaixa}
                          onChange={(e) => setFiltroLogCaixa(e.target.value as CaixaLogFilter)}
                        >
                          <option value="todos">Sucesso + divergencia</option>
                          <option value="sucesso">So sucesso</option>
                          <option value="diferenca">So divergencia</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {itensPendentesFiltrados.length === 0 ? (
                        <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                          {caixaDetalhe.itensPendentes.length === 0
                            ? 'Todos os SKUs dessa caixa ja foram tratados. Se estiver tudo conferido, finalize a caixa.'
                            : 'Nenhum SKU pendente encontrado com esse filtro.'}
                        </div>
                      ) : (
                        itensPendentesFiltrados.map((item) => {
                          const busy = busyItemId === item.id;
                          return (
                            <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: itemMetricColumns, gap: 12, marginBottom: 14 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>ID Moto</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.motoId ?? '-'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>SKU do de/para</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.skuBase}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>ID da Peca</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.idPecaReferencia || '-'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Quantidade</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.quantidadeEstoque}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>{item.descricao}</div>
                              <div style={actionLayout}>
                                <button
                                  onClick={() => handleConfirmarItem(item.id)}
                                  disabled={busy}
                                  style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: busy ? 0.7 : 1 }}
                                >
                                  {busy ? 'Salvando...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setDiferencaItem(item)}
                                  disabled={busy}
                                  style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', opacity: busy ? 0.7 : 1 }}
                                >
                                  Diferenca
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {(caixaDetalhe.itensConfirmados.length > 0 || caixaDetalhe.diferencasRegistradas.length > 0) && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Log desta caixa</div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                            Sucessos: <strong>{itensConfirmadosFiltrados.length}</strong> · Divergencias: <strong>{itensDiferencaFiltrados.length}</strong>
                          </div>
                        </div>
                        {historicoCaixaFiltrado.length === 0 ? (
                          <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                            Nenhum item tratado encontrado com o filtro atual.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 10 }}>
                            {historicoCaixaFiltrado.map((entry) => {
                              const item = entry.item;
                              const isSuccess = entry.tipo === 'sucesso';
                              return (
                                <div
                                  key={`${entry.tipo}-${item.id}`}
                                  style={{
                                    border: isSuccess ? '1px solid #86efac' : '1px solid #fecaca',
                                    background: isSuccess ? '#dcfce7' : '#fef2f2',
                                    borderRadius: 10,
                                    padding: 14,
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{item.skuBase} - {item.idPecaReferencia || '-'}</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: isSuccess ? 'var(--green)' : 'var(--red)' }}>
                                      {isSuccess ? 'Confirmado' : item.tipoDiferencaLabel || item.tipoDiferenca}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>{item.descricao}</div>
                                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                                    ID Moto: {item.motoId ?? '-'} · Estoque registrado: {item.quantidadeEstoque} · Tratado em {fmtDateTime(item.decidedAt)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Nenhum inventario em andamento</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Clique em <strong>Novo Inventario</strong> para gerar a fila de caixas com base nas pecas disponiveis do sistema, incluindo a caixa <strong>Sem Localizacao</strong> quando necessario.
            </div>
          </div>
        )}

        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Logs de inventarios finalizados</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                Consulte somente as diferencas registradas nos inventarios concluidos por periodo.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={s.label}>Data inicio</label>
                <input style={s.input} type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Data fim</label>
                <input style={s.input} type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
              </div>
              <button
                onClick={handleConsultarLogs}
                disabled={reloading}
                style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: reloading ? 0.7 : 1 }}
              >
                {reloading ? 'Consultando...' : 'Consultar logs'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: logsColumns, gap: 12 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {logs.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                  Nenhum inventario finalizado encontrado nesse periodo.
                </div>
              ) : (
                logs.map((log) => {
                  const active = logSelecionado?.id === log.id;
                  return (
                    <div
                      key={log.id}
                      style={{
                        border: active ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                        background: active ? '#eff6ff' : 'var(--white)',
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          const detalhe = await api.inventario.log(log.id);
                          setLogSelecionado(detalhe.log || null);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            const detalhe = await api.inventario.log(log.id);
                            setLogSelecionado(detalhe.log || null);
                          }
                        }}
                        style={{ textAlign: 'left', cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>
                          Inventario #{log.id}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'grid', gap: 4 }}>
                          <div>Finalizado: {fmtDateTime(log.finishedAt)}</div>
                          <div>Caixas: {log.caixasFinalizadas}/{log.totalCaixas}</div>
                          <div>Diferencas: {log.totalDiferencas}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          onClick={() => handleExcluirLog(log.id)}
                          disabled={excluindoLogId === log.id}
                          style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', padding: '6px 12px', fontSize: 12, opacity: excluindoLogId === log.id ? 0.7 : 1 }}
                        >
                          {excluindoLogId === log.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, minHeight: 180 }}>
              {!logSelecionado ? (
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                  Selecione um inventario finalizado para consultar as divergencias registradas.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Inventario #{logSelecionado.id}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                        Finalizado em {fmtDateTime(logSelecionado.finishedAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      <div>Status: <strong>{logSelecionado.statusLabel}</strong></div>
                      <div>Diferencas: <strong>{logSelecionado.totalDiferencas}</strong></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button
                      onClick={() => handleExcluirLog(logSelecionado.id)}
                      disabled={excluindoLogId === logSelecionado.id}
                      style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', opacity: excluindoLogId === logSelecionado.id ? 0.7 : 1 }}
                    >
                      {excluindoLogId === logSelecionado.id ? 'Excluindo...' : 'Excluir log do inventario'}
                    </button>
                  </div>

                  {logSelecionado.diferencas.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      Esse inventario foi finalizado sem divergencias registradas.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {logSelecionado.diferencas.map((item) => (
                        <div key={item.id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>
                              Caixa {item.caixa} - {item.skuBase}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                              {item.tipoDiferencaLabel || item.tipoDiferenca}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>
                            {item.idPecaReferencia || '-'} - {item.descricao}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                            ID Moto: {item.motoId ?? '-'} · Estoque registrado: {item.quantidadeEstoque} · Marcado em {fmtDateTime(item.decidedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <DiferencaModal
        open={!!diferencaItem}
        item={diferencaItem}
        loading={busyItemId === diferencaItem?.id}
        viewportMode={viewportMode}
        onClose={() => setDiferencaItem(null)}
        onSelect={handleRegistrarDiferenca}
      />
      <NovoInventarioModal
        open={novoInventarioOpen}
        loading={carregandoOpcoesInventario}
        creating={creating}
        modo={novoInventarioModo}
        caixas={caixasDisponiveis}
        caixasSelecionadas={caixasSelecionadasInventario}
        viewportMode={viewportMode}
        buscaCaixa={buscaCaixaInventario}
        onClose={() => {
          if (creating) return;
          setNovoInventarioOpen(false);
          setBuscaCaixaInventario('');
        }}
        onModoChange={(modo) => {
          setNovoInventarioModo(modo);
          if (modo === 'completo') {
            setCaixasSelecionadasInventario([]);
            setBuscaCaixaInventario('');
          }
        }}
        onBuscaCaixaChange={setBuscaCaixaInventario}
        onToggleCaixa={handleToggleCaixaInventario}
        onSelectAll={(caixas) => setCaixasSelecionadasInventario((current) => Array.from(new Set([...current, ...caixas])))}
        onClearSelection={() => setCaixasSelecionadasInventario([])}
        onConfirm={handleCriarInventario}
      />
    </>
  );
}
